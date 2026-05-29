/**
 * Local Prayer Time Calculator
 *
 * Offline fallback engine using the `adhan` library (batoulapps).
 * Provides astronomically accurate prayer times without any network calls.
 *
 * Calculation standard: Kemenag RI
 *   - Fajr (Subuh) angle : 20°
 *   - Isha (Isya) angle  : 18°
 *   - Asr madhab         : Shafi (shadow ratio 1x)
 *   - Ihtiyat precaution : +2 min for all prayers except Sunrise
 *   - Imsak              : Subuh − 10 min
 *
 * Exported functions match the exact return shape of api.js transformers,
 * so they are drop-in replacements for the API layer.
 */

import { Coordinates, CalculationMethod, Madhab, PrayerTimes, Qibla, HighLatitudeRule, Shafaq } from 'adhan';
import { adjustTimeStr, cleanTimeStr } from '../utils/datetime.js';
import { getActiveMethodConfig, getActiveShafaqParam } from './calculation-resolver.js';

/**
 * Build adhan calculation parameters based on active method config.
 * @param {number} lat - Latitude of the calculation point.
 * @returns {adhan.CalculationParameters}
 */
function getCalculationParams(lat) {
    const config = getActiveMethodConfig();
    const params = CalculationMethod.MuslimWorldLeague();
    params.fajrAngle = config.fajrAngle;
    params.ishaAngle = config.ishaAngle;
    params.madhab    = config.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;

    // Activate high-latitude compensation only above ±48° latitude.
    // Excluded for methods using a fixed Isha interval (ishaAngle === 90,
    // e.g. Umm al-Qura, Gulf) to avoid conflicting with adhan's internal flag.
    if (Math.abs(lat) > 48 && config.ishaAngle !== 90) {
        params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
    }

    // Apply shafaq twilight definition for countries that require it (e.g. Scandinavia).
    // Shafaq.Ahmer (red twilight) is standard when the white twilight never fully disappears.
    const shafaqValue = getActiveShafaqParam();
    if (shafaqValue && typeof Shafaq !== 'undefined') {
        const shafaqMap = {
            ahmer:   Shafaq.Ahmer,
            abyad:   Shafaq.Abyad,
            general: Shafaq.General,
        };
        if (shafaqMap[shafaqValue]) {
            params.shafaq = shafaqMap[shafaqValue];
        }
    }

    return params;
}

/**
 * Convert a JavaScript Date object to "HH:mm" string in local time.
 * @param {Date} date
 * @returns {string}
 */
function dateToHHmm(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

/**
 * Format a Date object to "DD-MM-YYYY" string (matches Aladhan API date format).
 * @param {Date} date
 * @returns {string}
 */
function formatDateDDMMYYYY(date) {
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

/**
 * Compute the total number of days in the current Hijri month.
 *
 * Strategy: iterate forward from `date` until the Hijri month changes,
 * then back-calculate: totalDays = hijriDay + (daysToNextMonth - 1).
 *
 * @param {Date}   date     - The reference Gregorian date
 * @param {number} hijriDay - The Hijri day number of `date`
 * @returns {number} Total days in the current Hijri month (29 or 30)
 */
function computeHijriMonthDays(date, hijriDay) {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' });
    const baseMonth = parseInt(fmt.format(date), 10);

    for (let offset = 1; offset <= 31; offset++) {
        const check = new Date(date.getTime() + offset * 86_400_000);
        if (parseInt(fmt.format(check), 10) !== baseMonth) {
            return hijriDay + (offset - 1);
        }
    }
    return 30;
}

/**
 * Generate a Hijri date object from a Gregorian date using the device's
 * islamic-umalqura calendar (Umm Al-Qura, consistent with Aladhan API).
 *
 * Returns an object shape identical to the Aladhan API's hijri field:
 *   { day: "8", month: { number: 10, days: 29 }, year: "1447" }
 *
 * The Hijri offset for NU/Muhammadiyah presets is applied downstream
 * by schedule-data.js, exactly as it is for API data.
 *
 * @param {Date} date - Gregorian date to convert
 * @returns {{ day: string, month: { number: number, days: number }, year: string }}
 */
export function generateOfflineHijri(date) {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
        day: 'numeric', month: 'numeric', year: 'numeric',
    });

    const parts    = fmt.formatToParts(date);
    const get      = (type) => parts.find(p => p.type === type)?.value ?? '0';

    const day      = get('day');
    const month    = parseInt(get('month'), 10);
    const year     = get('year');
    const hijriDay = parseInt(day, 10);

    const days = computeHijriMonthDays(date, hijriDay);

    return {
        day,
        month: { number: month, days },
        year,
    };
}

