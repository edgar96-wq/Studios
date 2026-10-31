package com.ledgerstudio.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android forgets "tell me when I'm driving" after a restart or an app update: ask again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!"auto".equals(Tracker.mode(c))) return;
        Tracker.log(c, Intent.ACTION_BOOT_COMPLETED.equals(i.getAction()) ? "phone restarted: listening again" : "app updated: listening again");
        Tracker.register(c);
    }
}
