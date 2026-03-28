/**
 * Native Notification Module
 */

// Core & Libraries
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

export const PrayerService = registerPlugin('PrayerService');

let _initialized = false;

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
