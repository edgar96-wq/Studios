package com.crewstudio.app;

import android.content.Context;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Microsoft Graph calls for OneDrive, done in Java with the MSAL token. Every path is checked to be inside
 * GAIA/Jobs: nothing else in the OneDrive is ever read or changed.
 */
final class Graph {
    static final String ROOT = "GAIA/Jobs";
    private static final String API = "https://graph.microsoft.com/v1.0";
    private static final long SIMPLE_MAX = 4L * 1024 * 1024;         // simple PUT up to 4 MB
    private static final int CHUNK = 320 * 1024 * 16;                // 5 MB, a multiple of 320 KB as Graph requires

    private Graph() { }

    /* ---------------- the GAIA/Jobs fence ---------------- */
    /** "GAIA/Jobs/B-1/field/x.txt" stays; anything outside GAIA/Jobs, or with "..", is refused. */
    static String safe(String path) throws Ms.Fail {
        if (path == null) throw new Ms.Fail("error", "no path");
        String p = path.replace('\\', '/').trim();
        while (p.startsWith("/")) p = p.substring(1);
        String[] parts = p.split("/");
        for (String s : parts) if (s.isEmpty() || s.equals(".") || s.equals("..")) throw new Ms.Fail("error", "bad path: " + path);
        if (!(p.equals(ROOT) || p.startsWith(ROOT + "/"))) throw new Ms.Fail("error", "Crew Studio only works inside " + ROOT);
        return p;
    }

    private static String jobId(String id) throws Ms.Fail {
        if (id == null || id.isEmpty() || id.contains("/") || id.contains("\\") || id.equals(".") || id.equals("..")) throw new Ms.Fail("error", "bad job id");
        return id;
    }

    /** /me/drive/root:/GAIA/Jobs/… with each part encoded (no trailing colon) */
    private static String item(String safePath) {
        StringBuilder b = new StringBuilder("/me/drive/root:");
        for (String s : safePath.split("/")) b.append('/').append(Uri.encode(s));
        return b.toString();
    }

    /* ---------------- the four calls the page uses ---------------- */
    /**
     * Job folders in GAIA/Jobs with their job.json eTag (20 per $batch round trip). job.json itself is downloaded
     * only for folders whose eTag differs from what the page already has ({@code known}: id → eTag).
     * Returns [{name, etag, json}] — json is null when unchanged, etag null when the folder has no job.json.
     */
    static JSONArray listJobs(Context c, JSONObject known) throws IOException, JSONException {
        Http h = new Http(c);
        List<String> names = new ArrayList<>();
        String url = API + item(ROOT) + ":/children?$select=name,folder&$top=999";
        while (url != null) {
            Resp r = h.call("GET", url, null, null);
            if (r.code == 404) throw new Ms.Fail("nofolder", "There is no " + ROOT + " folder in this OneDrive");
            r.check();
            JSONObject d = r.json();
            JSONArray v = d.optJSONArray("value");
            for (int i = 0; v != null && i < v.length(); i++) if (v.getJSONObject(i).has("folder")) names.add(v.getJSONObject(i).getString("name"));
            url = d.optString("@odata.nextLink", "");
            if (url.isEmpty() || !url.startsWith(API)) url = null;
        }
        String[] tags = new String[names.size()];
        for (int i = 0; i < names.size(); i += 20) {
            JSONArray reqs = new JSONArray();
            for (int k = i; k < Math.min(names.size(), i + 20); k++)
                reqs.put(new JSONObject().put("id", String.valueOf(k)).put("method", "GET")
                        .put("url", item(ROOT + "/" + names.get(k) + "/job.json").substring(1) + "?$select=eTag,lastModifiedDateTime"));
            Resp r = h.call("POST", API + "/$batch", new JSONObject().put("requests", reqs).toString().getBytes(StandardCharsets.UTF_8), "application/json");
            r.check();
            JSONArray rs = r.json().optJSONArray("responses");
            for (int x = 0; rs != null && x < rs.length(); x++) {
                JSONObject o = rs.getJSONObject(x), body = o.optJSONObject("body");
                if (o.optInt("status") == 200 && body != null) tags[Integer.parseInt(o.getString("id"))] = body.optString("eTag", body.optString("lastModifiedDateTime"));
            }
        }
        JSONArray out = new JSONArray();
        for (int i = 0; i < names.size(); i++) {
            String name = names.get(i), tag = tags[i];
            JSONObject e = new JSONObject().put("name", name).put("etag", tag == null ? JSONObject.NULL : tag);
            if (tag != null && !tag.equals(known == null ? null : known.optString(name, null))) {
                String txt = read(h, ROOT + "/" + name + "/job.json");
                e.put("json", txt == null ? JSONObject.NULL : txt);
            } else e.put("json", JSONObject.NULL);
            out.put(e);
        }
        return out;
    }

