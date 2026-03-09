/**
 * Schedule Data Module
 * Handles Ramadhan date computation and prayer schedule data fetching.
 * Separated from schedule-page.js for clean business logic isolation.
 */

import { getMonthlyPrayerTimes } from '../../core/api.js';
import { getRamadhanConfig } from '../../core/database.js';
import { getSelectedOrg } from './ramadhan.js';

/* ── Public API ── */

/**
 * Fetch 30-day Ramadhan prayer schedule for the given location.
 * Computes Ramadhan dates, resolves required API months,
 * and merges API data with local calendar metadata.
 *
 * @param {Object} location - Coordinates { latitude, longitude }
 * @returns {Promise<Array|null>} Array of day entries or null on failure
 */
export async function fetchScheduleData(location) {
    const org = await getSelectedOrg();
    const { dates } = computeRamadhanDates(org);
    const requiredMonths = getRequiredMonths(dates);

    const monthResults = await Promise.all(
        requiredMonths.map(({ year, month }) =>
            getMonthlyPrayerTimes(location.latitude, location.longitude, year, month)
        )
    );

    const allDays = monthResults.filter(Boolean).flat();
    if (allDays.length === 0) return null;

    const config = getRamadhanConfig();
    return dates.map((date, index) => ({
        ramadhanDay: index + 1,
        date,
        isToday: isToday(date),
        timings: findDayData(allDays, date),
        tahunHijriah: config.tahunHijriah,
    }));
}

/**
 * Find the index of today's entry in the schedule data array.
 * @param {Array} schedule - Array of day entries
 * @returns {number} Index of today, or 0 if not found
 */
export function findTodayIndex(schedule) {
    if (!schedule) return 0;
    const idx = schedule.findIndex(entry => isToday(entry.date));
    return idx >= 0 ? idx : 0;
}

/**
 * Check whether a Date falls on the current calendar date.
 * @param {Date} date - Date to check
 * @returns {boolean}
 */
export function isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

/**
 * Get a simple date string for today (used for day-crossing detection).
 * @returns {string} e.g. "2026-2-9"
 */
export function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

/* ── Internal Functions ── */

/**
 * Compute the 30 Gregorian dates corresponding to Ramadhan
 * based on the selected organization's start date.
 */
function computeRamadhanDates(org) {
    const config = getRamadhanConfig();
    const startStr = config.tanggalSatuRamadhan[org];
    const startDate = new Date(startStr + 'T00:00:00');
    const dates = [];

    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }

    return { startDate, dates };
}

/**
 * Resolve unique year-month pairs needed for API fetches,
 * handling cases where Ramadhan spans two calendar months.
 */
function getRequiredMonths(dates) {
    const monthSet = new Map();
    for (const d of dates) {
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!monthSet.has(key)) {
            monthSet.set(key, { year: d.getFullYear(), month: d.getMonth() + 1 });
        }
    }
    return [...monthSet.values()];
}

/**
 * Find the API day data matching a specific target date.
 */
function findDayData(allDays, targetDate) {
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const yyyy = targetDate.getFullYear();
    return allDays.find(d => d.date === `${dd}-${mm}-${yyyy}`) || null;
}
