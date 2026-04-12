package com.saturamadhan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class PrayerBootReceiver extends BroadcastReceiver {
    private static final String TAG = "PrayerBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        boolean isBootCompleted = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action);
        boolean isPackageReplaced = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);

        if (!isBootCompleted && !isPackageReplaced) return;

        Log.d(TAG, "Trigger received [" + action + "] — rescheduling prayer alarms...");

        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                PrayerServicePlugin.rescheduleAlarmsFromStorage(context);
            } finally {
                pendingResult.finish();
            }
        }, "PrayerBootReceiver-Thread").start();
    }
}
