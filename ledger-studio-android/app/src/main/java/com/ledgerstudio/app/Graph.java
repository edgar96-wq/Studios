package com.ledgerstudio.app;

import android.content.Context;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Microsoft Graph for Ledger Studio: READ-ONLY, and only inside GAIA/Jobs (Integration Spec §5–6).
 * From each job folder it reads two things:
 *   job.json            → only job_id, company, status and wo.address are passed on (buyer, seller, agents… are dropped here);
 *   field/<job_id>.txt  → the points (P,N,E,Z,D, FL West State Plane, US ft), reduced to their centre.
 * Files are downloaded only when their eTag changed since the last check (eTags asked 20 at a time with $batch).
 */
final class Graph {
    static final String ROOT = "GAIA/Jobs";
    private static final String API = "https://graph.microsoft.com/v1.0";
    private static final int MAX_FILE = 4 << 20;

    private Graph() { }

    /* ---------------- the GAIA/Jobs fence ---------------- */
    static String safe(String path) throws Ms.Fail {
        if (path == null) throw new Ms.Fail("error", "no path");
        String p = path.replace('\\', '/').trim();
        while (p.startsWith("/")) p = p.substring(1);
        for (String s : p.split("/")) if (s.isEmpty() || s.equals(".") || s.equals("..")) throw new Ms.Fail("error", "bad path: " + path);
        if (!(p.equals(ROOT) || p.startsWith(ROOT + "/"))) throw new Ms.Fail("error", "Ledger Studio only reads inside " + ROOT);
        return p;
    }

    private static String item(String safePath) {
        StringBuilder b = new StringBuilder("/me/drive/root:");
        for (String s : safePath.split("/")) b.append('/').append(Uri.encode(s));
        return b.toString();
    }

    /**
     * known = {folder: {"j": job.json eTag, "p": points eTag, "wantPoints": bool}}; all = read everything again.
     * Returns [{name, etag, job: {code, company, status, address} | absent, pEtag, center: {spcN, spcE, n} | absent}].
     * etag is null when the folder has no job.json yet (still being made): the page tries again next time.
     */
    static JSONArray scan(Context c, JSONObject known, boolean all) throws IOException, JSONException {
        if (known == null) known = new JSONObject();
        Http h = new Http(c);
        List<String> names = new ArrayList<>();
        String url = API + item(ROOT) + ":/children?$select=name,folder&$top=999";
        while (url != null) {
            Resp r = h.call("GET", url);
            if (r.code == 404) throw new Ms.Fail("nofolder", "There is no " + ROOT + " folder in this OneDrive");
            r.check();
            JSONObject d = r.json();
            JSONArray v = d.optJSONArray("value");
            for (int i = 0; v != null && i < v.length(); i++) if (v.getJSONObject(i).has("folder")) names.add(v.getJSONObject(i).getString("name"));
            url = d.optString("@odata.nextLink", "");
            if (url.isEmpty() || !url.startsWith(API)) url = null;
        }
        List<String> jobPaths = new ArrayList<>();
        for (String n : names) jobPaths.add(safe(ROOT + "/" + n + "/job.json"));
        String[] tags = tags(h, jobPaths);

        JSONArray out = new JSONArray();
        List<Integer> wantPts = new ArrayList<>();
        JSONObject[] entries = new JSONObject[names.size()];
        for (int i = 0; i < names.size(); i++) {
            String name = names.get(i), tag = tags[i];
            JSONObject k = known.optJSONObject(name);
            JSONObject e = new JSONObject().put("name", name).put("etag", tag == null ? JSONObject.NULL : tag);
            if (tag != null && (all || k == null || !tag.equals(k.optString("j", "")))) {
                String txt = read(h, jobPaths.get(i));
                JSONObject job = txt == null ? null : pick(name, txt);
                if (job != null) e.put("job", job);
            }
            if (tag != null && (all || k == null || k.optBoolean("wantPoints", true))) wantPts.add(i);
            entries[i] = e;
            out.put(e);
        }

        // the field points file: only for jobs still waiting for (or able to update) their position
        List<String> ptPaths = new ArrayList<>();
        for (int i : wantPts) ptPaths.add(safe(ROOT + "/" + names.get(i) + "/field/" + names.get(i) + ".txt"));
        String[] ptags = tags(h, ptPaths);
        for (int x = 0; x < wantPts.size(); x++) {
            int i = wantPts.get(x);
            String ptag = ptags[x];
            if (ptag == null) continue;
            JSONObject k = known.optJSONObject(names.get(i));
            entries[i].put("pEtag", ptag);
            if (!all && k != null && ptag.equals(k.optString("p", ""))) continue; // same points as last time
            String txt = read(h, ptPaths.get(x));
            JSONObject ctr = txt == null ? null : center(txt);
            if (ctr != null) entries[i].put("center", ctr);
        }
        return out;
    }

