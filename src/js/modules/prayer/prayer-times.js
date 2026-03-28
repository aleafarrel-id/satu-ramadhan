/**
 * Prayer Times Module
 */

import iconMoonSvg from '../../../assets/icon/moon.svg?raw';
import iconMoonStarsSvg from '../../../assets/icon/moon-stars.svg?raw';
import iconSunSvg from '../../../assets/icon/sun.svg?raw';
import iconSunRiseSvg from '../../../assets/icon/sun-rise.svg?raw';
import iconSunSetSvg from '../../../assets/icon/sun-set.svg?raw';
import iconSunFogSvg from '../../../assets/icon/sun-fog.svg?raw';
import iconCloudSunSvg from '../../../assets/icon/cloud-sun.svg?raw';

export const PRAYER_LIST = [
    { key: 'imsak', name: 'Imsak', icon: iconMoonStarsSvg },
    { key: 'subuh', name: 'Subuh', icon: iconSunFogSvg },
    { key: 'terbit', name: 'Terbit', icon: iconSunRiseSvg },
    { key: 'dzuhur', name: 'Dzuhur', icon: iconSunSvg },
    { key: 'ashar', name: 'Ashar', icon: iconCloudSunSvg },
    { key: 'magrib', name: 'Magrib', icon: iconSunSetSvg },
    { key: 'isya', name: "Isya'", icon: iconMoonSvg },
];

export function parseTimeToDate(timeStr) {
    if (!timeStr) return null;
    const clean = timeStr.replace(/\s*\(.*\)/, ''); // remove timezone note
    const [hours, minutes] = clean.split(':').map(Number);
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
}

/**
 * Determine the current and next prayer time
 * Returns { current, next, currentIndex, nextIndex }
 */
export function getCurrentPrayer(timings) {
    const now = new Date();
    const times = PRAYER_LIST.map(p => ({
        ...p,
        time: timings[p.key],
        date: parseTimeToDate(timings[p.key])
    })).filter(p => p.date !== null);

    // Find the last prayer whose time has passed
    let currentIndex = -1;
    for (let i = times.length - 1; i >= 0; i--) {
        if (now >= times[i].date) {
            currentIndex = i;
            break;
        }
    }

    // After midnight, before first prayer → still in Isya' period
    if (currentIndex === -1) {
        const lastPrayer = times[times.length - 1];
        const yesterdayDate = new Date(lastPrayer.date);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);

        return {
            current: { ...lastPrayer, date: yesterdayDate },
            next: times[0],
            currentIndex: times.length - 1,
            nextIndex: 0,
            times,
            isPostMidnight: true,
        };
    }

    const nextIndex = currentIndex + 1 < times.length ? currentIndex + 1 : 0;

    return {
        current: times[currentIndex],
        next: times[nextIndex],
        currentIndex,
        nextIndex,
        times,
        isPostMidnight: false,
    };
}

/**
 * Calculate fill percentage for a tube
 * @param {Date} startTime - when this prayer period started
 * @param {Date} endTime - when this prayer period ends (next prayer)
 * @param {Date} now - current time
 * @returns {number} 0-100
 */
export function getTubeFillPercent(startTime, endTime, now) {
    if (!startTime || !endTime) return 0;
    if (now < startTime) return 0;
    if (now >= endTime) return 100;

    const total = endTime - startTime;
    const elapsed = now - startTime;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
}
