/**
 * Native Notification Module
 * Handles Android prayer time notifications with full adzan playback.
 *
 * Architecture:
 * - Custom PrayerService plugin → AlarmManager scheduling & alarm dispatch
 * - PrayerAlarmReceiver (Java)  → decides adzan playback vs standard notification
 * - @capacitor/local-notifications → permission management only
 *
 * All notification channels are created natively by the Java layer.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { parseTimeToDate } from '../prayer/prayer-times.js';

// ── Custom Plugin Bridge ───────────────────────────────────────────
const PrayerService = registerPlugin('PrayerService');

// ── Constants ──────────────────────────────────────────────────────

/** Base notification ID — each prayer gets BASE + index */
const NOTIFICATION_BASE_ID = 1000;

/**
 * Single source of truth for prayer notification configuration.
 * Maps prayer key → { title, body, isAdzan }
 */
const PRAYER_NOTIFICATION_MAP = {
    imsak: {
        title: 'Waktu Imsak',
        body: 'Waktunya untuk mulai berpuasa',
        isAdzan: false,
    },
    subuh: {
        title: 'Waktu Subuh',
        body: 'Saatnya menunaikan sholat Subuh',
        isAdzan: true,
    },
    terbit: {
        title: 'Matahari Terbit',
        body: 'Waktu syuruq — matahari telah terbit',
        isAdzan: false,
    },
    dzuhur: {
        title: 'Waktu Dzuhur',
        body: 'Saatnya menunaikan sholat Dzuhur',
        isAdzan: true,
    },
    ashar: {
        title: 'Waktu Ashar',
        body: 'Saatnya menunaikan sholat Ashar',
        isAdzan: true,
    },
    magrib: {
        title: 'Waktu Magrib',
        body: 'Saatnya menunaikan sholat Magrib',
        isAdzan: true,
    },
    isya: {
        title: "Waktu Isya'",
        body: "Saatnya menunaikan sholat Isya'",
        isAdzan: true,
    },
};

/** All prayer keys in chronological order */
const PRAYER_KEYS = ['imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'magrib', 'isya'];

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
 * Schedule notifications for all prayer times today.
 * Cancels existing prayer notifications first, then schedules only future ones.
 *
 * @param {object} timings - Prayer timings object from API
 *   e.g. { imsak: "04:30", subuh: "04:45", ... }
 */
export async function schedulePrayerNotifications(timings) {
    if (!Capacitor.isNativePlatform() || !_initialized) return;
    if (!timings) return;

    // Baca pengaturan toggle dari localStorage
    const isNotifEnabled = localStorage.getItem('satu_ramadhan_notif') !== 'false';
    const isAdzanEnabled = localStorage.getItem('satu_ramadhan_adzan') !== 'false';

    try {
        await cancelAllPrayerNotifications();

        // Jika notifikasi dimatikan, cukup cancel semua dan berhenti
        if (!isNotifEnabled) {
            console.log('[NativeNotif] Notifikasi dimatikan oleh pengguna.');
            return;
        }

        const now = new Date();
        const alarmsToSchedule = [];

        PRAYER_KEYS.forEach((key, index) => {
            const timeStr = timings[key];
            if (!timeStr) return;

            const date = parseTimeToDate(timeStr);
            if (!date || date <= now) return; // Skip past times

            const config = PRAYER_NOTIFICATION_MAP[key];
            if (!config) return;

            // Jika adzan dimatikan, override isAdzan ke false
            // agar Native hanya menampilkan notifikasi teks standar
            const shouldPlayAdzan = config.isAdzan && isAdzanEnabled;

            alarmsToSchedule.push({
                id: getNotificationId(index),
                key: key,
                title: config.title,
                body: config.body,
                isAdzan: shouldPlayAdzan,
                timestamp: date.getTime()
            });
        });

        // Schedule all natively via our generic plugin
        if (alarmsToSchedule.length > 0) {
            await PrayerService.schedule({ alarms: alarmsToSchedule });
            console.log(`[NativeNotif] Scheduled ${alarmsToSchedule.length} native alarms`);
        } else {
            console.log('[NativeNotif] No future alarms to schedule');
        }
    } catch (e) {
        console.error('[NativeNotif] Scheduling failed:', e);
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

// ── Internal: Helpers ──────────────────────────────────────────────

/**
 * Get deterministic notification ID from prayer index.
 * @param {number} index - Index in PRAYER_KEYS array
 * @returns {number} Notification ID (1001-1007)
 */
function getNotificationId(index) {
    return NOTIFICATION_BASE_ID + index + 1;
}
