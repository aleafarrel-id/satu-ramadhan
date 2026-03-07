package com.saturamadhan.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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
 * Service responsible for playing adzan audio and managing its foreground notification.
 */
public class PrayerPlaybackService extends Service {
    private static final String TAG = "PrayerPlaybackService";

    // --- Audio Resources ---
    private static final String AUDIO_SUBUH = "adzan_subuh";
    private static final String AUDIO_REGULAR = "adzan";

    // --- Instance State ---
    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean isPlaying = false;

    // --- Static State for JS Bridge ---
    private static boolean sIsPlaying = false;

    public static boolean isCurrentlyPlaying() {
        return sIsPlaying;
    }

    // --- Service Lifecycle ---

    @Override
    public void onCreate() {
        super.onCreate();
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

            if (prayerKey == null) prayerKey = "dzuhur";
            if (prayerName == null) prayerName = "Sholat";

            // If already playing, stop current before starting new
            releaseMediaPlayer();

            startForeground(Constants.NOTIFICATION_ID_PLAYBACK, buildNotification(prayerName));
            playAdzan(prayerKey, prayerName);
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
        super.onDestroy();
    }

    // --- Core Playback Logic ---

    private void playAdzan(String prayerKey, String prayerName) {
        try {
            int audioResId = getAudioResource(prayerKey);
            if (audioResId == 0) {
                Log.e(TAG, "Audio resource not found for: " + prayerKey);
                stopSelfCleanly();
                return;
            }

            acquireWakeLock();
            requestAudioFocus();

            mediaPlayer = MediaPlayer.create(this, audioResId);
            if (mediaPlayer == null) {
                Log.e(TAG, "MediaPlayer creation failed for: " + prayerKey);
                stopSelfCleanly();
                return;
            }

            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());

            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Playback completed for: " + prayerName);
                stopSelfCleanly();
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: what=" + what + " extra=" + extra);
                stopSelfCleanly();
                return true;
            });

            mediaPlayer.start();
            isPlaying = true;
            sIsPlaying = true;
            Log.d(TAG, "Started playback for: " + prayerName);

        } catch (Exception e) {
            Log.e(TAG, "Error during playback: " + e.getMessage(), e);
            stopSelfCleanly();
        }
    }

    private int getAudioResource(String prayerKey) {
        String audioName = "subuh".equals(prayerKey) ? AUDIO_SUBUH : AUDIO_REGULAR;
        return getResources().getIdentifier(audioName, "raw", getPackageName());
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

    private Notification buildNotification(String prayerName) {
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
                .setContentTitle(getString(R.string.notification_title_adzan, prayerName))
                .setContentText(getString(R.string.notification_text_adzan_arrived, prayerName))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_media_pause, getString(R.string.notification_action_stop_adzan), stopPendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
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
        stopForeground(STOP_FOREGROUND_REMOVE);
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

        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
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
