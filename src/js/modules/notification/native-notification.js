/**
 * Native Notification Module
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

export const PrayerService = registerPlugin('PrayerService');

let _initialized = false;

export async function initNotificationService() {
    if (!Capacitor.isNativePlatform() || _initialized) return;

    const granted = await checkNotificationPermission();
    if (granted) _initialized = true;
}

export async function checkNotificationPermission() {
    if (!Capacitor.isNativePlatform()) return false;
    try {
        const status = await LocalNotifications.checkPermissions();
        return status.display === 'granted';
    } catch (e) {
        return false;
    }
}

export async function requestNotificationPermission() {
    if (!Capacitor.isNativePlatform()) return false;
    try {
        const result = await LocalNotifications.requestPermissions();
        const granted = result.display === 'granted';
        if (granted) _initialized = true;
        return granted;
    } catch (e) {
        return false;
    }
}

export async function cancelAllPrayerNotifications() {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PrayerService.cancelAll();
    } catch (e) {}
}
