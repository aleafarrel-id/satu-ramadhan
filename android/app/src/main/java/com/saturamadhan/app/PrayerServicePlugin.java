package com.saturamadhan.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;

@CapacitorPlugin(name = "PrayerService")
public class PrayerServicePlugin extends Plugin {

    private static final String TAG = "PrayerServicePlugin";
    private static final String PREF_NAME = "PrayerAlarms";

    @PluginMethod()
    public void schedule(PluginCall call) {
        JSArray alarmsArr = call.getArray("alarms", null);
        if (alarmsArr == null) {
            call.reject("Must provide 'alarms' array");
            return;
        }

        Context context = getContext();
        saveAlarmsToStorage(context, alarmsArr);
        scheduleAlarms(context, alarmsArr);

        call.resolve();
    }

    @PluginMethod()
    public void cancelAll(PluginCall call) {
        Context context = getContext();
        cancelAllAlarms(context);
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

    // ── Internal Scheduling Logic ────────────────────────────────────

    private void saveAlarmsToStorage(Context context, JSArray alarms) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("alarms_data", alarms.toString()).apply();
    }

    public static void rescheduleAlarmsFromStorage(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String alarmsStr = prefs.getString("alarms_data", null);
        if (alarmsStr != null) {
            try {
                org.json.JSONArray jsonArr = new org.json.JSONArray(alarmsStr);
                JSArray alarms = new JSArray(jsonArr.toString());
                scheduleAlarms(context, alarms);
            } catch (JSONException e) {
                Log.e(TAG, "Failed to parse saved alarms", e);
            }
        }
    }

    private static void scheduleAlarms(Context context, JSArray alarms) {
        cancelAllAlarms(context);

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

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

                    // Set Exact Alarm
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        Intent showIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                        PendingIntent pendingShowIntent = PendingIntent.getActivity(
                                context, 0, showIntent != null ? showIntent : new Intent(),
                                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                        );
                        alarmManager.setAlarmClock(
                                new AlarmManager.AlarmClockInfo(timestamp, pendingShowIntent),
                                pendingIntent
                        );
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                    } else {
                        alarmManager.set(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent);
                    }

                    Log.d(TAG, "Scheduled alarm for " + key + " at " + timestamp);
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
        for (String key : allKeys) {
            Intent intent = new Intent(context, PrayerAlarmReceiver.class);
            int requestCode = getRequestCode(key);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context, requestCode, intent,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }
        }
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
}
