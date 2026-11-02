package com.ledgerstudio.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * OneDrive, read-only (Microsoft Graph, permission "Files.Read").
 * Sign-in uses a code shown in the app (device-code flow), so no password ever passes through Ledger Studio.
 * Jobs: lists GAIA/Jobs, downloads each job folder's job.json and keeps ONLY job_id, company, status,
 * wo.address and State Plane N/E (Integration Spec §5). Buyer, seller, agents and the rest are never passed on or stored.
 * Tokens stay in this app's private storage and are excluded from Android backups.
 */
final class OneDrive {
    private static final String AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/";
    private static final String GRAPH = "https://graph.microsoft.com/v1.0/me/drive/";
    private static final String SCOPE = "Files.Read offline_access";
    private static final int MAX_JOB_JSON = 512 * 1024;

    private final MainActivity act;
    private volatile boolean signingIn, cancel, listing;

    OneDrive(MainActivity act) { this.act = act; }

    private SharedPreferences p() { return act.getSharedPreferences("od", 0); }

    String status() {
        try {
            return new JSONObject().put("connected", p().contains("refresh")).put("account", p().getString("account", ""))
                    .put("clientId", p().getString("clientId", "")).put("signingIn", signingIn).toString();
        } catch (Exception e) { return "{}"; }
    }

    void disconnect() {
        cancel = true;
        p().edit().remove("refresh").remove("access").remove("exp").remove("account").apply(); // the client ID stays
        Tracker.log(act, "OneDrive disconnected");
    }

