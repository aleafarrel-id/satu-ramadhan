package com.saturamadhan.mobile;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.BridgeActivity;
import android.content.Intent;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MurottalServicePlugin.class);
        registerPlugin(PrayerServicePlugin.class);
        registerPlugin(NavigationBarPlugin.class);
        registerPlugin(LocalStatusBarPlugin.class);
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge layout — WebView fills the full screen including status/nav bars.
        // Layout/inset management is handled entirely by CSS (env(safe-area-inset-*)).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
        insetsController.setAppearanceLightNavigationBars(false);

        getBridge().getWebView().setBackgroundColor(Color.parseColor("#0a3540"));

        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, insets) -> {
            androidx.core.graphics.Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            
            View webView = getBridge().getWebView();
            if (webView != null && webView.getLayoutParams() instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams mwParams = (ViewGroup.MarginLayoutParams) webView.getLayoutParams();
                mwParams.leftMargin = systemBars.left;
                mwParams.rightMargin = systemBars.right;
                mwParams.bottomMargin = systemBars.bottom;
                webView.setLayoutParams(mwParams);
            }

            return ViewCompat.onApplyWindowInsets(v, new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars(), androidx.core.graphics.Insets.of(
                    0, // Consume left
                    systemBars.top,
                    0, // Consume right
                    0  // Consume bottom
                ))
                .build());
        });

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
