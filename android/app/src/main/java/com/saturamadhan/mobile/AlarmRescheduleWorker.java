package com.saturamadhan.mobile;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * WorkManager-based safety net for alarm rescheduling.
 *
 * Why this exists:
 *   WorkManager has its OWN internal boot receiver (androidx.work.impl.background
 *   .systemalarm.RescheduleReceiver) that is maintained by Google and whitelisted
 *   by most OEMs — even those that block custom BOOT_COMPLETED receivers.
 *
 *   By scheduling this worker periodically, we get a second chance to reschedule
 *   prayer alarms even when PrayerBootReceiver is blocked by the OEM.
 *
 * When it runs:
 *   - Periodically (every 6 hours, flex 3 hours) via WorkManager
 *   - Automatically after device reboot (WorkManager persists its queue in a
 *     Room database and re-enqueues all pending work on boot)
 *
 * What it does:
 *   - Calls PrayerServicePlugin.rescheduleAlarmsFromStorage() to ensure any
 *     alarms that were lost (due to reboot, OEM kill, etc.) are re-registered
 *     with AlarmManager.
 *
 * This worker is intentionally lightweight — if alarms are already scheduled,
 * rescheduleAlarmsFromStorage() will cancel-and-reschedule (an idempotent operation).
 */
public class AlarmRescheduleWorker extends Worker {

    private static final String TAG = "AlarmRescheduleWorker";

    public AlarmRescheduleWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Periodic alarm reschedule check triggered by WorkManager");

        try {
            Context context = getApplicationContext();
            PrayerServicePlugin.rescheduleAlarmsFromStorage(context);
            Log.d(TAG, "Alarm reschedule completed successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to reschedule alarms: " + e.getMessage(), e);
            // Always return success — failures in rescheduling are non-fatal.
            // The next periodic run will try again.
        }

        return Result.success();
    }
}