    /** Copy the sign-in code and open Microsoft's sign-in page in the browser. */
    void openLogin(String uri, String code) {
        act.ui.post(() -> {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null && code != null) cm.setPrimaryClip(ClipData.newPlainText("Microsoft sign-in code", code));
            try { act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(uri))); } catch (Exception e) { /* no browser */ }
        });
    }

    /* ---------------- sign-in (device code) ---------------- */
    void connect(String clientId) {
        final String cid = clientId == null ? "" : clientId.trim();
        if (cid.isEmpty()) { act.emit("odauth", err("Paste the Application (client) ID first.")); return; }
        if (signingIn) return;
        signingIn = true;
        cancel = false;
        p().edit().putString("clientId", cid).apply();
        new Thread(() -> {
            try {
                JSONObject dc = post(AUTH + "devicecode", "client_id=" + enc(cid) + "&scope=" + enc(SCOPE));
                if (dc.has("error")) { act.emit("odauth", err(friendly(dc))); return; }
                act.emit("odcode", new JSONObject().put("code", dc.getString("user_code"))
                        .put("uri", dc.optString("verification_uri", "https://microsoft.com/devicelogin")).toString());
                long until = System.currentTimeMillis() + dc.optLong("expires_in", 900) * 1000L, wait = dc.optLong("interval", 5) * 1000L;
                while (!cancel && System.currentTimeMillis() < until) {
                    Thread.sleep(wait);
                    JSONObject t = post(AUTH + "token", "grant_type=" + enc("urn:ietf:params:oauth:grant-type:device_code")
                            + "&client_id=" + enc(cid) + "&device_code=" + enc(dc.getString("device_code")));
                    String e = t.optString("error", "");
                    if ("authorization_pending".equals(e)) continue;
                    if ("slow_down".equals(e)) { wait += 5000; continue; }
                    if (!e.isEmpty()) { act.emit("odauth", err(friendly(t))); return; }
                    saveTokens(t);
                    String who = account();
                    Tracker.log(act, "OneDrive connected" + (who.isEmpty() ? "" : " (" + who + ")"));
                    act.emit("odauth", new JSONObject().put("ok", true).put("account", who).toString());
                    return;
                }
                if (!cancel) act.emit("odauth", err("The sign-in code expired. Tap Sign in again."));
            } catch (Exception e) {
                act.emit("odauth", err("Sign-in needs internet. (" + e.getMessage() + ")"));
            } finally { signingIn = false; }
        }, "od-login").start();
    }

    private void saveTokens(JSONObject t) {
        SharedPreferences.Editor ed = p().edit().putString("access", t.optString("access_token"))
                .putLong("exp", System.currentTimeMillis() + t.optLong("expires_in", 3600) * 1000L);
        if (t.has("refresh_token")) ed.putString("refresh", t.optString("refresh_token"));
        ed.apply();
    }

    /** A valid access token, refreshed when needed. */
    private String token() throws IOException {
        String acc = p().getString("access", "");
        if (!acc.isEmpty() && System.currentTimeMillis() < p().getLong("exp", 0) - 60_000) return acc;
        String rt = p().getString("refresh", "");
        if (rt.isEmpty()) throw new IOException("Connect OneDrive first.");
        JSONObject t = post(AUTH + "token", "grant_type=refresh_token&client_id=" + enc(p().getString("clientId", ""))
                + "&refresh_token=" + enc(rt) + "&scope=" + enc(SCOPE));
        if (t.has("error")) {
            if ("invalid_grant".equals(t.optString("error"))) p().edit().remove("refresh").remove("access").apply();
            throw new IOException("Sign in to OneDrive again (" + friendly(t) + ").");
        }
        saveTokens(t);
        return p().getString("access", "");
    }

    private String account() {
        try {
            JSONObject d = get(GRAPH + "?$select=owner,driveType", token());
            JSONObject u = d.optJSONObject("owner") == null ? null : d.optJSONObject("owner").optJSONObject("user");
            String who = u == null ? "" : u.optString("displayName", "");
            p().edit().putString("account", who).apply();
            return who;
        } catch (Exception e) { return ""; }
    }

    /* ---------------- jobs ---------------- */
    /** req = {"folder":"GAIA/Jobs","seen":{folderName: lastModifiedDateTime}}; answers with event "odjobs". */
    void listJobs(String req) {
        if (listing) return;
        listing = true;
        new Thread(() -> {
            try {
                JSONObject q = new JSONObject(req);
                String folder = q.optString("folder", "GAIA/Jobs").replaceAll("^/+|/+$", "");
                JSONObject seen = q.optJSONObject("seen") == null ? new JSONObject() : q.optJSONObject("seen");
                String tok = token();
                List<JSONObject> folders = new ArrayList<>();
                String url = GRAPH + "root:/" + path(folder) + ":/children?$select=name,folder,lastModifiedDateTime&$top=200";
                while (url != null) {
                    JSONObject r = get(url, tok);
                    if (r.has("error")) {
                        String code = r.optJSONObject("error") == null ? "" : r.optJSONObject("error").optString("code");
                        throw new IOException("itemNotFound".equals(code) ? "No folder \"" + folder + "\" in this OneDrive." : "OneDrive answered: " + code);
                    }
                    JSONArray v = r.optJSONArray("value");
                    if (v != null) for (int i = 0; i < v.length(); i++) if (v.getJSONObject(i).has("folder")) folders.add(v.getJSONObject(i));
                    url = r.has("@odata.nextLink") ? r.getString("@odata.nextLink") : null;
                }
                JSONArray jobs = new JSONArray();
                JSONObject newSeen = new JSONObject();
                int n = 0, waiting = 0;
                for (JSONObject f : folders) {
                    n++;
                    String name = f.getString("name"), mod = f.optString("lastModifiedDateTime", "");
                    if (!mod.isEmpty() && mod.equals(seen.optString(name, ""))) continue; // unchanged since the last check
                    if (n % 5 == 0) act.emit("odprogress", new JSONObject().put("done", n).put("total", folders.size()).toString());
                    String text = getText(GRAPH + "root:/" + path(folder + "/" + name + "/job.json") + ":/content", tok);
                    if (text == null) { waiting++; continue; } // no job.json yet (still being made): try again next time
                    JSONObject job = pick(name, text);
                    if (job == null) { waiting++; continue; }
                    jobs.put(job);
                    newSeen.put(name, mod);
                }
                act.emit("odjobs", new JSONObject().put("jobs", jobs).put("seen", newSeen).put("folders", folders.size()).put("waiting", waiting).toString());
            } catch (Exception e) {
                act.emit("odjobs", err(e.getMessage() == null ? "OneDrive check failed." : e.getMessage()));
            } finally { listing = false; }
        }, "od-jobs").start();
    }

    /** Only these fields leave this method; the rest of job.json (buyer, seller, agents, legal…) is dropped here. */
    static JSONObject pick(String folderName, String text) {
        try {
            JSONObject j = new JSONObject(text), wo = j.optJSONObject("wo");
            if (wo == null) wo = new JSONObject();
            String code = first(str(j, "job_id"), str(wo, "survey_no"), folderName);
            JSONObject o = new JSONObject().put("code", code).put("company", str(j, "company"))
                    .put("status", str(j, "status")).put("address", str(wo, "address"));
            double[] ne = coords(j);
            if (ne == null) ne = coords(wo);
            if (ne != null) o.put("spcN", ne[0]).put("spcE", ne[1]);
            return o;
        } catch (Exception e) { return null; }
    }

    /** FL West State Plane N/E, if the record carries them: site/spc/coords {n,e} or spcN/spcE. */
    private static double[] coords(JSONObject o) {
        for (String k : new String[]{"site", "spc", "coords"}) {
            JSONObject c = o.optJSONObject(k);
            if (c == null) continue;
            double[] v = ne(c.opt("n") != null ? c.opt("n") : c.opt("N") != null ? c.opt("N") : c.opt("northing"),
                    c.opt("e") != null ? c.opt("e") : c.opt("E") != null ? c.opt("E") : c.opt("easting"));
            if (v != null) return v;
        }
        return ne(o.opt("spcN"), o.opt("spcE"));
    }

    private static double[] ne(Object n, Object e) {
        try {
            if (n == null || e == null || n == JSONObject.NULL || e == JSONObject.NULL) return null;
            double N = Double.parseDouble(n.toString()), E = Double.parseDouble(e.toString());
            return N > 1e5 && N < 2e6 && E > 1e5 && E < 1.5e6 ? new double[]{N, E} : null; // plausible US-ft State Plane values
        } catch (NumberFormatException x) { return null; }
    }

    private static String str(JSONObject o, String k) { return o.isNull(k) ? "" : o.optString(k, "").trim(); }

    private static String first(String... s) { for (String x : s) if (x != null && !x.isEmpty()) return x; return ""; }

    /* ---------------- HTTP (GET for files, POST only to Microsoft sign-in) ---------------- */
    private static JSONObject post(String url, String form) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        try (OutputStream o = c.getOutputStream()) { o.write(form.getBytes(StandardCharsets.UTF_8)); }
        return json(c);
    }

    private static JSONObject get(String url, String tok) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Authorization", "Bearer " + tok);
        c.setRequestProperty("Accept", "application/json");
        return json(c);
    }

    /** A file's text, or null if it isn't there. Graph answers with a redirect to a pre-signed download link. */
    private static String getText(String url, String tok) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Authorization", "Bearer " + tok);
        int code = c.getResponseCode();
        if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
            String loc = c.getHeaderField("Location");
            c.disconnect();
            if (loc == null) return null;
            c = (HttpURLConnection) new URL(loc).openConnection(); // pre-signed: no token sent to the download host
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            code = c.getResponseCode();
        }
        if (code == 404) return null;
        if (code >= 400) throw new IOException("OneDrive answered " + code);
        try (InputStream in = c.getInputStream()) { return read(in, MAX_JOB_JSON); }
    }

    private static JSONObject json(HttpURLConnection c) throws IOException {
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        String body = in == null ? "" : read(in, 4 << 20);
        try { return new JSONObject(body.isEmpty() ? "{}" : body); }
        catch (Exception e) { throw new IOException("unexpected answer (" + code + ")"); }
    }

    private static String read(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) { b.write(buf, 0, n); if (b.size() > max) throw new IOException("file too large"); }
        in.close();
        return b.toString("UTF-8");
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private static String path(String p) {
        StringBuilder sb = new StringBuilder();
        for (String seg : p.split("/")) {
            if (seg.isEmpty()) continue;
            if (sb.length() > 0) sb.append('/');
            sb.append(enc(seg).replace("+", "%20"));
        }
        return sb.toString();
    }

    /** Microsoft's error text without trace IDs, plus the usual setup mistakes in plain words. */
    private static String friendly(JSONObject e) {
        String d = e.optString("error_description", e.optString("error", "unknown error"));
        if (d.contains("AADSTS700016")) return "Microsoft doesn't know that client ID. Check the Application (client) ID.";
        if (d.contains("AADSTS7000218") || d.contains("AADSTS70002")) return "In the app registration, turn on \"Allow public client flows\" (Authentication page).";
        if (d.contains("AADSTS50020") || d.contains("AADSTS50194")) return "The app registration must allow personal Microsoft accounts (Supported account types).";
        if ("authorization_declined".equals(e.optString("error"))) return "Sign-in was cancelled.";
        int cut = d.indexOf("Trace ID");
        if (cut < 0) cut = d.indexOf('\r');
        return (cut > 0 ? d.substring(0, cut) : d).trim();
    }

    private static String err(String msg) {
        try { return new JSONObject().put("error", msg).toString(); } catch (Exception e) { return "{\"error\":\"error\"}"; }
    }
}
