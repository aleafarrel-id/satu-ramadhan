/**
 * Schedule Data Module
 * Handles dynamic Hijri month date computation and prayer schedule data fetching.
 * Works year-round: during Ramadhan uses preset dates, outside Ramadhan
 * dynamically detects the current Hijri month via Aladhan API data.
 *
 * Separated from schedule-page.js for clean business logic isolation.
 */

import { getMonthlyPrayerTimes } from '../../core/api.js';
import { getRamadhanConfig } from '../../core/database.js';
import { HIJRI_MONTH_NAMES } from '../../utils/datetime.js';
import { getActivePreset, getHijriOffset } from './ramadhan.js';

/* ── Public API ── */

/**
 * Fetch the full prayer schedule for the current Hijri month.
 * During Ramadhan: uses preset startDate/endDate.
 * Outside Ramadhan: dynamically computes the current Hijri month boundaries.
 *
 * Each entry includes hijriDay, hijriMonthName, hijriYear for dynamic UI.
 *
 * @param {Object} location - Coordinates { latitude, longitude }
 * @returns {Promise<Array|null>} Array of day entries or null on failure
 */
export async function fetchScheduleData(location) {
    const { dates, hijriMeta } = await computeHijriMonthDates(location);
    const requiredMonths = getRequiredMonths(dates);

    const monthResults = await Promise.all(
        requiredMonths.map(({ year, month }) =>
            getMonthlyPrayerTimes(location.latitude, location.longitude, year, month)
        )
    );

    const allDays = monthResults.filter(Boolean).flat();
    if (allDays.length === 0) return null;

    return dates.map((date, index) => {
        const timings = findDayData(allDays, date);

        // Hijri day assignment strategy:
        // - Preset-based (Ramadhan): index+1 is authoritative (preset defines exact boundaries)
        // - API-based (other months): use API hijriDay adjusted by offset
        let hijriDay = index + 1;
        let hijriMonthName = hijriMeta.monthName;
        let hijriYear = hijriMeta.year;

        if (!hijriMeta.isPresetBased && timings?.hijri) {
            const apiDay = parseInt(timings.hijri.day, 10);
            const adjustedDay = apiDay + hijriMeta.offset;

            if (adjustedDay >= 1 && adjustedDay <= (hijriMeta.totalDays || 30)) {
                hijriDay = adjustedDay;
            }
        }

        return {
            hijriDay,
            hijriMonthName,
            hijriYear,
            date,
            isToday: isToday(date),
            timings,
        };
    });
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
 * Compute all Gregorian dates for the current Hijri month.
 *
 * Strategy:
 * - If today falls within Ramadhan (per active preset), use preset dates.
 * - Otherwise, fetch today's API data to detect the current Hijri month,
 *   apply the calibrated offset, and compute the month boundaries.
 *
 * @param {Object} location - { latitude, longitude }
 * @returns {Promise<{ dates: Date[], hijriMeta: Object }>}
 */
async function computeHijriMonthDates(location) {
    const preset = await getActivePreset();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Check if today is within Ramadhan preset range
    if (preset) {
        const presetStart = new Date(preset.startDate + 'T00:00:00');
        const presetEnd = new Date(preset.endDate + 'T00:00:00');

        if (now >= presetStart && now <= presetEnd) {
            return computeRamadhanFromPreset(preset);
        }
    }

    // Outside Ramadhan — detect current Hijri month from API
    return await computeCurrentHijriMonth(location);
}

/**
 * Compute dates for Ramadhan using the active preset's startDate/endDate.
 * Preserves the original behavior for the Ramadhan period.
 *
 * @param {Object} preset - Active preset with startDate/endDate
 * @returns {{ dates: Date[], hijriMeta: Object }}
 */
function computeRamadhanFromPreset(preset) {
    const config = getRamadhanConfig();
    const startDate = new Date(preset.startDate + 'T00:00:00');
    const endDate = new Date(preset.endDate + 'T00:00:00');

    const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const dates = [];

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }

    return {
        dates,
        hijriMeta: {
            monthNumber: 9,
            monthName: HIJRI_MONTH_NAMES[9],
            year: config.tahunHijriah,
            totalDays,
            offset: 0,
            isPresetBased: true, // Preset is authoritative — don't override from API
        },
    };
}

