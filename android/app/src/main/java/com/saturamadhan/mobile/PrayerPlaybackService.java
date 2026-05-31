package com.saturamadhan.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground Service for playing adzan audio and managing its notification.
 */
public class PrayerPlaybackService extends Service {
    private static final String TAG = "PrayerPlaybackService";

    // --- Instance State ---
    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean isPlaying = false;

    // --- Static State for JS Bridge ---
    private static boolean sIsPlaying = false;
    private static PrayerPlaybackService sInstance = null;

    public static boolean isCurrentlyPlaying() {
        return sIsPlaying;
    }

    /**
     * Adjusts the volume of the currently active MediaPlayer without persisting.
     * Used by PrayerServicePlugin.updatePreviewVolume() for real-time slider feedback.
     *
     * @param volume 0.0f–1.0f (relative to system alarm stream)
     */
    public static void setPreviewVolume(float volume) {
        if (sInstance != null && sInstance.mediaPlayer != null && sInstance.isPlaying) {
            float clamped = Math.max(0.0f, Math.min(1.0f, volume));
            sInstance.mediaPlayer.setVolume(clamped, clamped);
            Log.d(TAG, "Preview volume set to: " + clamped);
        }
    }

    // --- Service Lifecycle ---

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        Log.d(TAG, "Service created");
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        ensureNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        Log.d(TAG, "onStartCommand: action=" + action);

