package com.saturamadhan.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

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

    @PluginMethod()
    public void schedule(PluginCall call) {
        JSArray alarmsArr = call.getArray("alarms", null);
        if (alarmsArr == null) {
            call.reject("Must provide 'alarms' array");
            return;
        }

        Context context = getContext();

        // Save anchor location for background detection
        Double anchorLat = call.getDouble("anchorLat");
        Double anchorLon = call.getDouble("anchorLon");
        if (anchorLat != null && anchorLon != null) {
            saveAnchorLocation(context, anchorLat, anchorLon);
        }

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

        Context context = getContext();
        Intent intent = new Intent(context, PrayerPlaybackService.class);
        intent.setAction(Constants.ACTION_PLAY_PRAYER);
        intent.putExtra(Constants.EXTRA_PRAYER_KEY, prayerKey);
        intent.putExtra(Constants.EXTRA_PRAYER_NAME, prayerName);

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

    // ── Background Location Detection ────────────────────────────────

    /**
     * Start the passive background location detection worker.
     * Uses WorkManager PeriodicWork (~6h interval, ~3h flex window).
     * Policy KEEP ensures no duplicate workers are enqueued.
     */
    @PluginMethod()
    public void startLocationDetection(PluginCall call) {
        Context context = getContext();

        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                LocationDetectWorker.class,
                6, TimeUnit.HOURS,
                3, TimeUnit.HOURS
        )
                .addTag(Constants.WORKER_TAG)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                Constants.WORKER_TAG,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
        );

        Log.d(TAG, "Location detection worker enqueued (6h interval, 3h flex)");
        call.resolve();
    }

    /**
     * Stop the background location detection worker.
     */
    @PluginMethod()
    public void stopLocationDetection(PluginCall call) {
        Context context = getContext();
        WorkManager.getInstance(context).cancelUniqueWork(Constants.WORKER_TAG);
        Log.d(TAG, "Location detection worker cancelled");
        call.resolve();
    }

    /**
     * Check if this app is already exempted from battery optimizations.
     * Uses Android's PowerManager.isIgnoringBatteryOptimizations() API.
     *
     * Returns: { isIgnoring: boolean }
     */
    @PluginMethod()
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        Context context = getContext();
        boolean isIgnoring = false;

        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                isIgnoring = pm.isIgnoringBatteryOptimizations(context.getPackageName());
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not check battery optimization status: " + e.getMessage());
        }

        JSObject result = new JSObject();
        result.put("isIgnoring", isIgnoring);
        call.resolve(result);
    }

    /**
     * Opens the most relevant battery/autostart settings page for the current device.
     *
     * On Chinese OEM devices (Xiaomi, Oppo, Vivo, Huawei, Realme), these manufacturers
     * implement proprietary "Autostart" controls that block BOOT_COMPLETED broadcasts
     * regardless of Android permissions. This method deep-links to their specific UI
     * so the user can whitelist the app manually.
     *
     * Falls back to the standard Android "Ignore Battery Optimizations" request,
     * and then to the generic App Info page if all else fails.
     *
     * Returns: { opened: boolean, method: string }
     */
    @PluginMethod()
    public void openBatteryOptimizationSettings(PluginCall call) {
        Context context = getContext();
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        String method = "unknown";
        boolean opened = false;

        // ── Tier 1: OEM-specific Autostart management screens ─────────────────
        try {
            Intent oemIntent = new Intent();
            oemIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                // MIUI / HyperOS
                oemIntent.setComponent(new ComponentName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"
                ));
                method = "xiaomi_autostart";
            } else if (manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus")) {
                // ColorOS / OxygenOS
                oemIntent.setComponent(new ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.FakeActivity"
                ));
                method = "oppo_coloros_autostart";
            } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
                // FunTouchOS / OriginOS
                oemIntent.setComponent(new ComponentName(
                        "com.vivo.permissionmanager",
                        "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                ));
                method = "vivo_startup_manager";
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                // EMUI / MagicOS
                oemIntent.setComponent(new ComponentName(
                        "com.huawei.systemmanager",
                        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                ));
                method = "huawei_startup_manager";
            } else if (manufacturer.contains("samsung")) {
                // One UI — no dedicated autostart, but battery settings help
                oemIntent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                oemIntent.setData(Uri.fromParts("package", context.getPackageName(), null));
                method = "samsung_app_details";
            } else {
                oemIntent = null; // Not a known OEM, go to Tier 2
            }

            if (oemIntent != null && oemIntent.getComponent() != null) {
                context.startActivity(oemIntent);
                opened = true;
                Log.d(TAG, "Opened OEM battery settings via: " + method);
            } else if (oemIntent != null && oemIntent.getData() != null) {
                context.startActivity(oemIntent);
                opened = true;
                Log.d(TAG, "Opened app details settings via: " + method);
            }
        } catch (Exception e) {
            Log.w(TAG, "OEM settings intent failed: " + e.getMessage());
        }

        // ── Tier 2: Standard Android — REQUEST_IGNORE_BATTERY_OPTIMIZATIONS ────
        if (!opened) {
            try {
                Intent batteryIntent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                batteryIntent.setData(Uri.fromParts("package", context.getPackageName(), null));
                batteryIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(batteryIntent);
                method = "ignore_battery_optimizations";
                opened = true;
                Log.d(TAG, "Opened standard battery optimization settings");
            } catch (Exception e) {
                Log.w(TAG, "Battery optimization settings failed: " + e.getMessage());
            }
        }

        // ── Tier 3: Final fallback — generic App Info page ───────────────────
        if (!opened) {
            try {
                Intent appInfoIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                appInfoIntent.setData(Uri.fromParts("package", context.getPackageName(), null));
                appInfoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(appInfoIntent);
                method = "app_info_fallback";
                opened = true;
                Log.d(TAG, "Opened generic app info settings as final fallback");
            } catch (Exception e) {
                Log.e(TAG, "All settings intents failed", e);
            }
        }

        JSObject result = new JSObject();
        result.put("opened", opened);
        result.put("method", method);
        call.resolve(result);
    }

    // ── Internal Scheduling Logic ────────────────────────────────────

    private void saveAlarmsToStorage(Context context, JSArray alarms) {
        String alarmsJson = alarms.toString();

        // 1. Credential-Encrypted (CE) storage — accessible after the user unlocks the device.
        //    This is the primary copy read during normal boot (BOOT_COMPLETED).
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("alarms_data", alarmsJson).apply();

        // 2. Device-Protected (DE) storage — accessible even before the first unlock (Direct Boot).
        //    PrayerBootReceiver uses this copy when triggered by LOCKED_BOOT_COMPLETED.
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

                if (timestamp > now) {
                    Intent intent = new Intent(context, PrayerAlarmReceiver.class);
                    intent.putExtra(Constants.EXTRA_PRAYER_KEY, key);
                    intent.putExtra(Constants.EXTRA_PRAYER_NAME, title); // Using 'title' as name
                    intent.putExtra(Constants.EXTRA_BODY, body);
                    intent.putExtra(Constants.EXTRA_IS_ADZAN, isAdzan);

                    PendingIntent pendingIntent = PendingIntent.getBroadcast(
                            context, id, intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );

                    if (canUseExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        // Exact alarm via AlarmClockInfo — appears in system alarm list
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

    /**
     * Save anchor location to SharedPreferences.
     * Used by background location detection worker.
     */
    private static void saveAnchorLocation(Context context, double lat, double lon) {
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putFloat(Constants.KEY_ANCHOR_LAT, (float) lat)
                .putFloat(Constants.KEY_ANCHOR_LON, (float) lon)
                .apply();
        Log.d(TAG, "Anchor location saved: " + lat + ", " + lon);
    }

    // ── Alarm Reschedule Worker (Safety Net) ─────────────────────────

    /**
     * Enqueue a periodic WorkManager task that re-checks alarm scheduling.
     *
     * WHY THIS IS THE KEY TO SURVIVING REBOOTS ON OEM DEVICES:
     * WorkManager has its OWN internal boot receiver that is part of the AndroidX
     * library and is whitelisted by most OEMs (Xiaomi, Oppo, Vivo, etc.).
     * When the device reboots, WorkManager automatically re-enqueues all pending
     * periodic work from its internal Room database — bypassing the OEM restrictions
     * that block custom BOOT_COMPLETED receivers.
     *
     * Policy KEEP ensures we don't reset the schedule if already enqueued.
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
