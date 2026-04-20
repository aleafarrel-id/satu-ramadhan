package com.saturamadhan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receiver that handles notification action button clicks for Murottal playback.
 * Routes actions (pause, resume, next, prev, stop) to MurottalPlaybackService.
 *
 * Completely independent from PrayerActionReceiver (which handles Adzan).
 */
public class MurottalActionReceiver extends BroadcastReceiver {
    private static final String TAG = "MurottalActionReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Log.d(TAG, "Received action: " + action);

        if (action == null) return;

        // Forward all murottal actions to the service
        Intent serviceIntent = new Intent(context, MurottalPlaybackService.class);
        serviceIntent.setAction(action);

        switch (action) {
            case Constants.ACTION_MUROTTAL_PAUSE:
            case Constants.ACTION_MUROTTAL_RESUME:
            case Constants.ACTION_MUROTTAL_STOP:
            case Constants.ACTION_MUROTTAL_NEXT:
            case Constants.ACTION_MUROTTAL_PREV:
                context.startService(serviceIntent);
                break;
            default:
                Log.w(TAG, "Unknown action: " + action);
                break;
        }
    }
}
