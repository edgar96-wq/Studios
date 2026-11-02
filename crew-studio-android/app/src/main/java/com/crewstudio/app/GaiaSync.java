package com.crewstudio.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * When the background check runs: about 5:30 AM every day and then every 60 minutes, only with a network,
 * and only while OneDrive is signed in. Android may shift these a little to save battery.
 */
final class GaiaSync {
    static final String HOURLY = "gaia-hourly", MORNING = "gaia-morning", NOW = "gaia-now";
    private static final long DAY = TimeUnit.DAYS.toMillis(1);

    private GaiaSync() { }

    private static Constraints net() { return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(); }

    /** Called after sign-in and whenever the app opens. Cheap: keeps work that is already scheduled. */
    static void schedule(Context c) {
        if (!MsAuth.signedIn(c)) { cancel(c); return; }
        WorkManager wm = WorkManager.getInstance(c);
        wm.enqueueUniquePeriodicWork(HOURLY, ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(GaiaSyncWorker.class, 60, TimeUnit.MINUTES, 15, TimeUnit.MINUTES)
                        .setConstraints(net()).build());
        // the morning run: a daily job whose first run lands at the next 5:30; re-aligned if it has drifted
        SharedPreferences p = c.getSharedPreferences("crew", Context.MODE_PRIVATE);
        long due = p.getLong("morningDue", 0), now = System.currentTimeMillis();
        long next = next530(now), off = due == 0 ? DAY / 2 : ((next - due) % DAY + DAY) % DAY; // 0 while the stored run still falls on 5:30 (a clock change moves it)
        boolean aligned = off < TimeUnit.MINUTES.toMillis(20) || DAY - off < TimeUnit.MINUTES.toMillis(20);
        wm.enqueueUniquePeriodicWork(MORNING, aligned ? ExistingPeriodicWorkPolicy.KEEP : ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
                new PeriodicWorkRequest.Builder(GaiaSyncWorker.class, 24, TimeUnit.HOURS, 30, TimeUnit.MINUTES)
                        .setInitialDelay(next - now, TimeUnit.MILLISECONDS)
                        .setInputData(new Data.Builder().putBoolean("morning", true).build())
                        .setConstraints(net()).build());
        if (!aligned) p.edit().putLong("morningDue", next).apply();
    }

    /** The widget's Refresh button. Runs right away (no network wait, so "offline" shows at once). */
    static void now(Context c) {
        WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP,
                new OneTimeWorkRequest.Builder(GaiaSyncWorker.class).build());
    }

    static void cancel(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        wm.cancelUniqueWork(HOURLY);
        wm.cancelUniqueWork(MORNING);
        c.getSharedPreferences("crew", Context.MODE_PRIVATE).edit().remove("morningDue").apply();
    }

    static long next530(long now) {
        Calendar k = Calendar.getInstance();
        k.setTimeInMillis(now);
        k.set(Calendar.HOUR_OF_DAY, 5); k.set(Calendar.MINUTE, 30); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        if (k.getTimeInMillis() <= now) k.add(Calendar.DAY_OF_YEAR, 1);
        return k.getTimeInMillis();
    }
}
