/**
 * Notification Sync Module
 * Centralized 30-day rolling pre-scheduling for prayer notifications.
 *
 * On every app open / resume:
 *   1. Cancels ALL existing prayer alarms from the system
 *   2. Fetches prayer times for today → today + 29 days
 *   3. Builds & schedules up to 210 alarms (7 prayers × 30 days)
 *   4. Sends "Anchor Location" to Native Java for background location detection
 *
 * This module is the SINGLE entry point for notification scheduling.
 * It replaces the old per-day `schedulePrayerNotifications()` approach.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import { getSavedLocation } from '../../core/geolocation.js';
import { getMonthlyPrayerTimes } from '../../core/api.js';

// ── Custom Plugin Bridge ───────────────────────────────────────────
const PrayerService = registerPlugin('PrayerService');

// ── Constants ──────────────────────────────────────────────────────

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

// ── State ──────────────────────────────────────────────────────────

/** Guard to prevent concurrent sync operations */
let _syncing = false;

// ── Public API ─────────────────────────────────────────────────────

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
        // ─── 1. Read user preferences ──────────────────────────────
        const isNotifEnabled = localStorage.getItem('satu_ramadhan_notif') !== 'false';
        const isAdzanEnabled = localStorage.getItem('satu_ramadhan_adzan') !== 'false';

        // ─── 2. Cancel ALL existing alarms first ───────────────────
        await PrayerService.cancelAll();

        // ─── 3. If notifications are disabled globally, stop here ──
        if (!isNotifEnabled) {
            console.log('[NotifSync] Notifications disabled by user — all alarms cleared');
            return;
        }

        // ─── 4. Retrieve the user's active location ────────────────
        const location = await getSavedLocation();
        if (!location?.latitude || !location?.longitude) {
            console.warn('[NotifSync] No saved location available, cannot sync');
            return;
        }

        // ─── 5. Fetch prayer times for 30 days ─────────────────────
        const allDays = await fetch30DaysData(location.latitude, location.longitude);
        if (!allDays || allDays.length === 0) {
            console.warn('[NotifSync] No prayer time data available for scheduling');
            return;
        }

        // ─── 6. Build the massive alarm array ──────────────────────
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

        // ─── 7. Send everything to native plugin ───────────────────
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

        // ─── 8. Start background location detection ──────
        //    Ensures the passive worker is always active after sync.
        //    Uses KEEP policy — safe to call on every sync without duplicates.
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

// ── Internal: Data Fetching ────────────────────────────────────────

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

// ── Internal: Date / Time Helpers ──────────────────────────────────

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
