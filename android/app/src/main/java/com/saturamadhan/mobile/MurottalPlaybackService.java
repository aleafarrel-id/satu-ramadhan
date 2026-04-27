package com.saturamadhan.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.media.session.MediaButtonReceiver;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Foreground Service for Murottal audio playback.
 * Handles sequential playback, MediaSession controls, WakeLock, and Adzan auto-pause.
 */
public class MurottalPlaybackService extends Service {
    private static final String TAG = "MurottalPlayback";

    // --- Instance State ---
    private MediaPlayer mediaPlayer;
    private MediaSessionCompat mediaSession;
    private int consecutiveErrors = 0;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    // --- Playlist State ---
    private JSONArray playlist;       // Array of URI strings
    private int currentIndex = 0;     // Current position in the playlist (0-based)
    private int surahIndex = 0;
    private String surahName = "";
    private int totalAyahs = 0;
    private int startAyah = 1;
    private String playbackMode = "sequential";

    private boolean isPlaying = false;
    private boolean isPaused = false;
    private boolean isPausedByAdzan = false;

    // --- I18n Strings (injected from JS) ---
    private String textPlaying = "Playing";
    private String textAyah = "Ayah";
    private String textStop = "Stop";
    private String textPause = "Pause";
    private String textResume = "Resume";
    private String textNext = "Next";
    private String textPrev = "Previous";
    private String textChannelName = "Murottal Playback";
    private String textChannelDesc = "Murottal Al-Quran playback controls";

    // --- Static State for JS Bridge ---
    private static boolean sIsPlaying = false;
    private static boolean sIsPaused = false;
    private static int sSurahIndex = 0;
    private static String sSurahName = "";
    private static int sCurrentAyahNumber = 0;
    private static int sTotalAyahs = 0;
    private static String sPlaybackMode = "sequential";

    public static boolean isCurrentlyPlaying() { return sIsPlaying; }
    public static boolean isCurrentlyPaused() { return sIsPaused; }
    public static int getCurrentSurahIndex() { return sSurahIndex; }
    public static String getCurrentSurahName() { return sSurahName; }
    public static int getCurrentAyahNumber() { return sCurrentAyahNumber; }
    public static int getCurrentTotalAyahs() { return sTotalAyahs; }
    public static String getCurrentPlaybackMode() { return sPlaybackMode; }

    // --- Adzan Priority Receiver ---
    // Listens for ACTION_PLAYBACK_STOPPED to resume Murottal after Adzan completes.
    private final BroadcastReceiver adzanReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String action = intent.getAction();

