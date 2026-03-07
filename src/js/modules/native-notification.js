/**
 * Native Notification Module
 * Handles Android prayer time notifications with full adzan playback.
 *
 * Architecture:
 * - @capacitor/local-notifications → scheduling & basic notification display
 * - Custom AdzanService plugin     → full-length adzan via Foreground Service
 *
 * Notification channels:
 * - adzan_subuh   → silent channel (audio via MediaPlayer) for Subuh
 * - adzan_regular → silent channel (audio via MediaPlayer) for Dzuhur/Ashar/Magrib/Isya
 * - prayer_default → system default sound for Imsak/Terbit
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { parseTimeToDate } from './prayer-times.js';

// ── Custom Plugin Bridge ───────────────────────────────────────────
const PrayerService = registerPlugin('PrayerService');

// ── Constants ──────────────────────────────────────────────────────

/** Base notification ID — each prayer gets BASE + index */
const NOTIFICATION_BASE_ID = 1000;

/**
 * Single source of truth for prayer notification configuration.
 * Maps prayer key → { channelId, title, body, isAdzan }
 */
const PRAYER_NOTIFICATION_MAP = {
    imsak: {
        channelId: 'prayer_default',
        title: 'Waktu Imsak',
        body: 'Waktunya untuk mulai berpuasa',
        isAdzan: false,
    },
    subuh: {
        channelId: 'adzan_subuh',
        title: 'Waktu Subuh',
        body: 'Saatnya menunaikan sholat Subuh',
        isAdzan: true,
    },
    terbit: {
        channelId: 'prayer_default',
        title: 'Matahari Terbit',
        body: 'Waktu syuruq — matahari telah terbit',
        isAdzan: false,
    },
    dzuhur: {
        channelId: 'adzan_regular',
        title: 'Waktu Dzuhur',
        body: 'Saatnya menunaikan sholat Dzuhur',
        isAdzan: true,
    },
    ashar: {
        channelId: 'adzan_regular',
        title: 'Waktu Ashar',
        body: 'Saatnya menunaikan sholat Ashar',
        isAdzan: true,
    },
    magrib: {
        channelId: 'adzan_regular',
        title: 'Waktu Magrib',
        body: 'Saatnya menunaikan sholat Magrib',
        isAdzan: true,
    },
    isya: {
        channelId: 'adzan_regular',
        title: "Waktu Isya'",
        body: "Saatnya menunaikan sholat Isya'",
        isAdzan: true,
    },
};

/** All prayer keys in chronological order */
const PRAYER_KEYS = ['imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'magrib', 'isya'];

/** Notification channel definitions */
const CHANNELS = [
    {
        id: 'adzan_subuh',
        name: 'Adzan Subuh',
        description: 'Notifikasi adzan waktu Subuh',
        importance: 4, // HIGH — so notification pops up
        sound: '', // Silent — audio played via MediaPlayer
        vibration: true,
    },
    {
        id: 'adzan_regular',
        name: 'Adzan',
        description: 'Notifikasi adzan waktu sholat',
        importance: 4,
        sound: '',
        vibration: true,
    },
    {
        id: 'prayer_default',
        name: 'Pengingat Sholat',
        description: 'Notifikasi pengingat waktu sholat',
        importance: 3, // DEFAULT — with system sound
        vibration: true,
    },
];

/**
 * Preferences keys — prepared for future toggle features.
 * Not actively used in UI yet, but the module respects them.
 */
const PREF_KEYS = {
    NOTIFICATION_ENABLED: 'notif_enabled',
    ADZAN_SOUND_ENABLED: 'adzan_sound_enabled',
};

// ── State ──────────────────────────────────────────────────────────
let _initialized = false;
let _listenerRegistered = false;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Initialize the notification service.
 * Should be called once at app startup.
 * Sets up permissions, channels, action types, and event listeners.
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

        await ensureChannels();

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

    try {
        await cancelAllPrayerNotifications();

        const now = new Date();
        const alarmsToSchedule = [];

        PRAYER_KEYS.forEach((key, index) => {
            const timeStr = timings[key];
            if (!timeStr) return;

            const date = parseTimeToDate(timeStr);
            if (!date || date <= now) return; // Skip past times

            const config = PRAYER_NOTIFICATION_MAP[key];
            if (!config) return;

            // Send rich alarm data to native AlarmManager
            alarmsToSchedule.push({
                id: getNotificationId(index),
                key: key,
                title: config.title,
                body: config.body,
                isAdzan: config.isAdzan,
                timestamp: date.getTime()
            });
        });

        // Schedule all (Adzan + Standard) natively via our generic plugin
        if (alarmsToSchedule.length > 0) {
            await PrayerService.schedule({ alarms: alarmsToSchedule });
            console.log(`[NativeNotif] Scheduled ${alarmsToSchedule.length} native alarms (Unification)`);
        } else {
            console.log('[NativeNotif] No alarms to schedule');
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
        // Fallback cleanup for old Capacitor notifications just in case
        const ids = PRAYER_KEYS.map((_, i) => ({ id: getNotificationId(i) }));
        await LocalNotifications.cancel({ notifications: ids });
    } catch (e) {
        console.warn('[NativeNotif] Cancel failed:', e);
    }
}

/**
 * Stop adzan playback from JS side.
 * Can be called from UI if needed.
 */
export async function stopAdzan() {
    if (!Capacitor.isNativePlatform()) return;

    try {
        await PrayerService.stop();
        console.log('[NativeNotif] Adzan stopped via JS');
    } catch (e) {
        console.warn('[NativeNotif] Stop adzan failed:', e);
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

// ── Internal: Channels ─────────────────────────────────────────────

/**
 * Create notification channels (Android 8+).
 * Channels are idempotent — creating an existing channel is a no-op.
 */
async function ensureChannels() {
    for (const channel of CHANNELS) {
        await LocalNotifications.createChannel(channel);
    }
    console.log('[NativeNotif] Channels created:', CHANNELS.map(c => c.id).join(', '));
}

// Removed unused Action Types

// ── Internal: Event Listeners ──────────────────────────────────────

// Removed Event Listeners since Native Alarm handles everything

// ── Internal: Helpers ──────────────────────────────────────────────

/**
 * Get deterministic notification ID from prayer index.
 * @param {number} index - Index in PRAYER_KEYS array
 * @returns {number} Notification ID (1001-1007)
 */
function getNotificationId(index) {
    return NOTIFICATION_BASE_ID + index + 1;
}
