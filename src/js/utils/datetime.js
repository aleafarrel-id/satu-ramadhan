/**
 * Datetime Utilities
 * Centralized date/time formatting functions (language-neutral).
 *
 * All localized name data (months, days, Hijri months) has been moved
 * to the i18n JSON files under public/multi-language/{lang}/components/ui/header.json.
 * Components should obtain translated names via t() and pass them
 * into these utility functions as parameters where needed.
 */

// Ordered prayer time keys used in the schedule view (language-neutral)
export const SCHEDULE_PRAYERS = ['imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'magrib', 'isya'];

/**
 * Short date format.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string[]} monthNames - Array of 12 short month names (0-indexed)
 * @returns {string} e.g. "19 Feb"
 */
export function formatDateShort(dateStr, monthNames) {
    if (!dateStr) return '-';
    const [, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${monthNames[parseInt(m) - 1]}`;
}

/**
 * Verbose date format.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string[]} monthNames - Array of 12 full month names (0-indexed)
 * @returns {string} e.g. "19 Februari 2024"
 */
export function formatDateVerbose(dateStr, monthNames) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${monthNames[parseInt(m) - 1]} ${y}`;
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
export function formatDateToYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Check if two Date objects represent the same calendar day.
 * @param {Date} d1
 * @param {Date} d2
 * @returns {boolean}
 */
export function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

/**
 * Calculates the 29th and 30th days of Ramadhan from a given start date.
 * @param {string} startDateStr - YYYY-MM-DD
 * @returns {{ day29: string, day30: string }}
 */
export function calcRamadhanEndDates(startDateStr) {
    const [y, m, d] = startDateStr.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const day29 = new Date(start); day29.setDate(start.getDate() + 28);
    const day30 = new Date(start); day30.setDate(start.getDate() + 29);
    return {
        day29: formatDateToYYYYMMDD(day29),
        day30: formatDateToYYYYMMDD(day30),
    };
}

/* ── Ihtiyat: Centralized Prayer Time Adjustment ── */

/**
 * Strip timezone suffix from an API time string.
 * Example: "04:30 (WIB)" → "04:30"
 *
 * @param {string} timeStr - Raw time string from the API
 * @returns {string} Clean time string in "HH:mm" format
 */
export function cleanTimeStr(timeStr) {
    if (!timeStr) return timeStr;
    return timeStr.toString().replace(/\s*\(.*\)/, '').trim();
}

/**
 * Add or subtract minutes from a time string ("HH:mm" or "HH:mm (WIB)").
 * Handles hour rollover automatically (e.g. 23:59 + 2 → 00:01).
 * Always returns a clean "HH:mm" string.
 *
 * Used centrally for applying Ihtiyat (Kemenag RI +2 min precaution)
 * and deriving Imsak (Fajr − 10 min) across the entire application.
 *
 * @param {string} timeStr - e.g. "04:30" or "04:30 (WIB)"
 * @param {number} minutesToAdd - Minutes to offset (negative to subtract)
 * @returns {string} Adjusted time, e.g. "04:32"
 */
export function adjustTimeStr(timeStr, minutesToAdd) {
    if (!timeStr) return timeStr;
    const clean = cleanTimeStr(timeStr);
    const [hours, mins] = clean.split(':').map(Number);

    if (isNaN(hours) || isNaN(mins)) return timeStr;

    // Use an arbitrary Date object to handle hour rollover gracefully
    const d = new Date(2000, 0, 1, hours, mins, 0);
    d.setMinutes(d.getMinutes() + minutesToAdd);

    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');

    return `${h}:${m}`;
}
