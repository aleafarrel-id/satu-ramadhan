package com.saturamadhan.mobile;

/**
 * Shared constants for the Android native side of the application.
 */
public final class Constants {
    private Constants() {
        // Private constructor to prevent instantiation
    }

    // --- Intent Actions ---
    public static final String ACTION_PLAY_PRAYER = "com.saturamadhan.mobile.ACTION_PLAY_PRAYER";
    public static final String ACTION_STOP_PRAYER = "com.saturamadhan.mobile.ACTION_STOP_PRAYER";
    public static final String ACTION_PLAYBACK_STOPPED = "com.saturamadhan.mobile.ACTION_PLAYBACK_STOPPED";

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

    // --- WorkManager Tags ---
    public static final String WORKER_TAG_ALARM_RESCHEDULE = "alarm_reschedule_worker";

    // --- 30-Day Rolling Schedule ID Range ---
    /** Base ID for rolling alarms: ID = BASE + (dayOffset * 10) + prayerIndex */
    public static final int ROLLING_ALARM_BASE_ID = 5000;
    /** Total ID slots reserved for rolling schedule (30 days × 10 slots/day) */
    public static final int ROLLING_ALARM_MAX_COUNT = 300;

    // ─── Murottal Background Playback ──────────────────────────────────
    public static final String ACTION_MUROTTAL_PLAY = "com.saturamadhan.mobile.ACTION_MUROTTAL_PLAY";
    public static final String ACTION_MUROTTAL_PAUSE = "com.saturamadhan.mobile.ACTION_MUROTTAL_PAUSE";
    public static final String ACTION_MUROTTAL_RESUME = "com.saturamadhan.mobile.ACTION_MUROTTAL_RESUME";
    public static final String ACTION_MUROTTAL_STOP = "com.saturamadhan.mobile.ACTION_MUROTTAL_STOP";
    public static final String ACTION_MUROTTAL_NEXT = "com.saturamadhan.mobile.ACTION_MUROTTAL_NEXT";
    public static final String ACTION_MUROTTAL_PREV = "com.saturamadhan.mobile.ACTION_MUROTTAL_PREV";
    public static final String ACTION_MUROTTAL_STATE_CHANGED = "com.saturamadhan.mobile.ACTION_MUROTTAL_STATE_CHANGED";
    public static final String ACTION_MUROTTAL_STOPPED = "com.saturamadhan.mobile.ACTION_MUROTTAL_STOPPED";

    public static final String CHANNEL_ID_MUROTTAL = "murottal_playback";
    public static final int NOTIFICATION_ID_MUROTTAL = 3000;
    public static final String PREF_MUROTTAL = "MurottalPlayback";

    public static final String EXTRA_MUROTTAL_PLAYLIST = "murottal_playlist";
    public static final String EXTRA_MUROTTAL_SURAH_INDEX = "murottal_surah_index";
    public static final String EXTRA_MUROTTAL_SURAH_NAME = "murottal_surah_name";
    public static final String EXTRA_MUROTTAL_TOTAL_AYAHS = "murottal_total_ayahs";
    public static final String EXTRA_MUROTTAL_START_AYAH = "murottal_start_ayah";
    public static final String EXTRA_MUROTTAL_MODE = "murottal_mode";
    public static final String EXTRA_MUROTTAL_AYAH_NUMBER = "murottal_ayah_number";
    public static final String EXTRA_MUROTTAL_IS_PLAYING = "murottal_is_playing";
    public static final String EXTRA_MUROTTAL_IS_PAUSED = "murottal_is_paused";
}
