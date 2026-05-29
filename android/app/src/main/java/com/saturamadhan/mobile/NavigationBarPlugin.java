package com.saturamadhan.mobile;

import android.graphics.Color;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Local Capacitor plugin replacing @capgo/capacitor-navigation-bar.
 *
 * WHY THIS EXISTS:
 * The @capgo/capacitor-navigation-bar plugin uses Window.setNavigationBarColor(),
 * Window.getNavigationBarColor(), and Window.setNavigationBarDividerColor() — all
 * deprecated since Android 15 (API 35). Play Console flags these via static
 * bytecode analysis regardless of runtime guards.
 *
 * HOW NAVIGATION BAR COLOR WORKS:
 * With edge-to-edge active (WindowCompat.setDecorFitsSystemWindows=false in
 * MainActivity), the navigation bar is transparent. The area behind the nav bar
 * is NOT automatically covered by CSS content — CSS uses env(safe-area-inset-bottom)
 * which stops content ABOVE the nav bar. What shows through is the WebView's
 * own background color.
 *
 * Therefore, setting WebView.setBackgroundColor() is the correct modern approach:
 * the WebView background fills the nav bar area, giving it the correct color
 * without any deprecated Window APIs.
 *
 * Plugin name "NavigationBar" is intentionally kept identical to the capgo plugin
 * so that JavaScript callers (theme.js) do not need to change plugin names.
 */
@CapacitorPlugin(name = "NavigationBar")
public class NavigationBarPlugin extends Plugin {

    // Fallback teal color if an invalid/null color string is received
    private static final int FALLBACK_COLOR = Color.parseColor("#0a3540");

    /**
     * Sets the navigation bar area color and button icon appearance.
     *
     * JS call: NavigationBar.setNavigationBarColor({ color: '#0a3540', darkButtons: false })
     *
     * @param color       Hex color string for the nav bar area background.
     *                    Applied via WebView.setBackgroundColor() — the modern
     *                    replacement for the deprecated Window.setNavigationBarColor().
     * @param darkButtons true  = dark (black) buttons, for light backgrounds.
     *                    false = light (white) buttons, for dark/teal backgrounds.
     */
    @PluginMethod
    public void setNavigationBarColor(PluginCall call) {
        final String colorHex = call.getString("color");
        final boolean darkButtons = Boolean.TRUE.equals(call.getBoolean("darkButtons", false));

        getBridge().executeOnMainThread(() -> {
            try {
                // Parse the requested color. The WebView background fills the area
                // behind the transparent navigation bar, giving it the correct color.
                int parsedColor = FALLBACK_COLOR;
                if (colorHex != null && !colorHex.isEmpty()) {
                    try {
                        parsedColor = Color.parseColor(colorHex);
                    } catch (IllegalArgumentException ignored) {
                        // Keep fallback teal if color string is malformed
                    }
                }
                
                // Update the root DecorView background. This fills any empty space
                // created by the WebView margins (left, right, bottom), perfectly
                // coloring the navigation bar area regardless of orientation.
                if (getActivity() != null && getActivity().getWindow() != null) {
                    getActivity().getWindow().getDecorView().setBackgroundColor(parsedColor);
                }

                // Fallback for the WebView background itself
                getBridge().getWebView().setBackgroundColor(parsedColor);

                // Control nav bar icon/button appearance (light vs dark icons).
                // true  -> dark (black) icons, for light nav bar backgrounds
                // false -> light (white) icons, for dark/teal nav bar backgrounds
                WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(
                    getActivity().getWindow(),
                    getActivity().getWindow().getDecorView()
                );
                insetsController.setAppearanceLightNavigationBars(darkButtons);
                call.resolve();
            } catch (Exception ex) {
                call.reject("Failed to set navigation bar appearance", ex);
            }
        });
    }

    /**
     * Stub — returns a neutral value to avoid breaking any JS callers.
     * The actual color is managed via WebView background, not readable here.
     */
    @PluginMethod
    public void getNavigationBarColor(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("color", "#000000");
        ret.put("darkButtons", false);
        call.resolve(ret);
    }

    /** Exposes the local version identifier for debugging. */
    @PluginMethod
    public void getPluginVersion(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", "local");
        call.resolve(ret);
    }
}
