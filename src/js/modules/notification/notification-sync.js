/**
 * Notification Sync Module
 */

// Core & Libraries
import { Capacitor } from '@capacitor/core';
import { getSavedLocation } from '../../core/geolocation.js';
import { getMonthlyPrayerTimes } from '../../core/api.js';
import { PrayerService } from './native-notification.js';

/** Number of days to pre-schedule ahead (inclusive of today) */
const ROLLING_DAYS = 30;

/**
 * Base ID for rolling alarm schedule.
 * Formula: ALARM_BASE_ID + (dayOffset * 10) + prayerIndex
 * Range : 5000 – 5296  (30 days × 7 prayers with 10-slot spacing)
 */
const ALARM_BASE_ID = 5000;

/** Prayer keys in chronological order */
const PRAYER_KEYS = [
    'imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'magrib', 'isya',
];

/**
 * Notification content configuration per prayer.
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
        body: 'Waktu Syuruq — Matahari telah terbit',
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

/** Guard to prevent concurrent sync operations */
let _syncing = false;

/**
 * Perform a full 30-day rolling notification sync.
 *
 * Safe to call multiple times — concurrent calls are debounced.
 * Should be invoked on:
 *   • App startup (initApp)
 *   • App resume from background (appStateChange)
 *   • Settings toggle change (notification / adzan)
 */
export async function syncNotifications() {
    if (!Capacitor.isNativePlatform()) {
        console.log('[NotifSync] Skipping — not running on native platform');
        return;
    }

    // Prevent concurrent syncs (e.g. rapid resume events)
    if (_syncing) {
        console.log('[NotifSync] Sync already in progress, skipping');
        return;
    }

    _syncing = true;

    try {
        const isNotifEnabled = localStorage.getItem('satu_ramadhan_notif') !== 'false';
        const isAdzanEnabled = localStorage.getItem('satu_ramadhan_adzan') !== 'false';

        await PrayerService.cancelAll();

        if (!isNotifEnabled) {
            console.log('[NotifSync] Notifications disabled by user — all alarms cleared');
            return;
        }

        const location = await getSavedLocation();
        if (!location?.latitude || !location?.longitude) {
            console.warn('[NotifSync] No saved location available, cannot sync');
            return;
        }

        const allDays = await fetch30DaysData(location.latitude, location.longitude);
        if (!allDays || allDays.length === 0) {
            console.warn('[NotifSync] No prayer time data available for scheduling');
            return;
        }

        const now = Date.now();
        const alarmsToSchedule = [];

        for (let dayOffset = 0; dayOffset < ROLLING_DAYS; dayOffset++) {
            const targetDate = new Date();
            targetDate.setHours(0, 0, 0, 0);
            targetDate.setDate(targetDate.getDate() + dayOffset);

            const dateStr = formatDateForLookup(targetDate);
            const dayData = allDays.find(d => d.date === dateStr);

            if (!dayData) continue;

            PRAYER_KEYS.forEach((key, prayerIndex) => {
                const timeStr = dayData[key];
                if (!timeStr) return;

                const timestamp = parseDateTimeToMs(targetDate, timeStr);
                if (!timestamp || timestamp <= now) return;

                const config = PRAYER_NOTIFICATION_MAP[key];
                if (!config) return;

                const shouldPlayAdzan = config.isAdzan && isAdzanEnabled;

                alarmsToSchedule.push({
                    id: ALARM_BASE_ID + (dayOffset * 10) + prayerIndex,
                    key,
                    title: config.title,
                    body: config.body,
                    isAdzan: shouldPlayAdzan,
                    timestamp,
                });
            });
        }

        if (alarmsToSchedule.length > 0) {
            await PrayerService.schedule({
                alarms: alarmsToSchedule,
                anchorLat: location.latitude,
                anchorLon: location.longitude,
            });
            console.log(
                `[NotifSync] Synced ${alarmsToSchedule.length} alarms ` +
                `for ${ROLLING_DAYS} days (anchor: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`
            );
        } else {
            console.log('[NotifSync] No future alarms to schedule');
        }

        try {
            await PrayerService.startLocationDetection();
            console.log('[NotifSync] Background location detection worker active');
        } catch (e) {
            console.warn('[NotifSync] Could not start location detection:', e.message);
        }
    } catch (e) {
        console.error('[NotifSync] Sync failed:', e);
    } finally {
        _syncing = false;
    }
}

/**
 * Fetch prayer time data covering the next 30 days.
 * Uses the existing `getMonthlyPrayerTimes` API (which caches aggressively)
 * to pull either 1 or 2 Gregorian calendar months, then merges them.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Array|null>} flat array of day objects
 */
async function fetch30DaysData(latitude, longitude) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDay = new Date(today);
    lastDay.setDate(lastDay.getDate() + ROLLING_DAYS - 1);

    // Determine which Gregorian month(s) we need
    const monthsToFetch = getRequiredMonths(today, lastDay);

    // Fetch all needed months in parallel (api.js caches, so repeat calls are free)
    const monthResults = await Promise.all(
        monthsToFetch.map(({ year, month }) =>
            getMonthlyPrayerTimes(latitude, longitude, year, month)
        )
    );

    // Merge into a single flat array
    return monthResults.filter(Boolean).flat();
}

/**
 * Calculate which distinct Gregorian year-month pairs are needed
 * to cover the date range [startDate, endDate].
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Array<{year: number, month: number}>}
 */
function getRequiredMonths(startDate, endDate) {
    const months = new Map();
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
        if (!months.has(key)) {
            months.set(key, {
                year: cursor.getFullYear(),
                month: cursor.getMonth() + 1,
            });
        }
        // Jump to the 1st of next month
        cursor.setMonth(cursor.getMonth() + 1);
        cursor.setDate(1);
    }

    return [...months.values()];
}

/**
 * Format a Date as "DD-MM-YYYY" for matching against API data.
 * Must match the format returned by `transformTimings` in api.js.
 *
 * @param {Date} date
 * @returns {string} e.g. "13-03-2026"
 */
function formatDateForLookup(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

/**
 * Combine a calendar date with a time string to produce an absolute
 * timestamp in milliseconds (local timezone).
 *
 * @param {Date} date     - the target calendar date (time part is ignored)
 * @param {string} timeStr - e.g. "04:30" or "04:30 (WIB)"
 * @returns {number|null}  - Unix timestamp in ms, or null on parse error
 */
function parseDateTimeToMs(date, timeStr) {
    try {
        const cleanTime = timeStr.replace(/\s*\(.*\)/, '');
        const [hours, minutes] = cleanTime.split(':').map(Number);

        if (isNaN(hours) || isNaN(minutes)) return null;

        const d = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            hours,
            minutes,
            0,
            0
        );
        return d.getTime();
    } catch {
        return null;
    }
}