    /** eTags of files, 20 per $batch; null where the file doesn't exist. */
    private static String[] tags(Http h, List<String> paths) throws IOException, JSONException {
        String[] tags = new String[paths.size()];
        for (int i = 0; i < paths.size(); i += 20) {
            JSONArray reqs = new JSONArray();
            for (int k = i; k < Math.min(paths.size(), i + 20); k++)
                reqs.put(new JSONObject().put("id", String.valueOf(k)).put("method", "GET")
                        .put("url", item(paths.get(k)).substring(1) + "?$select=eTag,lastModifiedDateTime"));
            Resp r = h.call("POST", API + "/$batch", new JSONObject().put("requests", reqs).toString().getBytes(StandardCharsets.UTF_8), "application/json");
            r.check();
            JSONArray rs = r.json().optJSONArray("responses");
            for (int x = 0; rs != null && x < rs.length(); x++) {
                JSONObject o = rs.getJSONObject(x), body = o.optJSONObject("body");
                if (o.optInt("status") == 200 && body != null) tags[Integer.parseInt(o.getString("id"))] = body.optString("eTag", body.optString("lastModifiedDateTime"));
            }
        }
        return tags;
    }

    /** Only these fields leave this method (Integration Spec §5: personal data stays in job.json). */
    static JSONObject pick(String folder, String text) {
        try {
            JSONObject j = new JSONObject(text), wo = j.optJSONObject("wo");
            if (wo == null) wo = new JSONObject();
            String code = first(str(j, "job_id"), folder);
            return new JSONObject().put("code", code).put("company", str(j, "company"))
                    .put("status", str(j, "status")).put("address", str(wo, "address"));
        } catch (Exception e) { return null; }
    }

    /**
     * Centre of the job's points: lines "P,N,E,Z,D" (FieldGenius export). Uses the median, then the average of the
     * points within 1500 ft of it, so a far control point or benchmark doesn't pull the centre off the lot.
     */
    static JSONObject center(String text) {
        List<double[]> pts = new ArrayList<>();
        for (String line : text.split("\\r?\\n")) {
            String[] f = line.contains(",") ? line.split(",") : line.trim().split("\\s+");
            if (f.length < 3) continue;
            try {
                double n = Double.parseDouble(f[1].trim()), e = Double.parseDouble(f[2].trim());
                if (n > 1e5 && n < 2e6 && e > 1e5 && e < 1.5e6) pts.add(new double[]{n, e}); // plausible FL West, US ft
            } catch (NumberFormatException ignore) { /* header or text line */ }
        }
        if (pts.isEmpty()) return null;
        double mn = median(pts, 0), me = median(pts, 1), sn = 0, se = 0;
        int k = 0;
        for (double[] p : pts) if (Math.hypot(p[0] - mn, p[1] - me) <= 1500) { sn += p[0]; se += p[1]; k++; }
        try { return new JSONObject().put("spcN", sn / k).put("spcE", se / k).put("n", k); }
        catch (JSONException e) { return null; }
    }

    private static double median(List<double[]> pts, int col) {
        double[] v = new double[pts.size()];
        for (int i = 0; i < v.length; i++) v[i] = pts.get(i)[col];
        Arrays.sort(v);
        return v.length % 2 == 1 ? v[v.length / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    }

    private static String str(JSONObject o, String k) { return o.isNull(k) ? "" : o.optString(k, "").trim(); }

    private static String first(String... s) { for (String x : s) if (x != null && !x.isEmpty()) return x; return ""; }

    private static String read(Http h, String safePath) throws IOException {
        Resp r = h.call("GET", API + item(safePath) + ":/content");
        if (r.code == 404) return null;
        r.check();
        if (r.body.length > MAX_FILE) throw new Ms.Fail("error", "a file in " + ROOT + " is too large");
        return r.text();
    }

    /* ---------------- HTTP (GET, plus POST only for $batch of GETs) ---------------- */
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

        Resp call(String method, String url) throws IOException { return call(method, url, null, null); }

        Resp call(String method, String url, byte[] body, String type) throws IOException {
            if (tok == null) tok = Ms.token(c, false);
            Resp r = null;
            for (int attempt = 0; attempt < 4; attempt++) {
                r = raw(method, url, body, type, tok);
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

        private static Resp raw(String method, String url, byte[] body, String type, String token) throws IOException {
            HttpURLConnection h;
            try { h = (HttpURLConnection) new URL(url).openConnection(); }
            catch (IOException e) { throw new Ms.Fail("offline", "no signal"); }
            try {
                h.setConnectTimeout(15000);
                h.setReadTimeout(60000);
                h.setRequestMethod(method);
                h.setRequestProperty("Authorization", "Bearer " + token);
                if (body != null) {
                    h.setDoOutput(true);
                    h.setFixedLengthStreamingMode(body.length);
                    if (type != null) h.setRequestProperty("Content-Type", type);
                    try (OutputStream o = h.getOutputStream()) { o.write(body); }
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

    private static byte[] readStream(InputStream in) throws IOException {
        if (in == null) return new byte[0];
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = i.read(buf)) > 0; ) { b.write(buf, 0, n); if (b.size() > MAX_FILE + 1) break; }
            return b.toByteArray();
        }
    }
}