    /** Text of a file in GAIA/Jobs, or null when it isn't there. */
    static String readFile(Context c, String path) throws IOException { return read(new Http(c), safe(path)); }

    private static String read(Http h, String safePath) throws IOException {
        Resp r = h.call("GET", API + item(safePath) + ":/content", null, null);
        if (r.code == 404) return null;
        r.check();
        return r.text();
    }

    /** Put a local file at GAIA/Jobs/<id>/field/<name> (replacing an older one). Returns the item id. */
    static String uploadFile(Context c, File local, String path, String mime) throws IOException, JSONException {
        String p = safe(path);
        Http h = new Http(c);
        long size = local.length();
        if (size <= SIMPLE_MAX) {
            Resp r = h.call("PUT", API + item(p) + ":/content", readAll(local), mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
            r.check();
            return r.json().optString("id");
        }
        // large files (photos, PDFs): an upload session, 5 MB at a time
        Resp s = h.call("POST", API + item(p) + ":/createUploadSession",
                new JSONObject().put("item", new JSONObject().put("@microsoft.graph.conflictBehavior", "replace")).toString().getBytes(StandardCharsets.UTF_8), "application/json");
        s.check();
        String up = s.json().optString("uploadUrl");
        if (up.isEmpty()) throw new Ms.Fail("error", "OneDrive gave no upload address");
        try (RandomAccessFile f = new RandomAccessFile(local, "r")) {
            byte[] buf = new byte[CHUNK];
            for (long off = 0; off < size; ) {
                int n = (int) Math.min(CHUNK, size - off);
                f.seek(off);
                f.readFully(buf, 0, n);
                Resp r = Http.raw("PUT", up, buf, n, null, "bytes " + off + "-" + (off + n - 1) + "/" + size);
                if (r.code == 200 || r.code == 201) return r.json().optString("id");
                if (r.code != 202) { r.check(); throw new Ms.Fail("error", "upload stopped (" + r.code + ")"); }
                off += n;
            }
        }
        throw new Ms.Fail("error", "upload did not finish");
    }

    /**
     * job.json for one job: write job.json.tmp, then rename it over job.json (replace), so nobody reads a half-written
     * job.json. The rename is a PATCH sent inside $batch (Android's HttpURLConnection has no PATCH).
     */
    static void writeJobJson(Context c, String id, String json) throws IOException, JSONException {
        String dir = safe(ROOT + "/" + jobId(id));
        try { new JSONObject(json); } catch (Exception e) { throw new Ms.Fail("error", "job.json is not valid JSON"); }
        Http h = new Http(c);
        Resp put = h.call("PUT", API + item(dir + "/job.json.tmp") + ":/content", json.getBytes(StandardCharsets.UTF_8), "application/json");
        put.check();
        String tmpId = put.json().optString("id");
        if (tmpId.isEmpty()) throw new Ms.Fail("error", "OneDrive gave no id for job.json.tmp");
        JSONObject req = new JSONObject().put("id", "1").put("method", "PATCH")
                .put("url", "me/drive/items/" + Uri.encode(tmpId) + "?@microsoft.graph.conflictBehavior=replace")
                .put("headers", new JSONObject().put("Content-Type", "application/json"))
                .put("body", new JSONObject().put("name", "job.json"));
        Resp r = h.call("POST", API + "/$batch", new JSONObject().put("requests", new JSONArray().put(req)).toString().getBytes(StandardCharsets.UTF_8), "application/json");
        r.check();
        JSONArray rs = r.json().optJSONArray("responses");
        int st = rs == null || rs.length() == 0 ? 0 : rs.getJSONObject(0).optInt("status");
        if (st < 200 || st >= 300) throw codeFail(st, "renaming job.json.tmp to job.json failed (" + st + ")");
    }

    /* ---------------- HTTP ---------------- */
    static final class Resp {
        int code; byte[] body; String retryAfter;
        String text() { return new String(body, StandardCharsets.UTF_8); }
        JSONObject json() throws IOException { try { return new JSONObject(text()); } catch (Exception e) { throw new Ms.Fail("error", "OneDrive sent something unexpected"); } }
        void check() throws Ms.Fail { if (code >= 400) throw codeFail(code, "OneDrive answered " + code); }
    }

    static Ms.Fail codeFail(int code, String msg) {
        if (code == 401) return new Ms.Fail("signin", "signed out of OneDrive");
        if (code == 403) return new Ms.Fail("denied", "OneDrive refused access");
        if (code == 404) return new Ms.Fail("notfound", "not found in OneDrive");
        if (code == 429 || code == 503) return new Ms.Fail("throttled", "OneDrive is busy; try again in a minute");
        return new Ms.Fail("error", msg);
    }

    /** Authorized calls: a 401 renews the token once; 429/503 wait (Retry-After) and try twice more. */
    static final class Http {
        private final Context c;
        private String tok;
        Http(Context c) { this.c = c; }

        Resp call(String method, String url, byte[] body, String type) throws IOException {
            if (tok == null) tok = Ms.token(c, false);
            Resp r = null;
            for (int attempt = 0; attempt < 4; attempt++) {
                r = raw(method, url, body, body == null ? 0 : body.length, type, null, tok);
                if (r.code == 401 && attempt == 0) { tok = Ms.token(c, true); continue; }
                if ((r.code == 429 || r.code == 503) && attempt < 3) {
                    long wait = 2000L * (attempt + 1);
                    try { if (r.retryAfter != null) wait = Math.min(30_000, Long.parseLong(r.retryAfter.trim()) * 1000); } catch (NumberFormatException ignore) { }
                    try { Thread.sleep(wait); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
                    continue;
                }
                break;
            }
            return r;
        }

        static Resp raw(String method, String url, byte[] body, int len, String type, String range) throws IOException {
            return raw(method, url, body, len, type, range, null);
        }

        static Resp raw(String method, String url, byte[] body, int len, String type, String range, String token) throws IOException {
            HttpURLConnection h;
            try {
                h = (HttpURLConnection) new URL(url).openConnection();
            } catch (IOException e) { throw new Ms.Fail("offline", "no signal"); }
            try {
                h.setConnectTimeout(15000);
                h.setReadTimeout(60000);
                h.setRequestMethod(method);
                if (token != null) h.setRequestProperty("Authorization", "Bearer " + token);
                if (body != null) {
                    h.setDoOutput(true);
                    h.setFixedLengthStreamingMode(len);
                    if (type != null) h.setRequestProperty("Content-Type", type);
                    if (range != null) h.setRequestProperty("Content-Range", range);
                    try (OutputStream o = h.getOutputStream()) { o.write(body, 0, len); }
                }
                Resp r = new Resp();
                r.code = h.getResponseCode();
                r.retryAfter = h.getHeaderField("Retry-After");
                r.body = readStream(r.code >= 400 ? h.getErrorStream() : h.getInputStream());
                return r;
            } catch (UnknownHostException | ConnectException | SocketTimeoutException e) {
                throw new Ms.Fail("offline", "no signal");
            } finally { h.disconnect(); }
        }
    }

    private static byte[] readAll(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) { return readStream(in); }
    }

    private static byte[] readStream(InputStream in) throws IOException {
        if (in == null) return new byte[0];
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = i.read(buf)) > 0; ) b.write(buf, 0, n);
            return b.toByteArray();
        }
    }
}
