package com.saturamadhan.mobile;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Local Capacitor plugin replacing @capacitor/status-bar.
 *
 * WHY THIS EXISTS:
 * The official @capacitor/status-bar plugin (v8.0.1) calls Window.getStatusBarColor()
 * unconditionally in its constructor and Window.setStatusBarColor() in setBackgroundColor().
 * Play Console flags these via static bytecode analysis regardless of the runtime guards
 * that the plugin has (which correctly skip the calls on Android 15+).
 *
 * WHAT THIS PLUGIN DOES:
 * Provides only the two methods used by this app:
 *
 * 1. setStyle({ style }) — changes status bar icon appearance (DARK/LIGHT) via
 *    WindowInsetsControllerCompat. This is the only thing theme.js needs.
 *
 * 2. setBackgroundColor({ color }) — intentional no-op. With edge-to-edge active
 *    (WindowCompat.setDecorFitsSystemWindows=false in MainActivity), the status bar
 *    is already transparent and shows WebView content behind it. No color setting needed.
 *
 * Plugin name "StatusBar" is intentionally kept identical to the official plugin
 * so that JavaScript callers (theme.js) do not need to change plugin names.
 *
 * STYLE VALUES:
 * "DARK"  → setAppearanceLightStatusBars(false) → light/white icons (for dark backgrounds)
 * "LIGHT" → setAppearanceLightStatusBars(true)  → dark/black icons (for light backgrounds)
 */
@CapacitorPlugin(name = "StatusBar")
public class LocalStatusBarPlugin extends Plugin {

    private String lastStyle = "DARK";

    /**
     * Sets status bar icon style (light or dark icons).
     *
     * JS call: StatusBar.setStyle({ style: 'DARK' })  → white icons
     * JS call: StatusBar.setStyle({ style: 'LIGHT' }) → black icons
     */
    @PluginMethod
    public void setStyle(PluginCall call) {
        final String style = call.getString("style", "DARK");
        lastStyle = style;

        getBridge().executeOnMainThread(() -> {
            try {
                WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(
                    getActivity().getWindow(),
                    getActivity().getWindow().getDecorView()
                );
                // LIGHT style → dark (black) icons visible on light backgrounds (Quran, Tasbih)
                // DARK style  → light (white) icons visible on dark/teal backgrounds (Home)
                insetsController.setAppearanceLightStatusBars("LIGHT".equals(style));
                call.resolve();
            } catch (Exception ex) {
                call.reject("Failed to set status bar style", ex);
            }
        });
    }

    /**
     * Re-applies the last set status bar icon style when the device configuration changes
     * (e.g., when rotating the screen or expanding a foldable device).
     */
    @Override
    protected void handleOnConfigurationChanged(android.content.res.Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        getBridge().executeOnMainThread(() -> {
            try {
                if (getActivity() != null && getActivity().getWindow() != null) {
                    WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(
                        getActivity().getWindow(),
                        getActivity().getWindow().getDecorView()
                    );
                    insetsController.setAppearanceLightStatusBars("LIGHT".equals(lastStyle));
                }
            } catch (Exception ex) {
                // Ignore gracefully
            }
        });
    }

    /**
     * Intentional no-op.
     * Edge-to-edge makes the status bar transparent by default.
     * The WebView content (controlled by CSS) shows through the status bar.
     */
    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        call.resolve();
    }

    /** Shows the status bar (no-op — always visible in this app). */
    @PluginMethod
    public void show(PluginCall call) {
        call.resolve();
    }

    /** Hides the status bar (no-op — always visible in this app). */
    @PluginMethod
    public void hide(PluginCall call) {
        call.resolve();
    }

    /** Returns status bar info including the real safe-area top inset height (CSS px). */
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("visible", true);
        ret.put("style", "DARK");
        ret.put("overlays", true);
        ret.put("color", "#00000000");
        ret.put("height", Math.round(MainActivity.sSafeAreaTopCssPx));
        call.resolve(ret);
    }

    /** No-op — WebView always overlays system bars with edge-to-edge. */
    @PluginMethod
    public void setOverlaysWebView(PluginCall call) {
        call.resolve();
    }
}