            if (Constants.ACTION_PLAYBACK_STOPPED.equals(action)) {
                // Adzan finished — resume murottal if it was paused by adzan
                if (isPausedByAdzan && isPaused) {
                    Log.d(TAG, "Adzan finished (broadcast) — resuming Murottal");
                    isPausedByAdzan = false;
                    resumePlayback();
                }
            }
        }
    };

    // --- Service Lifecycle ---

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service created");
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        ensureNotificationChannel();
        initMediaSession();
        registerAdzanReceiver();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            Log.d(TAG, "Service restarted by OS with null intent — standing by");
            return START_STICKY;
        }

        // Let MediaSession handle media button events
        MediaButtonReceiver.handleIntent(mediaSession, intent);

        String action = intent.getAction();
        Log.d(TAG, "onStartCommand: action=" + action);

        if (action == null) {
            Log.d(TAG, "Null action — ignoring");
            return START_STICKY;
        }

        switch (action) {
            case Constants.ACTION_MUROTTAL_PLAY:
                handlePlay(intent);
                break;
            case Constants.ACTION_MUROTTAL_PAUSE:
                pausePlayback();
                break;
            case Constants.ACTION_MUROTTAL_RESUME:
                resumePlayback();
                break;
            case Constants.ACTION_MUROTTAL_STOP:
                stopSelfCleanly();
                break;
            case Constants.ACTION_MUROTTAL_NEXT:
                skipNext();
                break;
            case Constants.ACTION_MUROTTAL_PREV:
                skipPrev();
                break;
            default:
                Log.w(TAG, "Unknown action: " + action);
                break;
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "Service destroyed");
        unregisterAdzanReceiver();
        releaseMediaPlayer();
        releaseMediaSession();
        releaseWakeLock();
        releaseAudioFocus();
        clearStaticState();
        super.onDestroy();
    }

    // --- Play Logic ---

    private void handlePlay(Intent intent) {
        String playlistJson = intent.getStringExtra(Constants.EXTRA_MUROTTAL_PLAYLIST);
        surahIndex = intent.getIntExtra(Constants.EXTRA_MUROTTAL_SURAH_INDEX, 0);
        surahName = intent.getStringExtra(Constants.EXTRA_MUROTTAL_SURAH_NAME);
        totalAyahs = intent.getIntExtra(Constants.EXTRA_MUROTTAL_TOTAL_AYAHS, 0);
        startAyah = intent.getIntExtra(Constants.EXTRA_MUROTTAL_START_AYAH, 1);
        playbackMode = intent.getStringExtra(Constants.EXTRA_MUROTTAL_MODE);

        if (surahName == null) surahName = "";
        if (playbackMode == null) playbackMode = "sequential";

        // Load i18n strings from SharedPreferences
        loadI18nStrings();

        if (playlistJson == null || playlistJson.isEmpty()) {
            Log.e(TAG, "No playlist provided");
            stopSelfCleanly();
            return;
        }

        try {
            playlist = new JSONArray(playlistJson);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse playlist JSON", e);
            stopSelfCleanly();
            return;
        }

        if (playlist.length() == 0) {
            Log.e(TAG, "Empty playlist");
            stopSelfCleanly();
            return;
        }

        // Calculate initial index from startAyah (ayah 1 → index 0)
        currentIndex = Math.max(0, startAyah - 1);
        if (currentIndex >= playlist.length()) {
            currentIndex = 0;
        }

        // Release any existing player
        releaseMediaPlayer();

        // Start foreground immediately
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(Constants.NOTIFICATION_ID_MUROTTAL, buildNotification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(Constants.NOTIFICATION_ID_MUROTTAL, buildNotification());
        }

        acquireWakeLock();
        requestAudioFocus();

        // Play the first ayah
        playCurrentAyah();
    }

    private void playCurrentAyah() {
        if (playlist == null || currentIndex >= playlist.length()) {
            Log.d(TAG, "Playlist complete or invalid");
            stopSelfCleanly();
            return;
        }

        releaseMediaPlayer();

        try {
            String uriStr = playlist.getString(currentIndex);
            Log.d(TAG, "Playing ayah " + (currentIndex + 1) + "/" + playlist.length() + " → " + uriStr);

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());

            mediaPlayer.setDataSource(this, Uri.parse(uriStr));

            mediaPlayer.setOnPreparedListener(mp -> {
                consecutiveErrors = 0;
                mp.start();
                isPlaying = true;
                isPaused = false;
                isPausedByAdzan = false;
                updateStaticState();
                updateMediaSession(PlaybackStateCompat.STATE_PLAYING);
                updateNotification();
                broadcastStateChanged();
            });

            mediaPlayer.setOnCompletionListener(mp -> onAyahComplete());

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error: what=" + what + " extra=" + extra);
                consecutiveErrors++;
                if (consecutiveErrors >= 3) {
                    Log.e(TAG, "Too many consecutive errors, stopping playback");
                    stopSelfCleanly();
                    return true;
                }
                // Try to skip to next ayah on error
                if (playbackMode.equals("sequential") && currentIndex + 1 < playlist.length()) {
                    currentIndex++;
                    playCurrentAyah();
                } else {
                    stopSelfCleanly();
                }
                return true;
            });

            mediaPlayer.prepareAsync();

        } catch (Exception e) {
            Log.e(TAG, "Error setting up MediaPlayer", e);
            stopSelfCleanly();
        }
    }

    private void onAyahComplete() {
        if (!isPlaying) return;

        if (playbackMode.equals("sequential")) {
            currentIndex++;
            if (currentIndex < playlist.length()) {
                playCurrentAyah();
            } else {
                Log.d(TAG, "Sequential playback complete");
                stopSelfCleanly();
            }
        } else {
            // Single mode — stop after one ayah
            stopSelfCleanly();
        }
    }

    private void pausePlayback() {
        if (!isPlaying || isPaused) return;

        try {
            if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
            }
            isPaused = true;
            isPausedByAdzan = false;
            updateStaticState();
            updateMediaSession(PlaybackStateCompat.STATE_PAUSED);
            
            // Detach from foreground so the user can swipe to dismiss when paused
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(Service.STOP_FOREGROUND_DETACH);
            } else {
                //noinspection deprecation
                stopForeground(false);
            }
            
            updateNotification();
            broadcastStateChanged();
            Log.d(TAG, "Playback paused");
        } catch (Exception e) {
            Log.w(TAG, "Error pausing: " + e.getMessage());
        }
    }

    private void resumePlayback() {
        if (!isPlaying || !isPaused) return;

        try {
            if (mediaPlayer != null) {
                mediaPlayer.start();
            }
            isPaused = false;
            updateStaticState();
            updateMediaSession(PlaybackStateCompat.STATE_PLAYING);

            // Promote back to foreground service
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(Constants.NOTIFICATION_ID_MUROTTAL, buildNotification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(Constants.NOTIFICATION_ID_MUROTTAL, buildNotification());
            }

            broadcastStateChanged();
            Log.d(TAG, "Playback resumed");
        } catch (Exception e) {
            Log.w(TAG, "Error resuming: " + e.getMessage());
        }
    }

    private void skipNext() {
        if (playlist == null) return;

        if (currentIndex + 1 < playlist.length()) {
            currentIndex++;
            playCurrentAyah();
        } else {
            stopSelfCleanly();
        }
    }

    private void skipPrev() {
        if (playlist == null) return;

        if (currentIndex > 0) {
            currentIndex--;
            playCurrentAyah();
        } else {
            // Restart current ayah
            playCurrentAyah();
        }
    }

    // --- MediaSession ---

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, TAG);
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() { resumePlayback(); }

            @Override
            public void onPause() { pausePlayback(); }

            @Override
            public void onStop() { stopSelfCleanly(); }

            @Override
            public void onSkipToNext() { skipNext(); }

            @Override
            public void onSkipToPrevious() { skipPrev(); }

            @Override
            public void onSeekTo(long pos) {
                if (mediaPlayer != null) {
                    try {
                        mediaPlayer.seekTo((int) pos);
                        updateMediaSession(isPlaying && !isPaused ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED);
                    } catch (Exception e) {
                        Log.w(TAG, "Error seeking: " + e.getMessage());
                    }
                }
            }
        });

        mediaSession.setActive(true);
    }

    private void updateMediaSession(int state) {
        if (mediaSession == null) return;

        long position = 0;
        long duration = -1;
        try {
            if (mediaPlayer != null) {
                position = mediaPlayer.getCurrentPosition();
                duration = mediaPlayer.getDuration();
            }
        } catch (Exception ignored) {}

        long actions = PlaybackStateCompat.ACTION_STOP
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO;

        if (state == PlaybackStateCompat.STATE_PLAYING) {
            actions |= PlaybackStateCompat.ACTION_PAUSE;
        } else {
            actions |= PlaybackStateCompat.ACTION_PLAY;
        }

        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, position, 1.0f)
                .build();

        mediaSession.setPlaybackState(playbackState);

        int ayahNumber = currentIndex + 1;
        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, surahName)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, textAyah + " " + ayahNumber)
                .putLong(MediaMetadataCompat.METADATA_KEY_TRACK_NUMBER, ayahNumber)
                .putLong(MediaMetadataCompat.METADATA_KEY_NUM_TRACKS, totalAyahs);

        if (duration > 0 && "single".equals(playbackMode)) {
            metaBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration);
        }

        mediaSession.setMetadata(metaBuilder.build());
    }

    private void releaseMediaSession() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
    }

    // --- Notification ---

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Use localized static strings, as Android locks channel names upon first creation.
            NotificationChannel channel = new NotificationChannel(
                    Constants.CHANNEL_ID_MUROTTAL,
                    getString(R.string.notification_channel_murottal_name),
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(getString(R.string.notification_channel_murottal_desc));
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        int ayahNumber = currentIndex + 1;

        // Content intent — open app
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            launchIntent.setPackage(null);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 100, launchIntent != null ? launchIntent : new Intent(),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Action: Previous
        PendingIntent prevPendingIntent = createActionPendingIntent(Constants.ACTION_MUROTTAL_PREV, 101);

        // Action: Play/Pause toggle
        PendingIntent playPausePendingIntent;
        String playPauseLabel;
        int playPauseIcon;
        if (isPaused) {
            playPausePendingIntent = createActionPendingIntent(Constants.ACTION_MUROTTAL_RESUME, 102);
            playPauseLabel = textResume;
            playPauseIcon = R.drawable.ic_notif_play;
        } else {
            playPausePendingIntent = createActionPendingIntent(Constants.ACTION_MUROTTAL_PAUSE, 102);
            playPauseLabel = textPause;
            playPauseIcon = R.drawable.ic_notif_pause;
        }

        // Action: Next
        PendingIntent nextPendingIntent = createActionPendingIntent(Constants.ACTION_MUROTTAL_NEXT, 103);

        // Delete Action (Triggered when the user swipes away the notification)
        PendingIntent stopPendingIntent = createActionPendingIntent(Constants.ACTION_MUROTTAL_STOP, 104);

        // Enforce 3 actions to ensure symmetrical centering on custom OEM skins.
        androidx.media.app.NotificationCompat.MediaStyle mediaStyle =
                new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(mediaSession != null ? mediaSession.getSessionToken() : null)
                        .setShowActionsInCompactView(0, 1, 2)
                        .setShowCancelButton(true)
                        .setCancelButtonIntent(stopPendingIntent);

        // Title: Surah name  |  Body: "Ayah X / N"
        String titleText = surahName;
        String bodyText = textAyah + " " + ayahNumber + " / " + totalAyahs;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, Constants.CHANNEL_ID_MUROTTAL)
                .setContentTitle(titleText)
                .setContentText(bodyText)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(contentIntent)
                .setDeleteIntent(stopPendingIntent)
                .setOngoing(!isPaused)
                .setShowWhen(false)
                // Using colorized(true) to keep the deep gold/teal UI standard natively
                .setColorized(true)
                .setColor(0xFFD4A017)
                .addAction(R.drawable.ic_notif_prev, textPrev, prevPendingIntent)
                .addAction(playPauseIcon, playPauseLabel, playPausePendingIntent)
                .addAction(R.drawable.ic_notif_next, textNext, nextPendingIntent)
                .setStyle(mediaStyle)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        return builder.build();
    }

    private PendingIntent createActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MurottalActionReceiver.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(
                this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(Constants.NOTIFICATION_ID_MUROTTAL, buildNotification());
        }
    }

    // --- I18n ---

    private void loadI18nStrings() {
        SharedPreferences prefs = getSharedPreferences(Constants.PREF_MUROTTAL, Context.MODE_PRIVATE);
        textPlaying = prefs.getString("text_playing", textPlaying);
        textAyah = prefs.getString("text_ayah", textAyah);
        textStop = prefs.getString("text_stop", textStop);
        textPause = prefs.getString("text_pause", textPause);
        textResume = prefs.getString("text_resume", textResume);
        textNext = prefs.getString("text_next", textNext);
        textPrev = prefs.getString("text_prev", textPrev);
        textChannelName = prefs.getString("text_channel_name", textChannelName);
        textChannelDesc = prefs.getString("text_channel_desc", textChannelDesc);
    }

    // --- State Broadcasting ---

    private void updateStaticState() {
        sIsPlaying = isPlaying;
        sIsPaused = isPaused;
        sSurahIndex = surahIndex;
        sSurahName = surahName;
        sCurrentAyahNumber = currentIndex + 1; // 1-based
        sTotalAyahs = totalAyahs;
        sPlaybackMode = playbackMode;
    }

    private void clearStaticState() {
        sIsPlaying = false;
        sIsPaused = false;
        sSurahIndex = 0;
        sSurahName = "";
        sCurrentAyahNumber = 0;
        sTotalAyahs = 0;
        sPlaybackMode = "sequential";
    }

    private void broadcastStateChanged() {
        Intent intent = new Intent(Constants.ACTION_MUROTTAL_STATE_CHANGED);
        intent.setPackage(getPackageName());
        intent.putExtra(Constants.EXTRA_MUROTTAL_SURAH_INDEX, surahIndex);
        intent.putExtra(Constants.EXTRA_MUROTTAL_SURAH_NAME, surahName);
        intent.putExtra(Constants.EXTRA_MUROTTAL_AYAH_NUMBER, currentIndex + 1);
        intent.putExtra(Constants.EXTRA_MUROTTAL_TOTAL_AYAHS, totalAyahs);
        intent.putExtra(Constants.EXTRA_MUROTTAL_IS_PLAYING, isPlaying);
        intent.putExtra(Constants.EXTRA_MUROTTAL_IS_PAUSED, isPaused);
        intent.putExtra(Constants.EXTRA_MUROTTAL_MODE, playbackMode);
        sendBroadcast(intent);
    }

    // --- Cleanup ---

    private void stopSelfCleanly() {
        Log.d(TAG, "Stopping service cleanly");
        releaseMediaPlayer();
        releaseWakeLock();
        releaseAudioFocus();
        isPlaying = false;
        isPaused = false;
        clearStaticState();

        // Notify JS layer
        Intent stoppedIntent = new Intent(Constants.ACTION_MUROTTAL_STOPPED);
        stoppedIntent.setPackage(getPackageName());
        sendBroadcast(stoppedIntent);

        if (mediaSession != null) {
            updateMediaSession(PlaybackStateCompat.STATE_STOPPED);
        }

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

    // --- Adzan Priority Receiver ---

    private void registerAdzanReceiver() {
        IntentFilter filter = new IntentFilter();
        // Adzan start is detected via AudioFocus. We only listen for its completion.
        filter.addAction(Constants.ACTION_PLAYBACK_STOPPED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(adzanReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(adzanReceiver, filter);
        }
        Log.d(TAG, "Adzan priority receiver registered");
    }

    private void unregisterAdzanReceiver() {
        try {
            unregisterReceiver(adzanReceiver);
            Log.d(TAG, "Adzan priority receiver unregistered");
        } catch (Exception e) {
            Log.w(TAG, "Adzan receiver already unregistered: " + e.getMessage());
        }
    }

    // --- System Resources ---

    private void acquireWakeLock() {
        releaseWakeLock();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SatuRamadhan:MurottalWakeLock");
            wakeLock.acquire(120 * 60 * 1000L); // 2 hours max (long surahs)
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
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();

        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(this::handleAudioFocusChange)
                .build();

        audioManager.requestAudioFocus(audioFocusRequest);
    }

    private void handleAudioFocusChange(int focusChange) {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
                if (isPlaying && !isPaused) {
                    Log.d(TAG, "Audio focus lost permanently — pausing (not stopping)");
                    pausePlayback();
                    isPausedByAdzan = true;
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                // Temporary loss (e.g. phone call, Adzan) — pause
                if (isPlaying && !isPaused) {
                    Log.d(TAG, "Audio focus lost transiently — pausing");
                    pausePlayback();
                    isPausedByAdzan = true;
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                // Other notifications — duck volume softly
                if (mediaPlayer != null && isPlaying) {
                    Log.d(TAG, "Audio focus duck requested — ducking volume");
                    mediaPlayer.setVolume(0.2f, 0.2f);
                }
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                // Regained focus — restore volume and resume if paused by external source
                if (mediaPlayer != null) {
                    mediaPlayer.setVolume(1.0f, 1.0f);
                }
                if (isPaused && isPausedByAdzan) {
                    Log.d(TAG, "Audio focus regained — resuming Murottal after transient loss");
                    isPausedByAdzan = false;
                    resumePlayback();
                }
                break;
        }
    }

    private void releaseAudioFocus() {
        if (audioFocusRequest != null && audioManager != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        }
    }
}
