package com.saturamadhan.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receiver that handles custom notification actions, such as stopping the adzan.
 */
public class PrayerActionReceiver extends BroadcastReceiver {
    private static final String TAG = "PrayerActionReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        
        String action = intent.getAction();
        Log.d(TAG, "Received action: " + action);

        if (Constants.ACTION_STOP_PRAYER.equals(action)) {
            stopPrayerService(context);
        }
    }

    private void stopPrayerService(Context context) {
        Log.d(TAG, "Requesting service stop via action");
        Intent stopIntent = new Intent(context, PrayerPlaybackService.class);
        stopIntent.setAction(Constants.ACTION_STOP_PRAYER);
        context.startService(stopIntent);
    }
}