const ENGLISH_MONTHS = [
    'January', 'February', 'March',     'April',   'May',      'June',
    'July',    'August',   'September', 'October', 'November', 'December',
];

const ENGLISH_DAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/**
 * Build a gregorian date object matching the Aladhan API shape.
 * @param {Date} date
 * @returns {{ day: string, month: { number: number, en: string }, year: string }}
 */
function buildGregorianObj(date) {
    return {
        day:   String(date.getDate()).padStart(2, '0'),
        month: { number: date.getMonth() + 1, en: ENGLISH_MONTHS[date.getMonth()] },
        year:  String(date.getFullYear()),
    };
}

/**
 * Build a weekday object matching the Aladhan API shape.
 * @param {Date} date
 * @returns {{ en: string }}
 */
function buildWeekdayObj(date) {
    return { en: ENGLISH_DAYS[date.getDay()] };
}

/**
 * Calculate prayer times for a single day, entirely offline.
 *
 * Return shape is identical to transformTimings() in api.js:
 * { imsak, subuh, terbit, dzuhur, ashar, magrib, isya, date, hijri }
 *
 * Ihtiyat (+2 min) is applied to all prayers except Sunrise,
 * and Imsak is derived as Subuh − 10 min, matching the Kemenag RI standard.
 *
 * @param {number} lat  - Latitude
 * @param {number} lng  - Longitude
 * @param {Date}   date - Gregorian date (defaults to today)
 * @returns {{ imsak: string, subuh: string, terbit: string, dzuhur: string,
 *             ashar: string, magrib: string, isya: string,
 *             date: string, hijri: object }}
 */
export function calculateLocalDayTimes(lat, lng, date = new Date()) {
    const coordinates = new Coordinates(lat, lng);
    const params      = getCalculationParams(lat);
    const pt          = new PrayerTimes(coordinates, date, params);

    const rawFajr    = dateToHHmm(pt.fajr);
    const rawSunrise = dateToHHmm(pt.sunrise);
    const rawDhuhr   = dateToHHmm(pt.dhuhr);
    const rawAsr     = dateToHHmm(pt.asr);
    const rawMaghrib = dateToHHmm(pt.maghrib);
    const rawIsha    = dateToHHmm(pt.isha);

    const { ihtiyatMinutes } = getActiveMethodConfig();

    const subuh  = adjustTimeStr(rawFajr,    ihtiyatMinutes);
    const terbit = cleanTimeStr(rawSunrise);
    const dzuhur = adjustTimeStr(rawDhuhr,   ihtiyatMinutes);
    const ashar  = adjustTimeStr(rawAsr,     ihtiyatMinutes);
    const magrib = adjustTimeStr(rawMaghrib, ihtiyatMinutes);
    const isya   = adjustTimeStr(rawIsha,    ihtiyatMinutes);

    const imsak = adjustTimeStr(subuh, -10);

    return {
        imsak,
        subuh,
        terbit,
        dzuhur,
        ashar,
        magrib,
        isya,
        date:  formatDateDDMMYYYY(date),
        hijri: generateOfflineHijri(date),
        isOfflineFallback: true,
    };
}

/**
 * Calculate prayer times for an entire Gregorian month, entirely offline.
 *
 * Return shape is identical to transformMonthlyData() in api.js:
 * Array of { imsak, subuh, terbit, dzuhur, ashar, magrib, isya,
 *            date, weekday, gregorian, hijri }
 *
 * @param {number} lat   - Latitude
 * @param {number} lng   - Longitude
 * @param {number} year  - Gregorian year (e.g. 2026)
 * @param {number} month - 1-based month (e.g. 4 = April)
 * @returns {Array<object>}
 */
export function calculateLocalMonthlyTimes(lat, lng, year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const results = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date       = new Date(year, month - 1, day);
        const dayTimings = calculateLocalDayTimes(lat, lng, date);

        results.push({
            ...dayTimings,
            weekday:   buildWeekdayObj(date),
            gregorian: buildGregorianObj(date),
        });
    }

    return results;
}

/**
 * Calculate the Qibla direction (bearing from True North) entirely offline.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {number} Direction in degrees (0–360)
 */
export function calculateLocalQibla(lat, lng) {
    const coordinates = new Coordinates(lat, lng);
    return Qibla(coordinates);
}
