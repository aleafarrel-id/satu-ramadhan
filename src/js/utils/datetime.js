/**
 * Datetime Utilities
 * Centralized localization data and formatting functions for dates.
 * DRY implementation for consistent month/day names across components.
 */

// Full localized month names (1-indexed mapping implicitly or 0-indexed in array)
export const MONTH_NAMES = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Short localized month names
export const MONTH_NAMES_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

// 1-indexed object mapping for direct lookup (legacy support)
export const MONTH_ID = {
    1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
    5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
};

// Weekday headers (Monday-first or Sunday-first depending on context, typically Mon-Sun or Sun-Sat)
// In JS Date, 0 is Sunday.
export const WEEKDAY_HEADERS_SUN_FIRST = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const WEEKDAY_HEADERS_MON_FIRST = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/**
 * Short date format.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} e.g. "19 Feb"
 */
export function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const [, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${MONTH_NAMES_SHORT[parseInt(m) - 1]}`;
}

/**
 * Verbose date format.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} e.g. "19 Februari 2024"
 */
export function formatDateVerbose(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
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
