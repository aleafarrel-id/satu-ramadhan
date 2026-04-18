package com.saturamadhan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Receiver that handles prayer alarms triggered by the system.
 * It decides whether to play adzan audio or show a standard notification.
 *
 * Defense-in-depth: checks SharedPreferences flag before acting,
 * so even if an alarm fires during a cancel race condition,
 * the notification is silently dropped.
 */
public class PrayerAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "PrayerAlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        // Defense-in-depth: check if notifications are still enabled
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        boolean notificationsEnabled = prefs.getBoolean(Constants.KEY_NOTIFICATIONS_ENABLED, true);
        if (!notificationsEnabled) {
            Log.d(TAG, "Alarm fired but notifications are disabled — silently dropping.");
            return;
        }

        String prayerKey = intent.getStringExtra(Constants.EXTRA_PRAYER_KEY);
        String prayerName = intent.getStringExtra(Constants.EXTRA_PRAYER_NAME);
        boolean isAdzan = intent.getBooleanExtra(Constants.EXTRA_IS_ADZAN, true);
        String bodyText = intent.getStringExtra(Constants.EXTRA_BODY);

        Log.d(TAG, "Alarm Triggered! Key=" + prayerKey + ", Name=" + prayerName + ", isAdzan=" + isAdzan);

        if (isAdzan) {
            String audioFile = intent.getStringExtra(Constants.EXTRA_AUDIO_FILE);
            if (audioFile == null || audioFile.isEmpty()) audioFile = Constants.DEFAULT_AUDIO_FILE;
            startAdzanService(context, prayerKey, prayerName, audioFile);
        } else {
            showStandardNotification(context, prayerKey, prayerName, bodyText);
        }
    }

    private void startAdzanService(Context context, String prayerKey, String prayerName, String audioFile) {
        Intent serviceIntent = new Intent(context, PrayerPlaybackService.class);
        serviceIntent.setAction(Constants.ACTION_PLAY_PRAYER);
        serviceIntent.putExtra(Constants.EXTRA_PRAYER_KEY, prayerKey);
        serviceIntent.putExtra(Constants.EXTRA_PRAYER_NAME, prayerName);
        serviceIntent.putExtra(Constants.EXTRA_AUDIO_FILE, audioFile);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }

    private void showStandardNotification(Context context, String prayerKey, String prayerName, String bodyText) {
        String channelId = Constants.CHANNEL_ID_STANDARD;
        android.app.NotificationManager nm = (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                    channelId,
                    context.getString(R.string.notification_channel_standard_name),
                    android.app.NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(context.getString(R.string.notification_channel_standard_desc));
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            launchIntent.setPackage(null);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
        
        // requestCode helps in distinguishing notifications for different events
        int requestCode = "imsak".equals(prayerKey) ? 3000 : 3006;
        android.app.PendingIntent contentIntent = android.app.PendingIntent.getActivity(
                context, requestCode, launchIntent != null ? launchIntent : new Intent(),
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE
        );

        String title = prayerName;
        String body = bodyText != null ? bodyText : context.getString(R.string.notification_text_reminder_default);

        androidx.core.app.NotificationCompat.Builder builder = new androidx.core.app.NotificationCompat.Builder(context, channelId)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL);

        if (nm != null) {
            nm.notify(requestCode, builder.build());
        }
    }
}
