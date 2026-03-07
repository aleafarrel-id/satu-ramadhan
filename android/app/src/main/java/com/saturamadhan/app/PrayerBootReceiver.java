package com.saturamadhan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class PrayerBootReceiver extends BroadcastReceiver {
    private static final String TAG = "PrayerBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(intent.getAction())) {
            
            Log.d(TAG, "Device rebooted. Rescheduling all Prayer alarms...");
            PrayerServicePlugin.rescheduleAlarmsFromStorage(context);
        }
    }
}
