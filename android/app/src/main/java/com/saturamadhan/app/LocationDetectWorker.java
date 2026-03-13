package com.saturamadhan.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Tasks;

import java.util.concurrent.TimeUnit;

/**
 * Passive background location detection worker.
 *
 * Scheduled periodically by WorkManager (~6h, flex ~3h). On each execution:
 *
 *   1. Check 24-hour cooldown — skip if recently alerted
 *   2. Check notifications enabled — skip if user disabled notifications
 *   3. Read anchor coordinates from SharedPreferences (set during notification sync)
 *   4. Retrieve the OS-cached "Last Known Location" via FusedLocationProviderClient
 *      ⚠ This does NOT turn on GPS or request a new fix — purely passive/piggybacking
 *   5. Compute Haversine distance between last known location and anchor
 *   6. If distance ≥ 50 km ("Astronomical Threshold"):
 *      • Show a local notification prompting the user to open the app
 *      • Set cooldown timestamp to prevent repeat alerts for 24 hours
 *   7. When the user taps the notification → app opens → appStateChange fires
 *      → syncNotifications() runs → new GPS fix → new anchor → fresh 210 alarms
 *
 * Design Principles:
 * - Zero battery drain: no GPS activation, only reads cached location
 * - Anti-spam: 24-hour cooldown between alerts
 * - Graceful degradation: if no cached location available, silently skip
 * - Always returns Result.success() — failures are non-fatal
 */
public class LocationDetectWorker extends Worker {

    private static final String TAG = "LocationDetectWorker";

    public LocationDetectWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(
                Constants.PREF_NAME, Context.MODE_PRIVATE);

        // ─── 1. Check if notifications are enabled ─────────────────
        boolean notificationsEnabled = prefs.getBoolean(
                Constants.KEY_NOTIFICATIONS_ENABLED, true);
        if (!notificationsEnabled) {
            Log.d(TAG, "Notifications disabled by user, skipping detection");
            return Result.success();
        }

        // ─── 2. Check 24-hour cooldown ─────────────────────────────
        long lastAlertTime = prefs.getLong(Constants.KEY_LAST_DETECTION_ALERT, 0);
        long now = System.currentTimeMillis();

        if (now - lastAlertTime < Constants.COOLDOWN_MS) {
            long remainingHours = (Constants.COOLDOWN_MS - (now - lastAlertTime))
                    / (60 * 60 * 1000);
            Log.d(TAG, "Within cooldown period (~" + remainingHours + "h remaining), skipping");
            return Result.success();
        }

        // ─── 3. Read anchor from SharedPreferences ─────────────────
        float anchorLat = prefs.getFloat(Constants.KEY_ANCHOR_LAT, 0f);
        float anchorLon = prefs.getFloat(Constants.KEY_ANCHOR_LON, 0f);

        if (anchorLat == 0f && anchorLon == 0f) {
            Log.d(TAG, "No anchor location set (user hasn't synced yet), skipping");
            return Result.success();
        }

        // ─── 4. Get last known location (passive, NO GPS request) ──
        try {
            FusedLocationProviderClient fusedClient =
                    LocationServices.getFusedLocationProviderClient(context);

            // Tasks.await() blocks the worker thread (which is fine — Workers run
            // on a background thread). Timeout prevents indefinite blocking.
            Location lastLocation = Tasks.await(
                    fusedClient.getLastLocation(), 10, TimeUnit.SECONDS);

            if (lastLocation == null) {
                Log.d(TAG, "No cached location available from OS, skipping");
                return Result.success();
            }

            // ─── 5. Calculate Haversine distance ───────────────────
            double distanceKm = haversine(
                    anchorLat, anchorLon,
                    lastLocation.getLatitude(), lastLocation.getLongitude()
            );

            Log.d(TAG, String.format(
                    "Anchor: (%.4f, %.4f) → Current: (%.4f, %.4f) = %.1f km (threshold: %.0f km)",
                    anchorLat, anchorLon,
                    lastLocation.getLatitude(), lastLocation.getLongitude(),
                    distanceKm, Constants.DISTANCE_THRESHOLD_KM
            ));

            // ─── 6. Threshold check ───────────────────────────────
            if (distanceKm >= Constants.DISTANCE_THRESHOLD_KM) {
                Log.d(TAG, "Threshold exceeded! User has moved significantly.");
                showLocationChangedNotification(context);

                // Set cooldown — no more alerts for 24 hours
                prefs.edit()
                        .putLong(Constants.KEY_LAST_DETECTION_ALERT, now)
                        .apply();
                Log.d(TAG, "Cooldown activated for 24 hours");
            }

        } catch (SecurityException e) {
            Log.w(TAG, "Location permission not available in background: " + e.getMessage());
        } catch (Exception e) {
            Log.w(TAG, "Failed to retrieve last known location: " + e.getMessage());
        }

        // Always succeed — failures in location detection are non-fatal
        return Result.success();
    }

    // ── Haversine Formula ──────────────────────────────────────────────

    /**
     * Calculate the great-circle distance between two coordinates on Earth.
     *
     * @param lat1 Latitude of point 1 (degrees)
     * @param lon1 Longitude of point 1 (degrees)
     * @param lat2 Latitude of point 2 (degrees)
     * @param lon2 Longitude of point 2 (degrees)
     * @return Distance in kilometers
     */
    private static double haversine(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371.0; // Earth's mean radius in km
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);

        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ── Notification ───────────────────────────────────────────────────

    /**
     * Show a local notification prompting the user to open the app
     * and update their prayer schedule for the new location.
     */
    private void showLocationChangedNotification(Context context) {
        NotificationManager nm = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Ensure notification channel exists (Android 8.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    Constants.CHANNEL_ID_LOCATION,
                    context.getString(R.string.notification_channel_location_name),
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription(
                    context.getString(R.string.notification_channel_location_desc));
            nm.createNotificationChannel(channel);
        }

        // Build launch intent — opens the app, triggering appStateChange → syncNotifications
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            launchIntent.setPackage(null);
            launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
        }

        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                Constants.NOTIFICATION_ID_LOCATION,
                launchIntent != null ? launchIntent : new Intent(),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, Constants.CHANNEL_ID_LOCATION)
                .setContentTitle(context.getString(R.string.notification_title_location_changed))
                .setContentText(context.getString(R.string.notification_text_location_changed))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        nm.notify(Constants.NOTIFICATION_ID_LOCATION, builder.build());
        Log.d(TAG, "Location changed notification sent");
    }
}
