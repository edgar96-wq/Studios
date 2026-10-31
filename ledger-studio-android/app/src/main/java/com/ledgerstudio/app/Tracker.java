package com.ledgerstudio.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;

import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.DetectedActivity;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Shared tracking state: the on/off setting, permissions, listening for "in a vehicle" from Android,
 * the GPS points file (one JSON object per line) and a short log of what happened.
 * The page reads the points and turns them into trips; nothing leaves the phone.
 */
final class Tracker {
    private Tracker() { }

    static volatile MainActivity ui; // the open app, if any, to tell the page about changes

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("ledger", 0); }

    /* ---------------- on / off ---------------- */
    static String mode(Context c) { return prefs(c).getString("mode", "auto"); }

    static void setMode(Context c, String m) {
        String v = "off".equals(m) ? "off" : "auto";
        prefs(c).edit().putString("mode", v).apply();
        log(c, "off".equals(v) ? "tracking turned off" : "tracking set to automatic");
        if ("auto".equals(v)) register(c);
        else {
            unregister(c);
            TrackService s = TrackService.inst;
            if (s != null) s.stopNow("tracking turned off");
        }
        emitState(c);
    }

    /* ---------------- permissions ---------------- */
    static boolean granted(Context c, String p) { return c.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    static boolean hasFine(Context c) { return granted(c, Manifest.permission.ACCESS_FINE_LOCATION); }
    static boolean hasActivity(Context c) { return granted(c, Manifest.permission.ACTIVITY_RECOGNITION); }

    static String perms(Context c) {
        PowerManager pm = c.getSystemService(PowerManager.class);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        try {
            return new JSONObject()
                    .put("location", hasFine(c))
                    .put("background", granted(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION))
                    .put("activity", hasActivity(c))
                    .put("notifications", nm != null && nm.areNotificationsEnabled())
                    .put("battery", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()))
                    .toString();
        } catch (JSONException e) { return "{}"; }
    }

    static String state(Context c) {
        TrackService s = TrackService.inst;
        try {
            return new JSONObject()
                    .put("mode", mode(c))
                    .put("running", s != null)
                    .put("since", s != null ? s.startT : 0)
                    .put("listening", prefs(c).getBoolean("listening", false))
                    .put("lastFix", lastFixT)
                    .toString();
        } catch (JSONException e) { return "{}"; }
    }

    static void emitState(Context c) {
        MainActivity a = ui;
        if (a != null) a.emit("track", state(c));
    }

    /* ---------------- listening for drives (Google Play services activity recognition) ---------------- */
    static PendingIntent pending(Context c) {
        Intent i = new Intent(c, TransitionReceiver.class).setAction(TransitionReceiver.ACTION);
        // Play services fills in the result, so this one must be mutable (it is explicit, so that is allowed)
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, 7, i, flags);
    }

    @SuppressLint("MissingPermission")
    static void register(Context c) {
        final Context app = c.getApplicationContext();
        if (!"auto".equals(mode(app))) return;
        if (!hasActivity(app)) { prefs(app).edit().putBoolean("listening", false).apply(); return; }
        List<ActivityTransition> t = new ArrayList<>();
        t.add(new ActivityTransition.Builder().setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build());
        t.add(new ActivityTransition.Builder().setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT).build());
        try {
            ActivityRecognition.getClient(app).requestActivityTransitionUpdates(new ActivityTransitionRequest(t), pending(app))
                    .addOnSuccessListener(v -> {
                        boolean was = prefs(app).getBoolean("listening", false);
                        prefs(app).edit().putBoolean("listening", true).apply();
                        if (!was) log(app, "listening for drives");
                        emitState(app);
                    })
                    .addOnFailureListener(e -> {
                        prefs(app).edit().putBoolean("listening", false).apply();
                        log(app, "could not listen for drives: " + e.getMessage());
                        emitState(app);
                    });
        } catch (Exception e) {
            log(app, "could not listen for drives: " + e.getMessage());
        }
    }

    @SuppressLint("MissingPermission")
    static void unregister(Context c) {
        try { ActivityRecognition.getClient(c).removeActivityTransitionUpdates(pending(c)); } catch (Exception e) { /* not listening */ }
        prefs(c).edit().putBoolean("listening", false).apply();
    }

    /* ---------------- GPS points ---------------- */
    static volatile long lastFixT;

    private static File pointsFile(Context c) { return new File(c.getFilesDir(), "points.jsonl"); }

    static synchronized void addPoint(Context c, double lat, double lon, long t, float acc, String kind) {
        String line = String.format(Locale.US, "{\"lat\":%.6f,\"lon\":%.6f,\"t\":%d,\"a\":%.0f%s}\n",
                lat, lon, t, acc, kind == null ? "" : ",\"k\":\"" + kind + "\"");
        try (OutputStream o = new FileOutputStream(pointsFile(c), true)) { o.write(line.getBytes(StandardCharsets.UTF_8)); }
        catch (IOException e) { /* storage full: nothing we can do here */ }
        if (kind == null) lastFixT = t;
    }

    /** All points with time ≥ since, as a JSON array. Broken lines (e.g. power loss mid-write) are skipped. */
    static synchronized String points(Context c, long since) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        File f = pointsFile(c);
        if (f.exists()) {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
                for (String l; (l = r.readLine()) != null; ) {
                    if (!l.startsWith("{") || !l.endsWith("}")) continue;
                    long t = timeOf(l);
                    if (t < 0 || t < since) continue;
                    if (!first) sb.append(',');
                    sb.append(l);
                    first = false;
                }
            } catch (IOException e) { /* return what we have */ }
        }
        return sb.append(']').toString();
    }

    /** Drop points older than `before` (the page already turned them into trips). */
    static synchronized void prune(Context c, long before) {
        File f = pointsFile(c), tmp = new File(c.getFilesDir(), "points.tmp");
        if (!f.exists()) return;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8));
             OutputStream o = new FileOutputStream(tmp)) {
            for (String l; (l = r.readLine()) != null; ) {
                long t = timeOf(l);
                if (t >= before) o.write((l + "\n").getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException e) { //noinspection ResultOfMethodCallIgnored
            tmp.delete(); return; }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(f);
    }

    static long timeOf(String line) {
        int i = line.indexOf("\"t\":");
        if (i < 0) return -1;
        int j = i + 4, k = j;
        while (k < line.length() && Character.isDigit(line.charAt(k))) k++;
        try { return Long.parseLong(line.substring(j, k)); } catch (NumberFormatException e) { return -1; }
    }

    /* where the car was left, so the next drive starts there (Android notices driving about a minute late) */
    static void setPark(Context c, double lat, double lon, long t) {
        prefs(c).edit().putString("parkLat", Double.toString(lat)).putString("parkLon", Double.toString(lon)).putLong("parkT", t).apply();
    }

    static double[] takePark(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.contains("parkT")) return null;
        double[] out;
        try { out = new double[]{Double.parseDouble(p.getString("parkLat", "")), Double.parseDouble(p.getString("parkLon", ""))}; }
        catch (NumberFormatException e) { out = null; }
        p.edit().remove("parkT").remove("parkLat").remove("parkLon").apply();
        return out;
    }

    /* ---------------- log ---------------- */
    private static File logFile(Context c) { return new File(c.getFilesDir(), "events.log"); }

    static synchronized void log(Context c, String msg) {
        String line = new SimpleDateFormat("MMM d  HH:mm:ss", Locale.US).format(new Date()) + "   " + msg + "\n";
        File f = logFile(c);
        try (OutputStream o = new FileOutputStream(f, true)) { o.write(line.getBytes(StandardCharsets.UTF_8)); }
        catch (IOException e) { return; }
        if (f.length() > 64_000) {
            String keep = readLog(c);
            try (OutputStream o = new FileOutputStream(f, false)) { o.write(keep.getBytes(StandardCharsets.UTF_8)); } catch (IOException e) { /* ignore */ }
        }
    }

    /** The last 200 lines. */
    static synchronized String readLog(Context c) {
        ArrayDeque<String> q = new ArrayDeque<>();
        File f = logFile(c);
        if (!f.exists()) return "";
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            for (String l; (l = r.readLine()) != null; ) { q.addLast(l); if (q.size() > 200) q.removeFirst(); }
        } catch (IOException e) { /* return what we have */ }
        StringBuilder sb = new StringBuilder();
        for (String l : q) sb.append(l).append('\n');
        return sb.toString();
    }
}
