package com.saturamadhan.app;

/**
 * Shared constants for the Android native side of the application.
 */
public final class Constants {
    private Constants() {
        // Private constructor to prevent instantiation
    }

    // --- Intent Actions ---
    public static final String ACTION_PLAY_PRAYER = "com.saturamadhan.app.ACTION_PLAY_PRAYER";
    public static final String ACTION_STOP_PRAYER = "com.saturamadhan.app.ACTION_STOP_PRAYER";

    // --- Intent Extras ---
    public static final String EXTRA_PRAYER_KEY = "prayer_key";
    public static final String EXTRA_PRAYER_NAME = "prayer_name";
    public static final String EXTRA_IS_ADZAN = "EXTRA_IS_ADZAN";
    public static final String EXTRA_BODY = "EXTRA_BODY";
    public static final String EXTRA_STOP_ADZAN = "stop_adzan";

    // --- Notification Channels ---
    public static final String CHANNEL_ID_PLAYBACK = "prayer_playback_high";
    public static final String CHANNEL_ID_STANDARD = "prayer_default";

    // --- Notification IDs ---
    public static final int NOTIFICATION_ID_PLAYBACK = 2000;

    // --- SharedPreferences ---
    public static final String PREF_NAME = "PrayerAlarms";
    public static final String KEY_NOTIFICATIONS_ENABLED = "notifications_enabled";
}
