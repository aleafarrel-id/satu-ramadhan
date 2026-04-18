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
    public static final String ACTION_PLAYBACK_STOPPED = "com.saturamadhan.app.ACTION_PLAYBACK_STOPPED";

    // --- Intent Extras ---
    public static final String EXTRA_PRAYER_KEY = "prayer_key";
    public static final String EXTRA_PRAYER_NAME = "prayer_name";
    public static final String EXTRA_IS_ADZAN = "EXTRA_IS_ADZAN";
    public static final String EXTRA_BODY = "EXTRA_BODY";
    public static final String EXTRA_STOP_ADZAN = "stop_adzan";
    public static final String EXTRA_IS_PREVIEW = "is_preview";

    // --- Audio ---
    /** Intent extra key for the raw resource name of the audio to play */
    public static final String EXTRA_AUDIO_FILE = "audio_file";
    /** Fallback raw resource name when audioFile from JS is null or not found */
    public static final String DEFAULT_AUDIO_FILE = "adzan_makkah";

    // --- Notification Channels ---
    public static final String CHANNEL_ID_PLAYBACK = "prayer_playback_high";
    public static final String CHANNEL_ID_STANDARD = "prayer_default";

    // --- Notification IDs ---
    public static final int NOTIFICATION_ID_PLAYBACK = 2000;

    // --- SharedPreferences ---
    public static final String PREF_NAME = "PrayerAlarms";
    public static final String KEY_NOTIFICATIONS_ENABLED = "notifications_enabled";

    // --- Anchor Location (stored on every notification sync) ---
    public static final String KEY_ANCHOR_LAT = "anchor_lat";
    public static final String KEY_ANCHOR_LON = "anchor_lon";

    // --- 30-Day Rolling Schedule ID Range ---
    /** Base ID for rolling alarms: ID = BASE + (dayOffset * 10) + prayerIndex */
    public static final int ROLLING_ALARM_BASE_ID = 5000;
    /** Total ID slots reserved for rolling schedule (30 days × 10 slots/day) */
    public static final int ROLLING_ALARM_MAX_COUNT = 300;

    // --- Passive Background Location Detection ---
    public static final String CHANNEL_ID_LOCATION = "location_detect";
    public static final int NOTIFICATION_ID_LOCATION = 4000;
    public static final String KEY_LAST_DETECTION_ALERT = "last_detection_alert_time";
    public static final double DISTANCE_THRESHOLD_KM = 50.0;
    public static final long COOLDOWN_MS = 24 * 60 * 60 * 1000L; // 24 hours
    public static final String WORKER_TAG = "location_detect_worker";
    public static final String WORKER_TAG_ALARM_RESCHEDULE = "alarm_reschedule_worker";
}
