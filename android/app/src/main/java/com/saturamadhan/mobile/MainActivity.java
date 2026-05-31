package com.saturamadhan.mobile;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.BridgeActivity;
import android.content.Intent;
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {

    // Cached top safe-area inset in CSS pixels (dp).
    // Readable by LocalStatusBarPlugin.getInfo() so JS can also query it.
    static float sSafeAreaTopCssPx = 0f;

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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            android.view.WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }

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
            androidx.core.graphics.Insets physicalBars = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars());

            // Take the maximum of PHYSICAL status bar height and display cutout safe inset.
            // On punch-hole devices the cutout may extend beyond the standard status bar.
            int topInsetPx = physicalBars.top;
            int leftInsetPx = systemBars.left;
            int rightInsetPx = systemBars.right;

            DisplayCutoutCompat cutout = insets.getDisplayCutout();
            if (cutout != null) {
                topInsetPx = Math.max(topInsetPx, cutout.getSafeInsetTop());
                leftInsetPx = Math.max(leftInsetPx, cutout.getSafeInsetLeft());
                rightInsetPx = Math.max(rightInsetPx, cutout.getSafeInsetRight());
            }

            // Convert native pixels to CSS pixels (dp) and cache for plugin access
            float density = getResources().getDisplayMetrics().density;
            sSafeAreaTopCssPx = topInsetPx / density;

            // Inject the native value as a CSS custom property into the WebView.
            // CSS uses var(--safe-area-inset-top, env(safe-area-inset-top)) so this
            // takes priority over the potentially-buggy env() on some Chromium builds.
            injectSafeAreaTopInset();
            
            View webView = getBridge().getWebView();
            if (webView != null && webView.getLayoutParams() instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams mwParams = (ViewGroup.MarginLayoutParams) webView.getLayoutParams();
                mwParams.leftMargin = leftInsetPx;
                mwParams.rightMargin = rightInsetPx;
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

    /**
     * Injects --safe-area-inset-top into the WebView's :root element.
     * Safe to call at any time; if the page hasn't loaded yet the JS is
     * silently ignored and the value will be re-injected by the JS-side
     * fallback in theme.js via StatusBar.getInfo().
     */
    private void injectSafeAreaTopInset() {
        android.webkit.WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // Use integer rounding to avoid sub-pixel rendering issues
        int cssPx = Math.round(sSafeAreaTopCssPx);
        String js = "document.documentElement.style.setProperty('--safe-area-inset-top','" + cssPx + "px');";
        webView.post(() -> webView.evaluateJavascript(js, null));
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

