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
 * Receiver that reschedules prayer alarms after device boot or app update.
 * Handles Direct Boot (LOCKED_BOOT_COMPLETED) and regular boot via CE/DE storage layers.
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

        // goAsync() avoids BroadcastReceiver execution limits (ANR) while accessing storage.
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                // Primary path: reschedule alarms directly from storage
                PrayerServicePlugin.rescheduleAlarmsFromStorage(storageContext);

                // Safety net: ensure WorkManager periodic task is running.
                enqueueAlarmRescheduleWorker(context);
            } catch (Exception e) {
                Log.e(TAG, "Error during boot reschedule: " + e.getMessage(), e);
            } finally {
                pendingResult.finish();
            }
        }, "PrayerBootReceiver-Thread").start();
    }

    /**
     * Enqueues the periodic alarm-reschedule safeguard worker.
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

