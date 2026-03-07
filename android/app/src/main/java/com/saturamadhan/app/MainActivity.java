package com.saturamadhan.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import android.content.Intent;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrayerServicePlugin.class);
        super.onCreate(savedInstanceState);
        checkStopAdzanIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        checkStopAdzanIntent(intent);
    }

    private void checkStopAdzanIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra(Constants.EXTRA_STOP_ADZAN, false)) {
            Intent stopIntent = new Intent(this, PrayerPlaybackService.class);
            stopIntent.setAction(Constants.ACTION_STOP_PRAYER);
            startService(stopIntent);
        }
    }
}
