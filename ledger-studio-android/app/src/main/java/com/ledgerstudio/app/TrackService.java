package com.ledgerstudio.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Records one drive: GPS every ~5 s while you drive, shown as a "Recording a drive" notification.
 * It stops by itself when you park — two minutes after Android says you left the vehicle, or after
 * five minutes without moving more than 150 m — and writes a "park" point so the next drive starts there.
 */
public class TrackService extends Service {
    static final String ACTION_START = "com.ledgerstudio.app.START", ACTION_STOP = "com.ledgerstudio.app.STOP";
    private static final String CHANNEL = "drive";
    private static final long STILL_MS = 5 * 60_000L, EXIT_GRACE_MS = 2 * 60_000L, NO_FIX_MS = 10 * 60_000L, TICK_MS = 30_000L;
    private static final float STILL_M = 150f, MAX_ACC_M = 50f, DRIVING_MPS = 5f, RESUME_MAX_M = 4800f;

    static volatile TrackService inst;
    volatile long startT;

    private FusedLocationProviderClient fused;
    private final Handler h = new Handler(Looper.getMainLooper());
    private Location last, anchor;
    private long anchorT, exitAt;
    private boolean running;
    private double[] park;

    private final LocationCallback cb = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult r) { for (Location l : r.getLocations()) onFix(l); }
    };
    private final Runnable tick = new Runnable() {
        @Override
        public void run() { check(); if (running) h.postDelayed(this, TICK_MS); }
    };

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(a)) {
            if (running) finish("stopped by you"); else stopSelf();
            return START_NOT_STICKY;
        }
        String why = intent == null ? "restarted by Android" : intent.getStringExtra("why");
        if (!running) begin(why == null ? "started from the app" : why); else enterEvent();
        return START_STICKY;
    }

    @SuppressLint("MissingPermission")
    private void begin(String why) {
        if (!Tracker.hasFine(this)) { Tracker.log(this, "can't record: location permission is off"); stopSelf(); return; }
        try {
            startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } catch (Exception e) {
            Tracker.log(this, "Android refused to start recording (" + e.getClass().getSimpleName() + "): check 'Location all the time'");
            stopSelf();
            return;
        }
        running = true;
        inst = this;
        startT = System.currentTimeMillis();
        anchorT = startT;
        exitAt = 0;
        anchor = null;
        last = null;
        park = Tracker.takePark(this);
        fused = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000).setMinUpdateIntervalMillis(2500).build();
        try {
            fused.requestLocationUpdates(req, cb, Looper.getMainLooper());
        } catch (SecurityException e) {
            Tracker.log(this, "location permission was turned off");
            finish("no permission");
            return;
        }
        h.postDelayed(tick, TICK_MS);
        Tracker.log(this, "recording a drive (" + why + ")");
        Tracker.emitState(this);
    }

    private void onFix(Location l) {
        if (!running) return;
        if (l.hasAccuracy() && l.getAccuracy() > MAX_ACC_M) return;
        long now = System.currentTimeMillis(), t = l.getTime() > 0 ? l.getTime() : now;
        if (park != null) { // start the trip where the car was parked, if that's plausibly where this drive began
            float[] d = new float[1];
            Location.distanceBetween(park[0], park[1], l.getLatitude(), l.getLongitude(), d);
            if (d[0] < RESUME_MAX_M) Tracker.addPoint(this, park[0], park[1], Math.min(startT, t - 1000), 0, "resume");
            park = null;
        }
        Tracker.addPoint(this, l.getLatitude(), l.getLongitude(), t, l.hasAccuracy() ? l.getAccuracy() : 0, null);
        last = l;
        if (anchor == null || anchor.distanceTo(l) > STILL_M) { anchor = l; anchorT = now; }
        if (l.hasSpeed() && l.getSpeed() > DRIVING_MPS) exitAt = 0;
    }

    private void check() {
        long now = System.currentTimeMillis();
        boolean moving = last != null && last.hasSpeed() && last.getSpeed() > DRIVING_MPS;
        if (exitAt > 0 && now - exitAt >= EXIT_GRACE_MS && !moving) finish("parked: you left the vehicle");
        else if (last != null && now - anchorT >= STILL_MS) finish("parked: no movement for 5 minutes");
        else if (last == null && now - startT >= NO_FIX_MS) finish("no GPS signal for 10 minutes");
    }

    void exitEvent() {
        if (running && exitAt == 0) { exitAt = System.currentTimeMillis(); Tracker.log(this, "phone says you left the vehicle"); }
    }

    void enterEvent() { exitAt = 0; }

    void stopNow(String reason) { h.post(() -> finish(reason)); }

    private void finish(String reason) {
        if (!running) return;
        running = false;
        inst = null;
        h.removeCallbacks(tick);
        try { if (fused != null) fused.removeLocationUpdates(cb); } catch (Exception e) { /* already stopped */ }
        long now = System.currentTimeMillis();
        if (last != null) {
            Tracker.addPoint(this, last.getLatitude(), last.getLongitude(), now, last.hasAccuracy() ? last.getAccuracy() : 0, "park");
            Tracker.setPark(this, last.getLatitude(), last.getLongitude(), now);
        }
        Tracker.log(this, "drive recording stopped (" + reason + ")");
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        Tracker.emitState(this);
    }

    @Override
    public void onDestroy() {
        if (running) finish("closed by Android");
        super.onDestroy();
    }

    private Notification notification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Drive recording", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while Ledger Studio logs a drive.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int imm = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), imm);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, TrackService.class).setAction(ACTION_STOP), imm);
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_drive)
                .setContentTitle("Recording a drive")
                .setContentText("Stops on its own a couple of minutes after you park.")
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(new Notification.Action.Builder((Icon) null, "Stop", stop).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }
}