        if (Constants.ACTION_STOP_PRAYER.equals(action)) {
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        if (Constants.ACTION_PLAY_PRAYER.equals(action)) {
            String prayerKey = intent.getStringExtra(Constants.EXTRA_PRAYER_KEY);
            String prayerName = intent.getStringExtra(Constants.EXTRA_PRAYER_NAME);
            String audioFile = intent.getStringExtra(Constants.EXTRA_AUDIO_FILE);
            boolean isPreview = intent.getBooleanExtra(Constants.EXTRA_IS_PREVIEW, false);

            if (prayerKey == null) prayerKey = "dzuhur";
            if (prayerName == null) prayerName = "Sholat";
            if (audioFile == null || audioFile.isEmpty()) audioFile = Constants.DEFAULT_AUDIO_FILE;

            // If already playing, stop current before starting new
            releaseMediaPlayer();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(Constants.NOTIFICATION_ID_PLAYBACK, buildNotification(prayerName, isPreview), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(Constants.NOTIFICATION_ID_PLAYBACK, buildNotification(prayerName, isPreview));
            }
            playAdzan(audioFile, prayerName);
        }

        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "Service destroyed");
        releaseMediaPlayer();
        releaseWakeLock();
        releaseAudioFocus();
        sIsPlaying = false;
        sInstance = null;
        super.onDestroy();
    }

    // --- Core Playback Logic ---

    /**
     * Plays the adzan audio file specified by the JS layer.
     *
     * @param audioFile  Raw resource name without extension.
     * @param prayerName Human-readable prayer name for notification.
     */
    private void playAdzan(String audioFile, String prayerName) {
        try {
            int audioResId = getAudioResource(audioFile);
            if (audioResId == 0) {
                Log.e(TAG, "Audio resource not found for: " + audioFile);
                stopSelfCleanly();
                return;
            }

            acquireWakeLock();
            requestAudioFocus();

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());

            try (android.content.res.AssetFileDescriptor afd = getResources().openRawResourceFd(audioResId)) {
                if (afd == null) {
                    Log.e(TAG, "Audio resource FD is null for: " + audioFile);
                    stopSelfCleanly();
                    return;
                }
                mediaPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            }

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Playback completed for: " + prayerName);
                stopSelfCleanly();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: what=" + what + " extra=" + extra);
                stopSelfCleanly();
                return true;
            });

            mediaPlayer.setOnPreparedListener(mp -> {
                // Apply user-configured volume from SharedPreferences before starting
                SharedPreferences prefs = getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
                float savedVolume = prefs.getFloat(Constants.KEY_ADZAN_VOLUME, Constants.DEFAULT_ADZAN_VOLUME);
                float clampedVolume = Math.max(0.0f, Math.min(1.0f, savedVolume));
                mp.setVolume(clampedVolume, clampedVolume);
                Log.d(TAG, "Applying adzan volume: " + clampedVolume);

                mp.start();
                isPlaying = true;
                sIsPlaying = true;
                Log.d(TAG, "Started playback for: " + prayerName + " (audio=" + audioFile + ")");
            });

            // Prepare asynchronously to avoid blocking the Main Thread
            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "Error during playback: " + e.getMessage(), e);
            stopSelfCleanly();
        }
    }

    /**
     * Resolves a raw resource name to its Android resource ID.
     * Defaults to fallback if not found.
     *
     * @param audioFile Raw resource name without extension.
     * @return Resource ID, or 0 if neither exists.
     */
    private int getAudioResource(String audioFile) {
        // 1. Try the exact file name sent by JS
        if (audioFile != null && !audioFile.isEmpty()) {
            int resId = getResources().getIdentifier(audioFile, "raw", getPackageName());
            if (resId != 0) {
                Log.d(TAG, "Audio resource resolved: " + audioFile);
                return resId;
            }
            Log.w(TAG, "Audio resource not found: '" + audioFile + "', falling back to default.");
        }

        // 2. Generic fallback
        int fallbackId = getResources().getIdentifier(
            Constants.DEFAULT_AUDIO_FILE, "raw", getPackageName()
        );
        if (fallbackId != 0) {
            Log.d(TAG, "Using default fallback: " + Constants.DEFAULT_AUDIO_FILE);
            return fallbackId;
        }

        Log.e(TAG, "FATAL: Default audio resource also not found. Cannot play adzan.");
        return 0;
    }

    // --- Notification Management ---

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    Constants.CHANNEL_ID_PLAYBACK,
                    getString(R.string.notification_channel_playback_name),
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(getString(R.string.notification_channel_playback_desc));
            channel.setSound(null, null);
            channel.enableVibration(true);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String prayerName, boolean isPreview) {
        android.content.SharedPreferences prefs = getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);

        String titleStr;
        String bodyStr;
        String stopAdzanText;

        if (isPreview) {
            // Simplified text for preview playback — no "Telah Tiba" / arrival phrasing
            titleStr = prayerName;
            bodyStr = "";
            stopAdzanText = prefs.getString("system_stop_adzan", getString(R.string.notification_action_stop_adzan));
        } else {
            // Full adzan notification with localized format strings
            String formatTitle = prefs.getString("system_adzan_title", null);
            titleStr = formatTitle != null ? String.format(formatTitle, prayerName) : getString(R.string.notification_title_adzan, prayerName);

            String formatBody = prefs.getString("system_adzan_body", null);
            bodyStr = formatBody != null ? String.format(formatBody, prayerName) : getString(R.string.notification_text_adzan_arrived, prayerName);

            stopAdzanText = prefs.getString("system_stop_adzan", getString(R.string.notification_action_stop_adzan));
        }

        // Stop Action
        Intent stopIntent = new Intent(this, PrayerActionReceiver.class);
        stopIntent.setAction(Constants.ACTION_STOP_PRAYER);
        PendingIntent stopPendingIntent = PendingIntent.getBroadcast(
                this, 0, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Content Action (Open App & Stop Adzan)
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            launchIntent.setPackage(null);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launchIntent.putExtra(Constants.EXTRA_STOP_ADZAN, true);
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 1, launchIntent != null ? launchIntent : new Intent(),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, Constants.CHANNEL_ID_PLAYBACK)
                .setContentTitle(titleStr)
                .setContentText(bodyStr)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_media_pause, stopAdzanText, stopPendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .build();
    }

    // --- Cleanup Helpers ---

    private void stopSelfCleanly() {
        Log.d(TAG, "Stopping service cleanly");
        releaseMediaPlayer();
        releaseWakeLock();
        releaseAudioFocus();
        isPlaying = false;
        sIsPlaying = false;

        // Notify JS layer that playback has stopped
        Intent stoppedIntent = new Intent(Constants.ACTION_PLAYBACK_STOPPED);
        stoppedIntent.setPackage(getPackageName());
        sendBroadcast(stoppedIntent);

        stopForeground(true);
        stopSelf();
    }

    private void releaseMediaPlayer() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing MediaPlayer: " + e.getMessage());
            }
            mediaPlayer = null;
        }
    }

    // --- System Resource Management ---

    private void acquireWakeLock() {
        releaseWakeLock();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SatuRamadhan:AdzanWakeLock");
            wakeLock.acquire(10 * 60 * 1000L); // 10 minutes max
            Log.d(TAG, "WakeLock acquired");
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "WakeLock released");
        }
        wakeLock = null;
    }

    private void requestAudioFocus() {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();

        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(focusChange -> Log.d(TAG, "Audio focus changed: " + focusChange))
                .build();

        audioManager.requestAudioFocus(audioFocusRequest);
    }

    private void releaseAudioFocus() {
        if (audioFocusRequest != null && audioManager != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        }
    }
}
