package com.crewstudio.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Microsoft sign-in for OneDrive (personal accounts), done natively so the GAIA Today widget can check for jobs
 * while the app is closed. Authorization code + PKCE in the phone's browser, redirect com.crewstudio.app://auth
 * ("Mobile and desktop applications" platform in the app registration).
 * Tokens live only in this app's private storage (allowBackup is off), never in exports or backups.
 */
final class MsAuth {
    static final String AUTH = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
    static final String SCOPE = "Files.ReadWrite offline_access User.Read";
    static final String REDIRECT = "com.crewstudio.app://auth";

    static final class SignInNeeded extends Exception { SignInNeeded(String m) { super(m); } }

    private MsAuth() { }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("crew.ms", Context.MODE_PRIVATE); }

    static boolean signedIn(Context c) { return prefs(c).getString("refresh", null) != null; }
    static String account(Context c) { return prefs(c).getString("account", ""); }

    static boolean isRedirect(Intent i) {
        Uri u = i == null ? null : i.getData();
        return u != null && "com.crewstudio.app".equals(u.getScheme()) && "auth".equals(u.getHost());
    }

    /** Open Microsoft's sign-in page in the browser; the answer comes back to MainActivity as com.crewstudio.app://auth?code=… */
    static void begin(Activity a, String clientId) {
        SecureRandom r = new SecureRandom();
        byte[] v = new byte[32], s = new byte[16];
        r.nextBytes(v); r.nextBytes(s);
        String verifier = b64(v), state = b64(s), challenge;
        try { challenge = b64(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII))); }
        catch (Exception e) { return; }
        SharedPreferences.Editor ed = prefs(a).edit().putString("verifier", verifier).putString("state", state);
        if (!clientId.equals(prefs(a).getString("client", ""))) ed.remove("refresh").remove("access").remove("exp").remove("account");
        ed.putString("client", clientId).apply();
        Uri u = Uri.parse(AUTH + "/authorize").buildUpon()
                .appendQueryParameter("client_id", clientId)
                .appendQueryParameter("response_type", "code")
                .appendQueryParameter("redirect_uri", REDIRECT)
                .appendQueryParameter("response_mode", "query")
                .appendQueryParameter("scope", SCOPE)
                .appendQueryParameter("state", state)
                .appendQueryParameter("code_challenge", challenge)
                .appendQueryParameter("code_challenge_method", "S256")
                .appendQueryParameter("prompt", "select_account").build();
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, u)); }
        catch (ActivityNotFoundException e) { ((MainActivity) a).emit("ms", "{\"ok\":false,\"error\":\"no browser on this phone\"}"); }
    }

    /** Back from the browser. Runs the code exchange off the main thread and tells the page. */
    static void finish(MainActivity a, Uri u) {
        SharedPreferences p = prefs(a);
        String err = u.getQueryParameter("error"), code = u.getQueryParameter("code"), st = u.getQueryParameter("state");
        if (err != null) {
            String d = u.getQueryParameter("error_description");
            boolean cancelled = "access_denied".equals(err);
            a.emit("ms", "{\"ok\":false,\"cancelled\":" + cancelled + ",\"error\":" + JSONObject.quote(d != null ? d.split("\r")[0] : err) + "}");
            return;
        }
        if (code == null || st == null || !st.equals(p.getString("state", null))) {
            a.emit("ms", "{\"ok\":false,\"error\":\"sign-in did not match; try Connect again\"}");
            return;
        }
        final String verifier = p.getString("verifier", ""), client = p.getString("client", "");
        p.edit().remove("state").remove("verifier").apply();
        new Thread(() -> {
            try {
                JSONObject t = tokenCall(a, "client_id=" + enc(client) + "&grant_type=authorization_code&code=" + enc(code)
                        + "&redirect_uri=" + enc(REDIRECT) + "&code_verifier=" + enc(verifier) + "&scope=" + enc(SCOPE));
                String access = t.getString("access_token");
                String acct = "Microsoft account";
                try {
                    JSONObject me = new JSONObject(get("https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName", access));
                    acct = me.optString("userPrincipalName", me.optString("displayName", acct));
                } catch (Exception ignore) { /* the account name is only for display */ }
                p.edit().putString("account", acct).apply();
                GaiaSync.schedule(a);
                a.emit("ms", "{\"ok\":true,\"access\":" + JSONObject.quote(access) + ",\"expires\":" + t.optLong("expires_in", 3600)
                        + ",\"account\":" + JSONObject.quote(acct) + "}");
            } catch (Exception e) {
                a.emit("ms", "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
            }
        }, "ms-signin").start();
    }

    /** A valid access token, renewing it with the refresh token when needed. Call off the main thread. */
    static synchronized String access(Context c) throws IOException, SignInNeeded {
        SharedPreferences p = prefs(c);
        String acc = p.getString("access", null);
        if (acc != null && p.getLong("exp", 0) - 60_000 > System.currentTimeMillis()) return acc;
        String rt = p.getString("refresh", null), client = p.getString("client", "");
        if (rt == null || client.isEmpty()) throw new SignInNeeded("signin");
        try {
            return tokenCall(c, "client_id=" + enc(client) + "&grant_type=refresh_token&refresh_token=" + enc(rt) + "&scope=" + enc(SCOPE))
                    .getString("access_token");
        } catch (SignInNeeded e) {
            p.edit().remove("refresh").remove("access").remove("exp").apply();
            GaiaSync.cancel(c);
            throw e;
        } catch (org.json.JSONException e) { throw new IOException("bad answer from Microsoft"); }
    }

    /** For the page: send a fresh access token back as the "mstoken" event. */
    static void token(MainActivity a) {
        new Thread(() -> {
            try {
                String t = access(a);
                long left = Math.max(60, (prefs(a).getLong("exp", 0) - System.currentTimeMillis()) / 1000);
                a.emit("mstoken", "{\"access\":" + JSONObject.quote(t) + ",\"expires\":" + left + ",\"account\":" + JSONObject.quote(account(a)) + "}");
            } catch (SignInNeeded e) {
                a.emit("mstoken", "{\"error\":\"signin\"}");
            } catch (Exception e) {
                a.emit("mstoken", "{\"error\":" + JSONObject.quote("offline: " + e.getMessage()) + "}");
            }
        }, "ms-token").start();
    }

    static void signOut(Context c) {
        prefs(c).edit().clear().apply();
        GaiaSync.cancel(c);
    }

    /* ---- HTTP ---- */
    private static JSONObject tokenCall(Context c, String form) throws IOException, SignInNeeded {
        HttpURLConnection h = (HttpURLConnection) new URL(AUTH + "/token").openConnection();
        try {
            h.setConnectTimeout(15000); h.setReadTimeout(20000);
            h.setRequestMethod("POST"); h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            try (OutputStream o = h.getOutputStream()) { o.write(form.getBytes(StandardCharsets.UTF_8)); }
            int code = h.getResponseCode();
            String body = read(code >= 400 ? h.getErrorStream() : h.getInputStream());
            JSONObject d;
            try { d = new JSONObject(body); } catch (org.json.JSONException e) { throw new IOException("Microsoft answered " + code); }
            if (code >= 400) {
                String err = d.optString("error"), desc = d.optString("error_description", err).split("\r")[0];
                if ("invalid_grant".equals(err) || "interaction_required".equals(err) || "invalid_client".equals(err)) throw new SignInNeeded(desc);
                throw new IOException(desc);
            }
            SharedPreferences.Editor ed = prefs(c).edit()
                    .putString("access", d.optString("access_token"))
                    .putLong("exp", System.currentTimeMillis() + d.optLong("expires_in", 3600) * 1000);
            String rt = d.optString("refresh_token", "");
            if (!rt.isEmpty()) ed.putString("refresh", rt); // Microsoft rotates it: keep the newest
            ed.apply();
            return d;
        } finally { h.disconnect(); }
    }

    static String get(String url, String access) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setConnectTimeout(15000); h.setReadTimeout(20000);
            h.setRequestProperty("Authorization", "Bearer " + access);
            int code = h.getResponseCode();
            if (code >= 400) throw new HttpError(code);
            return read(h.getInputStream());
        } finally { h.disconnect(); }
    }

    static String post(String url, String access, String json) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setConnectTimeout(15000); h.setReadTimeout(30000);
            h.setRequestMethod("POST"); h.setDoOutput(true);
            h.setRequestProperty("Authorization", "Bearer " + access);
            h.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = h.getOutputStream()) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
            int code = h.getResponseCode();
            if (code >= 400) throw new HttpError(code);
            return read(h.getInputStream());
        } finally { h.disconnect(); }
    }

    static final class HttpError extends IOException {
        final int code;
        HttpError(int code) { super("OneDrive answered " + code); this.code = code; }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = i.read(buf)) > 0; ) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private static String b64(byte[] b) { return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
}
