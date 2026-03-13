/**
 * Native Notification Module
 * Handles Android prayer time notification permissions and basic
 * native plugin operations (play/stop adzan, cancel alarms).
 *
 * Architecture:
 * - Custom PrayerService plugin → AlarmManager scheduling & alarm dispatch
 * - PrayerAlarmReceiver (Java)  → decides adzan playback vs standard notification
 * - @capacitor/local-notifications → permission management only
 *
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

// ── Custom Plugin Bridge ───────────────────────────────────────────
export const PrayerService = registerPlugin('PrayerService');

// ── State ──────────────────────────────────────────────────────────
let _initialized = false;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Initialize the notification service.
 * Should be called once at app startup.
 * Requests notification permissions from the user.
 */
export async function initNotificationService() {
    if (!Capacitor.isNativePlatform()) {
        console.log('[NativeNotif] Skipping — not running on native platform');
        return;
    }

    if (_initialized) return;

    try {
        const hasPermission = await ensurePermissions();
        if (!hasPermission) {
            console.warn('[NativeNotif] Notification permission denied');
            return;
        }

        _initialized = true;
        console.log('[NativeNotif] Initialized successfully');
    } catch (e) {
        console.error('[NativeNotif] Initialization failed:', e);
    }
}

/**
 * Cancel all prayer-related notifications.
 */
export async function cancelAllPrayerNotifications() {
    if (!Capacitor.isNativePlatform()) return;

    try {
        await PrayerService.cancelAll();
    } catch (e) {
        console.warn('[NativeNotif] Cancel failed:', e);
    }
}

// ── Internal: Permissions ──────────────────────────────────────────

/**
 * Check and request notification permissions.
 * @returns {boolean} true if granted
 */
async function ensurePermissions() {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;

    const request = await LocalNotifications.requestPermissions();
    return request.display === 'granted';
}
