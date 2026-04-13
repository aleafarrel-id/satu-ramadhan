package com.saturamadhan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Receiver that re-schedules prayer alarms after the device boots or the app is updated.
 *
 * Handles three scenarios:
 *  1. LOCKED_BOOT_COMPLETED — Direct Boot phase. Device has powered on but the user has
 *     not yet unlocked it. Only Device-Protected (DE) storage is accessible here.
 *     Requires android:directBootAware="true" in the manifest.
 *  2. BOOT_COMPLETED — Normal boot, fired after the first credential unlock.
 *     Credential-Encrypted (CE) storage is now fully accessible.
 *  3. MY_PACKAGE_REPLACED — App was updated/reinstalled. AlarmManager slots are cleared
 *     by the OS on update, so we must reschedule immediately.
 *
 * Both storage layers (DE and CE) hold a copy of the alarm data, written by
 * PrayerServicePlugin.saveAlarmsToStorage(). This ensures the receiver can always
 * find data regardless of which boot phase triggers it.
 */
public class PrayerBootReceiver extends BroadcastReceiver {
    private static final String TAG = "PrayerBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();

        boolean isLockedBoot = false;
        boolean isNormalBoot = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            isLockedBoot = Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action);
        }

        isNormalBoot = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action);

        boolean isPackageReplaced = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);

        if (!isLockedBoot && !isNormalBoot && !isPackageReplaced) return;

        Log.d(TAG, "Trigger received [" + action + "] — rescheduling prayer alarms…");

        // During Direct Boot (LOCKED_BOOT_COMPLETED), CE storage is not yet available.
        // Use Device-Protected storage.
        final Context storageContext;
        if (isLockedBoot && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            storageContext = context.createDeviceProtectedStorageContext();
            Log.d(TAG, "Using Device-Protected storage (Direct Boot phase)");
        } else {
            storageContext = context;
            Log.d(TAG, "Using Credential-Encrypted storage (post-unlock boot)");
        }

        // goAsync() lets us move work off the main thread without the system killing
        // the receiver for taking too long (BroadcastReceiver has a ~10s budget).
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                // Primary path: reschedule alarms directly from storage
                PrayerServicePlugin.rescheduleAlarmsFromStorage(storageContext);

                // Safety net: also ensure the periodic WorkManager task is enqueued.
                // Even if this receiver is killed by OEM battery manager before
                // completing, WorkManager will pick up the task from its own
                // internal database and re-run it.
                enqueueAlarmRescheduleWorker(context);
            } catch (Exception e) {
                Log.e(TAG, "Error during boot reschedule: " + e.getMessage(), e);
            } finally {
                pendingResult.finish();
            }
        }, "PrayerBootReceiver-Thread").start();
    }

    /**
     * Enqueue the periodic alarm-reschedule worker as a safety net.
     * WorkManager's own internal boot receiver (whitelisted by most OEMs)
     * will keep this worker alive across reboots.
     */
    private void enqueueAlarmRescheduleWorker(Context context) {
        try {
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
            Log.d(TAG, "Alarm reschedule worker enqueued from boot receiver");
        } catch (Exception e) {
            Log.w(TAG, "Failed to enqueue WorkManager task: " + e.getMessage());
        }
    }
}