/**
 * Detect the current Hijri month from API data and compute its boundaries.
 * Uses the Hijri offset from the preset to calibrate dates.
 *
 * @param {Object} location - { latitude, longitude }
 * @returns {Promise<{ dates: Date[], hijriMeta: Object }>}
 */
async function computeCurrentHijriMonth(location) {
    const config = getRamadhanConfig();

    // Get today's data from monthly cache (uses getMonthlyPrayerTimes → DRY)
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayYear = now.getFullYear();
    const todayDate = now.getDate();

    const monthData = await getMonthlyPrayerTimes(
        location.latitude, location.longitude, todayYear, todayMonth
    );

    if (!monthData || monthData.length === 0) {
        // Fallback: show current Gregorian month as ~30 days
        return computeFallbackMonth();
    }

    // Find today's entry in the monthly data
    const todayStr = `${String(todayDate).padStart(2, '0')}-${String(todayMonth).padStart(2, '0')}-${todayYear}`;
    const todayEntry = monthData.find(d => d.date === todayStr);

    if (!todayEntry?.hijri) {
        return computeFallbackMonth();
    }

    // Get Hijri info from API
    const apiHijriDay = parseInt(todayEntry.hijri.day, 10);
    const apiHijriMonth = todayEntry.hijri.month.number;
    const apiHijriYear = parseInt(todayEntry.hijri.year, 10);
    const apiMonthDays = todayEntry.hijri.month.days || 30;

    // Get the calibrated offset
    const offset = await getHijriOffset(location);

    // Apply offset to get the corrected Hijri day
    const correctedHijriDay = apiHijriDay + offset;

    // Determine which Hijri month we're actually in (after offset correction)
    let effectiveMonth = apiHijriMonth;
    let effectiveYear = apiHijriYear;
    let effectiveDay = correctedHijriDay;
    let monthTotalDays = apiMonthDays;

    if (correctedHijriDay < 1) {
        // Offset pushed us back to the previous Hijri month
        effectiveMonth = apiHijriMonth - 1;
        if (effectiveMonth < 1) {
            effectiveMonth = 12;
            effectiveYear--;
        }
        // We don't know exact days of previous month, use 30 as default
        monthTotalDays = 30;
        effectiveDay = monthTotalDays + correctedHijriDay; // correctedHijriDay is negative or 0
    } else if (correctedHijriDay > apiMonthDays) {
        // Offset pushed us into the next Hijri month
        effectiveMonth = apiHijriMonth + 1;
        if (effectiveMonth > 12) {
            effectiveMonth = 1;
            effectiveYear++;
        }
        effectiveDay = correctedHijriDay - apiMonthDays;
        // We'll try to get correct month length from adjacent data
        monthTotalDays = 30;
    }

    // Calculate the Gregorian start date of this Hijri month
    // startDate = today - (effectiveDay - 1) days
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (effectiveDay - 1));

    // Try to determine actual month length from API data
    // Look for the transition point in monthly data where Hijri month changes
    if (monthTotalDays === apiMonthDays || correctedHijriDay >= 1 && correctedHijriDay <= apiMonthDays) {
        monthTotalDays = apiMonthDays;
    }

    // Generate all dates for this Hijri month
    const dates = [];
    for (let i = 0; i < monthTotalDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }

    const monthName = HIJRI_MONTH_NAMES[effectiveMonth] || `Bulan ${effectiveMonth}`;

    return {
        dates,
        hijriMeta: {
            monthNumber: effectiveMonth,
            monthName,
            year: effectiveYear || config.tahunHijriah,
            totalDays: monthTotalDays,
            offset,
        },
    };
}

/**
 * Fallback: generate dates for the current Gregorian month.
 * Used when API data is unavailable.
 * @returns {{ dates: Date[], hijriMeta: Object }}
 */
function computeFallbackMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates = [];

    for (let i = 1; i <= daysInMonth; i++) {
        dates.push(new Date(year, month, i));
    }

    return {
        dates,
        hijriMeta: {
            monthNumber: 0,
            monthName: '—',
            year: 0,
            totalDays: daysInMonth,
            offset: 0,
        },
    };
}

/* ── Shared Helpers ── */

/**
 * Resolve unique year-month pairs needed for API fetches,
 * handling cases where the Hijri month spans two Gregorian calendar months.
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
