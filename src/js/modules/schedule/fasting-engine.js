/**
 * Offline Fasting Engine
 * Calculates fasting days natively without any API calls.
 */
import { generateOfflineHijri } from '../../core/local-calculator.js';
import { store } from '../../core/store.js';

export const FASTING_TYPES = {
    SUNNAH: 'sunnah',
    MANDATORY: 'mandatory',
    FORBIDDEN: 'forbidden'
};

/**
 * Caches calculated fasting days for a specific year to prevent recalculation.
 * Key: Gregorian Year string (e.g. "2026")
 * Value: Map of DateString (YYYY-MM-DD) -> Array of Fasting IDs
 */
const _yearlyCache = new Map();

/**
 * Determine all fasting events for a specific hijri date object.
 * @param {Object} hijri - From generateOfflineHijri { day, month: { number } }
 * @param {Date} gregorianDate - The corresponding gregorian date
 * @returns {Array<string>} Array of fasting IDs
 */
export function analyzeFastingDayOffline(hijri, gregorianDate) {
    const day = parseInt(hijri.day, 10);
    const month = parseInt(hijri.month.number, 10);
    const dayOfWeek = gregorianDate.getDay(); // 0 = Sunday, 1 = Monday, 4 = Thursday

    const events = [];

    // 1. FORBIDDEN DAYS (Haram)
    // 1 Syawal (Idul Fitri)
    if (month === 10 && day === 1) events.push('haram');
    // 10 Dzulhijjah (Idul Adha) & Hari Tasyrik (11, 12, 13 Dzulhijjah)
    if (month === 12 && (day >= 10 && day <= 13)) events.push('haram');

    if (events.length > 0) return events; // Stop analyzing if forbidden

    // 2. MANDATORY DAYS (Wajib)
    // Bulan Ramadhan penuh
    if (month === 9) {
        events.push('wajib_ramadhan');
        return events; // Nothing else applies in Ramadhan
    }

    // 3. SUNNAH DAYS
    // Puasa Syawal (6 hari di bulan Syawal)
    // Traditionally day 2 to 7, but any 6 days are valid. For calendar marking, 
    // we mark 2-7 as the "standard" recommendation to make it predictable.
    if (month === 10 && (day >= 2 && day <= 7)) events.push('sunnah_syawal');

    // Puasa Arafah (9 Dzulhijjah)
    if (month === 12 && day === 9) events.push('sunnah_arafah');

    // Puasa Tarwiyah (8 Dzulhijjah)
    if (month === 12 && day === 8) events.push('sunnah_tarwiyah');

    // Puasa Tasu'a (9 Muharram)
    if (month === 1 && day === 9) events.push('sunnah_tasua');

    // Puasa Asyura (10 Muharram)
    if (month === 1 && day === 10) events.push('sunnah_asyura');

    // Ayyamul Bidh (13, 14, 15 tiap bulan Hijriah)
    if (day === 13 || day === 14 || day === 15) {
        events.push('sunnah_ayyamul_bidh');
    }

    // Puasa Senin Kamis
    if (dayOfWeek === 1) events.push('sunnah_senin');
    if (dayOfWeek === 4) events.push('sunnah_kamis');

    return events;
}

/**
 * Returns a map of all fasting events for a given Gregorian year.
 * Applies the global hijri offset from the store.
 * @param {number} gregorianYear 
 * @returns {Map<string, Array<string>>}
 */
export function getFastingCalendarForYear(gregorianYear) {
    const offset = store.getState('settings.hijriOffset') || 0;
    const cacheKey = `${gregorianYear}_o${offset}`;

    if (_yearlyCache.has(cacheKey)) {
        return _yearlyCache.get(cacheKey);
    }

    const yearMap = new Map();
    const startDate = new Date(gregorianYear, 0, 1); // Jan 1
    const endDate = new Date(gregorianYear, 11, 31); // Dec 31

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        let hijri = generateOfflineHijri(d);
        let activeOffset = offset;
        
        // Only apply offset for Ramadhan (month 9) and Shawwal (month 10)
        // This prevents Ramadhan 30 from erroneously evaluating as 1 Shawwal (Forbidden)
        const monthNum = parseInt(hijri.month.number, 10);
        if (monthNum !== 9 && monthNum !== 10) {
            activeOffset = 0;
        }

        // Create an offset-adjusted date specifically for Hijri conversion
        const offsetDate = new Date(d);
        if (activeOffset !== 0) {
            offsetDate.setDate(offsetDate.getDate() + activeOffset);
            hijri = generateOfflineHijri(offsetDate);
        }
        const fastingEvents = analyzeFastingDayOffline(hijri, d);

        if (fastingEvents.length > 0) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            yearMap.set(dateStr, fastingEvents);
        }
    }

    _yearlyCache.set(cacheKey, yearMap);
    return yearMap;
}

