package com.ledgerstudio.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;

import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;

/** Android tells us "entered / left a vehicle"; entering starts a drive recording, leaving lets it wind down. */
public class TransitionReceiver extends BroadcastReceiver {
    static final String ACTION = "com.ledgerstudio.app.TRANSITION";
    private static final long STALE_NS = 10L * 60 * 1_000_000_000L;

    @Override
    public void onReceive(Context c, Intent i) {
        if (!ActivityTransitionResult.hasResult(i)) return;
        ActivityTransitionResult r = ActivityTransitionResult.extractResult(i);
        if (r == null) return;
        long now = SystemClock.elapsedRealtimeNanos();
        for (ActivityTransitionEvent e : r.getTransitionEvents()) {
            if (e.getActivityType() != DetectedActivity.IN_VEHICLE) continue;
            if (now - e.getElapsedRealTimeNanos() > STALE_NS) continue; // an old event delivered late
            TrackService s = TrackService.inst;
            if (e.getTransitionType() == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
                if (!"auto".equals(Tracker.mode(c))) continue;
                if (s != null) { s.enterEvent(); continue; }
                Tracker.log(c, "phone noticed you're driving");
                try {
                    c.startForegroundService(new Intent(c, TrackService.class).setAction(TrackService.ACTION_START).putExtra("why", "you started driving"));
                } catch (Exception ex) {
                    Tracker.log(c, "could not start recording (" + ex.getClass().getSimpleName() + ")");
                }
            } else if (s != null) {
                s.exitEvent();
            }
        }
    }
}
