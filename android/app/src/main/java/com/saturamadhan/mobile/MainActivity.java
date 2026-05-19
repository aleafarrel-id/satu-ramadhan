package com.saturamadhan.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import android.content.Intent;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MurottalServicePlugin.class);
        registerPlugin(PrayerServicePlugin.class);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
        insetsController.setAppearanceLightNavigationBars(false);

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