/**
 * Builds an offline grid of dates for a given Hijri month offset from a base date.
 * @param {number} monthOffset - 0 for current month, -1 for prev, +1 for next, etc.
 * @param {Date} baseDate - The Gregorian date to base the relative offset on (e.g., today).
 * @param {string[]} [hijriMonths] - Translated Hijri month names (12 items). Falls back to English.
 * @returns {Array<Object>} Array of day entries { date: Date, hijriDay: number, hijriMonthName: string, hijriYear: number }
 */
export function buildOfflineHijriMonth(monthOffset, baseDate = new Date(), hijriMonths) {
    let offset = store.getState('settings.hijriOffset') || 0;
    
    // Find the starting point's Hijri month and year
    let currentDate = new Date(baseDate);
    currentDate.setHours(0, 0, 0, 0);

    let startHijri = generateOfflineHijri(currentDate);
    let targetMonth = parseInt(startHijri.month.number, 10) + monthOffset;
    let targetYear = parseInt(startHijri.year, 10);

    // Normalize year/month overflow BEFORE checking offset conditions
    // This prevents issues where targetMonth=13 or targetMonth=0 would fail the offset check
    while (targetMonth > 12) {
        targetMonth -= 12;
        targetYear += 1;
    }
    while (targetMonth < 1) {
        targetMonth += 12;
        targetYear -= 1;
    }

    // Only apply offset if the target month is Ramadhan (9) or Shawwal (10)
    // This preserves continuity between the end of Ramadhan and Eid al-Fitr
    if (targetMonth !== 9 && targetMonth !== 10) {
        offset = 0;
    }

    // Apply offset for calculation
    const calcDate = new Date(currentDate);
    if (offset !== 0) calcDate.setDate(calcDate.getDate() + offset);

    // Recalculate startHijri with the offset to ensure correct scanning
    startHijri = generateOfflineHijri(calcDate);

    // Rough jump to the target month (approx 29.5 days per month)
    const daysToJump = monthOffset * 29;
    currentDate.setDate(currentDate.getDate() + daysToJump);

    // Scan to find exactly day 1 of the target month
    let scanCount = 0;
    while (scanCount < 60) {
        const d = new Date(currentDate);
        if (offset !== 0) d.setDate(d.getDate() + offset);
        
        const h = generateOfflineHijri(d);
        const hm = parseInt(h.month.number, 10);
        const hy = parseInt(h.year, 10);
        const hd = parseInt(h.day, 10);

        if (hy === targetYear && hm === targetMonth && hd === 1) {
            break; // Found day 1
        }

        // Adjust scan direction
        if (hy > targetYear || (hy === targetYear && hm > targetMonth) || (hy === targetYear && hm === targetMonth && hd > 1)) {
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            currentDate.setDate(currentDate.getDate() + 1);
        }
        scanCount++;
    }

    // Now gather all days of this Hijri month
    const monthDays = [];
    let d = new Date(currentDate);
    
    // i18n: use provided array, or fall back to English defaults
    const resolvedHijriMonths = (hijriMonths && hijriMonths.length === 12)
        ? hijriMonths
        : ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab', 'Syaban', 'Ramadhan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah'];

    while (monthDays.length < 30) {
        const dOffset = new Date(d);
        if (offset !== 0) dOffset.setDate(dOffset.getDate() + offset);
        
        const h = generateOfflineHijri(dOffset);
        if (parseInt(h.month.number, 10) !== targetMonth) break; // Reached next month

        monthDays.push({
            date: new Date(d),
            hijriDay: parseInt(h.day, 10),
            hijriMonthName: resolvedHijriMonths[targetMonth - 1],
            hijriYear: parseInt(h.year, 10)
        });

        d.setDate(d.getDate() + 1);
    }

    return monthDays;
}

/**
 * Clear the cache (called when offset changes significantly)
 */
export function clearFastingCache() {
    _yearlyCache.clear();
}
