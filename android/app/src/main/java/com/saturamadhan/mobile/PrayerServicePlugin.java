package com.saturamadhan.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import android.content.BroadcastReceiver;
import android.content.IntentFilter;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;


@CapacitorPlugin(name = "PrayerService")
public class PrayerServicePlugin extends Plugin {

    private static final String TAG = "PrayerServicePlugin";

    /** Must match JS NOTIFICATION_BASE_ID (native-notification.js) */
    private static final int JS_NOTIFICATION_BASE_ID = 1000;

    /**
     * BroadcastReceiver for playback-stopped events to reset the JS UI preview states.
     */
    private final BroadcastReceiver playbackStoppedReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "Playback stopped broadcast received — notifying JS listeners");
            notifyListeners("onPlaybackStopped", new JSObject());
        }
    };

    @Override
    public void load() {
        super.load();
        IntentFilter filter = new IntentFilter(Constants.ACTION_PLAYBACK_STOPPED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(playbackStoppedReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(playbackStoppedReceiver, filter);
        }
        Log.d(TAG, "Playback-stopped receiver registered");
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(playbackStoppedReceiver);
            Log.d(TAG, "Playback-stopped receiver unregistered");
        } catch (Exception e) {
            Log.w(TAG, "Receiver already unregistered: " + e.getMessage());
        }
        super.handleOnDestroy();
    }

    @PluginMethod()
    public void schedule(PluginCall call) {
        JSArray alarmsArr = call.getArray("alarms", null);
        if (alarmsArr == null) {
            call.reject("Must provide 'alarms' array");
            return;
        }

        Context context = getContext();

        JSObject systemStrings = call.getObject("systemStrings", null);
        if (systemStrings != null) {
            saveSystemStringsToStorage(context, systemStrings);
        }

        saveAlarmsToStorage(context, alarmsArr);
        setNotificationsEnabled(context, true);
        scheduleAlarms(context, alarmsArr);
        enqueueAlarmRescheduleWorker(context);

        call.resolve();
    }

    @PluginMethod()
    public void cancelAll(PluginCall call) {
        Context context = getContext();
        setNotificationsEnabled(context, false);
        cancelAllAlarms(context);
        clearSavedAlarms(context);  // Clears both CE and DE storage
        cancelAlarmRescheduleWorker(context);
        call.resolve();
    }

    @PluginMethod()
    public void play(PluginCall call) {
        String prayerKey = call.getString("prayerKey", "dzuhur");
        String prayerName = call.getString("prayerName", "Sholat");
        String audioFile = call.getString("audioFile", Constants.DEFAULT_AUDIO_FILE);
        boolean isPreview = call.getBoolean("isPreview", false);

        Context context = getContext();
        Intent intent = new Intent(context, PrayerPlaybackService.class);
        intent.setAction(Constants.ACTION_PLAY_PRAYER);
        intent.putExtra(Constants.EXTRA_PRAYER_KEY, prayerKey);
        intent.putExtra(Constants.EXTRA_PRAYER_NAME, prayerName);
        intent.putExtra(Constants.EXTRA_AUDIO_FILE, audioFile);
        intent.putExtra(Constants.EXTRA_IS_PREVIEW, isPreview);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }

        call.resolve();
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, PrayerPlaybackService.class);
        intent.setAction(Constants.ACTION_STOP_PRAYER);
        context.startService(intent);
        call.resolve();
    }

    @PluginMethod()
    public void isPlaying(PluginCall call) {
        JSObject result = new JSObject();
        result.put("playing", PrayerPlaybackService.isCurrentlyPlaying());
        call.resolve(result);
    }

    // ── Battery & Settings ────────────────────────────────────────────

    /**
     * Opens the App Info page in system Settings.
     * From there, users can manually manage battery optimization, autostart,
     * and other background permissions based on their device.
     *
     * Uses ACTION_APPLICATION_DETAILS_SETTINGS — a standard, non-privileged
     * intent that works on all Android versions and OEMs without any
     * special permissions.
     *
     * Returns: { opened: boolean }
     */
    @PluginMethod()
    public void openBatteryOptimizationSettings(PluginCall call) {
        Context context = getContext();
        boolean opened = false;

        try {
            Intent appInfoIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            appInfoIntent.setData(Uri.fromParts("package", context.getPackageName(), null));
            appInfoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(appInfoIntent);
            opened = true;
            Log.d(TAG, "Opened App Info settings page");
        } catch (Exception e) {
            Log.e(TAG, "Failed to open App Info settings: " + e.getMessage());
        }

        JSObject result = new JSObject();
        result.put("opened", opened);
        call.resolve(result);
    }

    // ── Internal Scheduling Logic ────────────────────────────────────

    private void saveAlarmsToStorage(Context context, JSArray alarms) {
        String alarmsJson = alarms.toString();

        // 1. Credential-Encrypted (CE) storage - accessible after user unlock.
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("alarms_data", alarmsJson).apply();

        // 2. Device-Protected (DE) storage - accessible during Direct Boot (before unlock).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Context deContext = context.createDeviceProtectedStorageContext();
            SharedPreferences dePrefs = deContext.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
            dePrefs.edit().putString("alarms_data", alarmsJson).apply();
            Log.d(TAG, "Alarms saved to both CE and DE storage.");
        }
    }

    private void saveSystemStringsToStorage(Context context, JSObject systemStrings) {
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (systemStrings.has("adzanTitle")) editor.putString("system_adzan_title", systemStrings.getString("adzanTitle"));
        if (systemStrings.has("adzanBody")) editor.putString("system_adzan_body", systemStrings.getString("adzanBody"));
        if (systemStrings.has("stopAdzan")) editor.putString("system_stop_adzan", systemStrings.getString("stopAdzan"));
        editor.apply();
        Log.d(TAG, "System strings populated correctly: " + systemStrings.getString("stopAdzan"));
    }

    public static void rescheduleAlarmsFromStorage(Context context) {
        Context ceContext = context;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && context.isDeviceProtectedStorage()) {
            Log.d(TAG, "Direct Boot context: CE flag unavailable, trusting DE alarm data.");
        } else {
            // Normal context: CE storage is available. Check enabled flag.
            SharedPreferences cePrefs = ceContext.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
            boolean notificationsEnabled = cePrefs.getBoolean(Constants.KEY_NOTIFICATIONS_ENABLED, true);
            if (!notificationsEnabled) {
                Log.d(TAG, "Notifications disabled by user — skipping reschedule.");
                return;
            }
        }

        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        String alarmsStr = prefs.getString("alarms_data", null);
        if (alarmsStr == null) {
            Log.w(TAG, "No saved alarm data found — nothing to reschedule.");
            return;
        }
        try {
            org.json.JSONArray jsonArr = new org.json.JSONArray(alarmsStr);
            JSArray alarms = new JSArray(jsonArr.toString());
            scheduleAlarms(context, alarms);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse saved alarms", e);
        }
    }

    private static void scheduleAlarms(Context context, JSArray alarms) {
        cancelAllAlarms(context);

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        // Check exact-alarm permission once before the loop (Android 12+).
        boolean canUseExact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            canUseExact = alarmManager.canScheduleExactAlarms();
            if (!canUseExact) {
                Log.w(TAG, "SCHEDULE_EXACT_ALARM permission not granted — using setWindow() fallback");
            }
        }

        long now = System.currentTimeMillis();
        int requestCount = 0;

        for (int i = 0; i < alarms.length(); i++) {
            try {
                JSONObject alarmObj = alarms.getJSONObject(i);
                long timestamp = alarmObj.getLong("timestamp");
                String key = alarmObj.getString("key");
                String title = alarmObj.getString("title");
                String body = alarmObj.getString("body");
                boolean isAdzan = alarmObj.getBoolean("isAdzan");
                int id = alarmObj.optInt("id", getRequestCode(key));

                // Audio file resolved by JS — Java just passes it through
                String audioFile = alarmObj.optString("audioFile", Constants.DEFAULT_AUDIO_FILE);
                if (audioFile == null || audioFile.isEmpty()) {
                    audioFile = Constants.DEFAULT_AUDIO_FILE;
                }

                if (timestamp > now) {
                    Intent intent = new Intent(context, PrayerAlarmReceiver.class);
                    intent.putExtra(Constants.EXTRA_PRAYER_KEY, key);
                    intent.putExtra(Constants.EXTRA_PRAYER_NAME, title); // Using 'title' as name
                    intent.putExtra(Constants.EXTRA_BODY, body);
                    intent.putExtra(Constants.EXTRA_IS_ADZAN, isAdzan);
                    intent.putExtra(Constants.EXTRA_AUDIO_FILE, audioFile);

                    PendingIntent pendingIntent = PendingIntent.getBroadcast(
                            context, id, intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );

                    if (canUseExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        // Schedules exact visible alarms (AlarmClock API)
                        Intent showIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                        PendingIntent pendingShowIntent = PendingIntent.getActivity(
                                context, 0, showIntent != null ? showIntent : new Intent(),
                                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        );
                        alarmManager.setAlarmClock(
                                new AlarmManager.AlarmClockInfo(timestamp, pendingShowIntent),
                                pendingIntent
                        );
                    } else if (canUseExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        // Fallback: permission revoked — use ±5-min window (available API 19+)
                        final long WINDOW_MS = 5 * 60 * 1000L;
                        alarmManager.setWindow(AlarmManager.RTC_WAKEUP, timestamp, WINDOW_MS, pendingIntent);
                    } else {
                        // Fallback: very old device (API < 19)
                        alarmManager.set(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                    }

                    Log.d(TAG, "Scheduled alarm for " + key + " at " + timestamp + " (exact=" + canUseExact + ")");
                    requestCount++;
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to schedule alarm dynamically", e);
            }
        }
        Log.d(TAG, "Total alarms scheduled: " + requestCount);
    }

    private static void cancelAllAlarms(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        String[] allKeys = {"imsak", "subuh", "terbit", "dzuhur", "ashar", "magrib", "isya"};

        // Cancel legacy Java-based request codes (3000-series)
        for (String key : allKeys) {
            cancelPendingIntent(context, alarmManager, getRequestCode(key));
        }

        // Cancel legacy JS-based request codes (1001-1007)
        for (int i = 0; i < allKeys.length; i++) {
            cancelPendingIntent(context, alarmManager, JS_NOTIFICATION_BASE_ID + i + 1);
        }

        // Cancel rolling 30-day schedule (ID range 5000 – 5299)
        for (int i = 0; i < Constants.ROLLING_ALARM_MAX_COUNT; i++) {
            cancelPendingIntent(context, alarmManager, Constants.ROLLING_ALARM_BASE_ID + i);
        }

        Log.d(TAG, "All alarms cancelled (legacy + rolling 30-day range)");
    }

    /**
     * Cancel a single PendingIntent alarm by its request code.
     */
    private static void cancelPendingIntent(Context context, AlarmManager alarmManager, int requestCode) {
        Intent intent = new Intent(context, PrayerAlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
    }

    /**
     * Clear saved alarm data from SharedPreferences.
     * Prevents BootReceiver from rescheduling cancelled alarms.
     */
    private static void clearSavedAlarms(Context context) {
        // Clear CE (normal) storage
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove("alarms_data").apply();

        // Also clear DE (Device-Protected) storage so the boot receiver cannot
        // re-schedule alarms that the user has explicitly cancelled.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Context deContext = context.createDeviceProtectedStorageContext();
            SharedPreferences dePrefs = deContext.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
            dePrefs.edit().remove("alarms_data").apply();
        }
        Log.d(TAG, "Saved alarm data cleared from CE and DE storage");
    }

    /**
     * Set the notifications enabled flag in SharedPreferences.
     * PrayerAlarmReceiver checks this as a final guard before showing notifications.
     */
    private static void setNotificationsEnabled(Context context, boolean enabled) {
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(Constants.KEY_NOTIFICATIONS_ENABLED, enabled).apply();
        Log.d(TAG, "Notifications enabled flag set to: " + enabled);
    }

    private static int getRequestCode(String key) {
        switch (key) {
            case "imsak": return 3000;
            case "subuh": return 3001;
            case "terbit": return 3006;
            case "dzuhur": return 3002;
            case "ashar": return 3003;
            case "magrib": return 3004;
            case "isya": return 3005;
            default: return 3099;
        }
    }

    // ── Alarm Reschedule Worker (Safety Net) ─────────────────────────

    /**
     * Enqueues a periodic WorkManager task to safeguard alarm scheduling.
     * Bypasses OEM BOOT_COMPLETED restrictions by relying on WorkManager's built-in persistence.
     */
    private void enqueueAlarmRescheduleWorker(Context context) {
        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                AlarmRescheduleWorker.class,
                6, TimeUnit.HOURS,
                3, TimeUnit.HOURS
        )
                .addTag(Constants.WORKER_TAG_ALARM_RESCHEDULE)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                Constants.WORKER_TAG_ALARM_RESCHEDULE,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
        );
        Log.d(TAG, "Alarm reschedule worker enqueued (6h interval, 3h flex)");
    }

    private void cancelAlarmRescheduleWorker(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(Constants.WORKER_TAG_ALARM_RESCHEDULE);
        Log.d(TAG, "Alarm reschedule worker cancelled");
    }
}
