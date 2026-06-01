/**
 * Native Notification Module
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../system/platform.js';

export const PrayerService = registerPlugin('PrayerService');

let _initialized = false;

export async function initNotificationService() {
    if (!isNative || _initialized) return;

    const granted = await checkNotificationPermission();
    if (granted) _initialized = true;
}

export async function checkNotificationPermission() {
    if (!isNative) return false;
    try {
        const status = await LocalNotifications.checkPermissions();
        return status.display === 'granted';
    } catch {
        return false;
    }
}

export async function requestNotificationPermission() {
    if (!isNative) return false;
    try {
        const result = await LocalNotifications.requestPermissions();
        const granted = result.display === 'granted';
        if (granted) _initialized = true;
        return granted;
    } catch {
        return false;
    }
}

export async function cancelAllPrayerNotifications() {
    if (!isNative) return;
    try {
        await PrayerService.cancelAll();
    } catch {}
}
