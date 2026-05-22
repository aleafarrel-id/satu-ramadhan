/**
 * Aladhan API Service
 */

import { logError } from '../utils/error-boundary.js';

// Core & Libraries
import * as storage from './storage.js';

// Utilities & Helpers
import { adjustTimeStr, cleanTimeStr } from '../utils/datetime.js';

// Local offline fallback (no network required)
import { calculateLocalDayTimes, calculateLocalMonthlyTimes, calculateLocalQibla } from './local-calculator.js';
import { store } from './store.js';
import { getActiveMethodConfig } from './calculation-resolver.js';

// UI Feedback
import { warning } from '../modules/notification/notification.js';
import { t, loadNS } from './i18n.js';

const API_MIRRORS = [
    'https://api.aladhan.com/v1',
    'https://aladhan.api.islamic.network/v1',
    'https://aladhan.api.alislam.ru/v1',
];

const CACHE_PREFIX = 'prayer_cache_';
const MONTHLY_CACHE_PREFIX = 'monthly_cache_';
const REQUEST_TIMEOUT_MS = 4000;
const MAX_RETRY_CYCLES = 1;
const MIRROR_STORAGE_KEY = 'last_working_mirror';
const REQUIRED_KEYS = ['Imsak', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// Track last-used cache keys for precise eviction (not nuclear prefix wipes)
let _lastDailyCacheKey = null;
let _lastMonthlyCacheKey = null;
let _lastQiblaCacheKey = null;

let _lastOfflineToastTime = 0;
const OFFLINE_TOAST_THROTTLE_MS = 10000;

/**
 * Trigger an offline notification safely.
 * Throttles repetitive toast messages that occur during batch API failures.
 * @param {boolean} force - Bypass throttling
 */
function _notifyOffline(force = false) {
    const now = Date.now();
    if (force || now - _lastOfflineToastTime > OFFLINE_TOAST_THROTTLE_MS) {
        warning(t('common:offline_mode_toast'), 5000);
        _lastOfflineToastTime = now;
    }
}

/**
 * Centralized handler for calculating fallback offline data.
 * @param {Function} calculatorFn 
 * @param {string} cacheKey 
 * @param {boolean} showToast 
 * @param {string} logPrefix 
 * @returns {Promise<any>}
 */
async function _resolveLocalFallback(calculatorFn, cacheKey, showToast = true, logPrefix = '[API]') {
    console.warn(`${logPrefix} Fast-failing to local calculation (offline mode).`);
    if (showToast) _notifyOffline();

    // Force global network state to offline to trigger fallbacks in other modules (like Map)
    store.setState('network.isOffline', true);

    try {
        const result = calculatorFn();
        if (result !== null && result !== undefined) {
            await storage.set(cacheKey, result);
        }
        return result;
    } catch (err) {
        logError(logPrefix, err);
        return null;
    }
}

/**
 * Get the mirror order, starting from the last known working mirror
 * @returns {Promise<string[]>} ordered list of base URLs
 */
async function getOrderedMirrors() {
    const lastWorking = await storage.get(MIRROR_STORAGE_KEY);
    if (!lastWorking) return [...API_MIRRORS];

    const idx = API_MIRRORS.indexOf(lastWorking);
    if (idx <= 0) return [...API_MIRRORS];

    // Put last-working first, then the rest in original order
    return [
        API_MIRRORS[idx],
        ...API_MIRRORS.slice(0, idx),
        ...API_MIRRORS.slice(idx + 1),
    ];
}

/**
 * Fetch with timeout using AbortController
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Validate that the API response has all required timing fields
 * @param {object} data - parsed JSON response
 * @returns {boolean}
 */
function isValidResponse(data) {
    if (data?.code !== 200 || !data?.data?.timings) return false;

    const timings = data.data.timings;
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)/;
    return REQUIRED_KEYS.every(key =>
        typeof timings[key] === 'string' && timings[key].length > 0 && timeRegex.test(timings[key])
    );
}

/**
 * Try fetching from a single mirror
 * @param {string} baseUrl
 * @param {string} dateStr
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>} parsed JSON data
 * @throws on any failure
 */
async function tryMirror(baseUrl, dateStr, latitude, longitude) {
    const { id: methodId } = getActiveMethodConfig();
    const url = `${baseUrl}/timings/${dateStr}?latitude=${latitude}&longitude=${longitude}&method=${methodId}`;

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${baseUrl}`);
    }

    const data = await response.json();

    if (!isValidResponse(data)) {
        throw new Error(`Invalid response shape from ${baseUrl}`);
    }

    return data;
}

/**
 * Try all mirrors in order, return the first successful result
 * @param {string} dateStr
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{data: object, mirror: string}>}
 * @throws if all mirrors fail
 */
async function tryAllMirrors(dateStr, latitude, longitude) {
    const mirrors = await getOrderedMirrors();
    const errors = [];

    for (const mirror of mirrors) {
        try {
            const data = await tryMirror(mirror, dateStr, latitude, longitude);
            return { data, mirror };
        } catch (err) {
            errors.push({ mirror, error: err.message });
            console.warn(`[API] Mirror failed: ${mirror} — ${err.message}`);
        }
    }

    throw new AggregateError(
        errors.map(e => new Error(e.error)),
        `All ${mirrors.length} API mirrors failed`
    );
}

/**
 * Sleep helper for retry backoff
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Transform raw API timings to app format.
 * Applies Ihtiyat precaution (+2 min) per Kemenag RI standard.
 *
 * @param {object} apiData - validated API response
 * @param {string} dateStr
 * @returns {object}
 */
function transformTimings(apiData, dateStr) {
    const timings = apiData.data.timings;
    const { ihtiyatMinutes } = getActiveMethodConfig();

    // Ihtiyat precaution per active method
    const subuh = adjustTimeStr(timings.Fajr, ihtiyatMinutes);
    const terbit = cleanTimeStr(timings.Sunrise);  // Pure astronomical, no Ihtiyat
    const dzuhur = adjustTimeStr(timings.Dhuhr, ihtiyatMinutes);
    const ashar = adjustTimeStr(timings.Asr, ihtiyatMinutes);
    const magrib = adjustTimeStr(timings.Maghrib, ihtiyatMinutes);
    const isya = adjustTimeStr(timings.Isha, ihtiyatMinutes);

    // Imsak = adjusted Fajr − 10 minutes
    const imsak = adjustTimeStr(subuh, -10);

    return {
        imsak,
        subuh,
        terbit,
        dzuhur,
        ashar,
        magrib,
        isya,
        date: dateStr,
        hijri: apiData.data.date.hijri,
    };
}

const _activeFetches = new Map();

/**
 * Helper to deduplicate concurrent requests for the same cache key.
 * If multiple callers request the same data simultaneously, they will
 * wait for the same promise rather than spawning duplicate network flights.
 */
async function withDeduplication(key, fetcher) {
    if (_activeFetches.has(key)) {
        return _activeFetches.get(key);
    }
    const promise = fetcher();
    _activeFetches.set(key, promise);
    try {
        return await promise;
    } finally {
        _activeFetches.delete(key);
    }
}

/**
 * Fetch prayer times by coordinates and date
 * Tries multiple API mirrors with retry & exponential backoff
 */
export async function getPrayerTimesByCoords(latitude, longitude, date = new Date()) {
    const { id: methodId } = getActiveMethodConfig();
    const dateStr = formatDate(date);
    const cacheKey = `${CACHE_PREFIX}${methodId}_${latitude.toFixed(2)}_${longitude.toFixed(2)}_${dateStr}`;

    return withDeduplication(cacheKey, async () => {
        // Check cache first
        const cached = await storage.get(cacheKey);
        if (cached) return cached;

        await loadNS('common');

        // FAST-FAIL: Intercept physical offline state immediately
        if (!navigator.onLine) {
            return _resolveLocalFallback(() => calculateLocalDayTimes(latitude, longitude, date), cacheKey);
        }

        // Retry loop with exponential backoff
        for (let attempt = 0; attempt <= MAX_RETRY_CYCLES; attempt++) {
            if (attempt > 0) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                await sleep(delay);
            }

            try {
                const { data, mirror } = await tryAllMirrors(dateStr, latitude, longitude);

                // Remember the working mirror for next time
                await storage.set(MIRROR_STORAGE_KEY, mirror);
                console.log(`[API] Success via ${mirror}`);

                const result = transformTimings(data, dateStr);

                // Evict only the previous daily cache entry (not all daily caches)
                if (_lastDailyCacheKey && _lastDailyCacheKey !== cacheKey) {
                    await storage.remove(_lastDailyCacheKey);
                }
                _lastDailyCacheKey = cacheKey;
                await storage.set(cacheKey, result);
                return result;
            } catch (err) {
                console.warn(`[API] Cycle ${attempt + 1} failed:`, err.message);
            }
        }

        // All retries exhausted — try local astronomical calculation before stale cache
        const fallbackResult = await _resolveLocalFallback(() => calculateLocalDayTimes(latitude, longitude, date), cacheKey, true, '[API]');
        if (fallbackResult) return fallbackResult;

        // Last resort — stale cache
        const fallback = await storage.get(cacheKey);
        if (fallback) {
            console.warn('[API] Returning stale cached data');
            return fallback;
        }

        logError('[API]', 'All mirrors, local calc, and cache exhausted');
        return null;
    });
}

/**
 * Format date as DD-MM-YYYY for Aladhan API
 */
function formatDate(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}


/**
 * Validate monthly calendar API response
 * @param {object} data - parsed JSON response
 * @returns {boolean}
 */
function isValidMonthlyResponse(data) {
    if (data?.code !== 200 || !Array.isArray(data?.data)) return false;
    if (data.data.length === 0) return false;

    // Spot-check the first entry
    const first = data.data[0];
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)/;
    return first?.timings && REQUIRED_KEYS.every(key =>
        typeof first.timings[key] === 'string' && first.timings[key].length > 0 && timeRegex.test(first.timings[key])
    );
}

/**
 * Try fetching monthly calendar from a single mirror
 * @param {string} baseUrl
 * @param {number} year
 * @param {number} month - 1-based
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>} parsed JSON data
 */
async function tryMirrorMonthly(baseUrl, year, month, latitude, longitude) {
    const { id: methodId } = getActiveMethodConfig();
    const url = `${baseUrl}/calendar/${year}/${month}?latitude=${latitude}&longitude=${longitude}&method=${methodId}`;

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${baseUrl}`);
    }

    const data = await response.json();

    if (!isValidMonthlyResponse(data)) {
        throw new Error(`Invalid monthly response from ${baseUrl}`);
    }

    return data;
}

/**
 * Try all mirrors for monthly calendar
 * @param {number} year
 * @param {number} month
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{data: object, mirror: string}>}
 */
async function tryAllMirrorsMonthly(year, month, latitude, longitude) {
    const mirrors = await getOrderedMirrors();
    const errors = [];

    for (const mirror of mirrors) {
        try {
            const data = await tryMirrorMonthly(mirror, year, month, latitude, longitude);
            return { data, mirror };
        } catch (err) {
            errors.push({ mirror, error: err.message });
            console.warn(`[API] Monthly mirror failed: ${mirror} — ${err.message}`);
        }
    }

    throw new AggregateError(
        errors.map(e => new Error(e.error)),
        `All ${mirrors.length} mirrors failed for monthly calendar`
    );
}

/**
 * Transform raw monthly API data to simplified app format.
 * Applies Ihtiyat precaution (+2 min) per Kemenag RI standard.
 *
 * @param {Array} apiDays - array of day objects from API
 * @returns {Array<object>}
 */
function transformMonthlyData(apiDays) {
    const { ihtiyatMinutes } = getActiveMethodConfig();

    return apiDays.map(day => {
        const t = day.timings;

        // Ihtiyat precaution per active method
        const subuh = adjustTimeStr(t.Fajr, ihtiyatMinutes);
        const terbit = cleanTimeStr(t.Sunrise);
        const dzuhur = adjustTimeStr(t.Dhuhr, ihtiyatMinutes);
        const ashar = adjustTimeStr(t.Asr, ihtiyatMinutes);
        const magrib = adjustTimeStr(t.Maghrib, ihtiyatMinutes);
        const isya = adjustTimeStr(t.Isha, ihtiyatMinutes);
        const imsak = adjustTimeStr(subuh, -10);

        return {
            imsak,
            subuh,
            terbit,
            dzuhur,
            ashar,
            magrib,
            isya,
            date: day.date.gregorian.date,       // "DD-MM-YYYY"
            weekday: day.date.gregorian.weekday,  // { en: "Monday" }
            gregorian: day.date.gregorian,
            hijri: day.date.hijri,
        };
    });
}

/**
 * Fetch a full Gregorian month of prayer times
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} year - Gregorian year (e.g. 2026)
 * @param {number} month - 1-based month (e.g. 2 = February)
 * @returns {Promise<Array|null>} array of day objects, or null on failure
 */
export async function getMonthlyPrayerTimes(latitude, longitude, year, month) {
    const { id: methodId } = getActiveMethodConfig();
    const cacheKey = `${MONTHLY_CACHE_PREFIX}${methodId}_${latitude.toFixed(2)}_${longitude.toFixed(2)}_${year}_${month}`;

    return withDeduplication(cacheKey, async () => {
        // Check cache first
        const cached = await storage.get(cacheKey);
        if (cached) return cached;

        await loadNS('common');

        // FAST-FAIL: Intercept physical offline state immediately
        if (!navigator.onLine) {
            return _resolveLocalFallback(() => calculateLocalMonthlyTimes(latitude, longitude, year, month), cacheKey, true, '[API] Monthly:');
        }

        // Retry loop with exponential backoff
        for (let attempt = 0; attempt <= MAX_RETRY_CYCLES; attempt++) {
            if (attempt > 0) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                await sleep(delay);
            }

            try {
                const { data, mirror } = await tryAllMirrorsMonthly(year, month, latitude, longitude);
                await storage.set(MIRROR_STORAGE_KEY, mirror);
                console.log(`[API] Monthly: Success via ${mirror}`);

                const result = transformMonthlyData(data.data);

                // Evict only the previous monthly cache entry (not all monthly caches)
                if (_lastMonthlyCacheKey && _lastMonthlyCacheKey !== cacheKey) {
                    await storage.remove(_lastMonthlyCacheKey);
                }
                _lastMonthlyCacheKey = cacheKey;
                await storage.set(cacheKey, result);
                return result;
            } catch (err) {
                console.warn(`[API] Monthly: Cycle ${attempt + 1} failed:`, err.message);
            }
        }

        // All retries exhausted — try local astronomical calculation before stale cache
        const fallbackResult = await _resolveLocalFallback(() => calculateLocalMonthlyTimes(latitude, longitude, year, month), cacheKey, true, '[API] Monthly:');
        if (fallbackResult) return fallbackResult;

        // Last resort — stale cache
        const fallback = await storage.get(cacheKey);
        if (fallback) {
            console.warn('[API] Returning stale monthly cache');
            return fallback;
        }

        logError('[API]', 'Monthly: all mirrors, local calc, and cache exhausted');
        return null;
    });
}

const QIBLA_CACHE_PREFIX = 'qibla_cache_';

/**
 * Validate qibla API response
 * @param {object} data - parsed JSON
 * @returns {boolean}
 */
function isValidQiblaResponse(data) {
    return data?.code === 200 && typeof data?.data?.direction === 'number';
}

/**
 * Try fetching qibla direction from a single mirror
 * @param {string} baseUrl
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>} parsed JSON data
 */
async function tryMirrorQibla(baseUrl, latitude, longitude) {
    const url = `${baseUrl}/qibla/${latitude}/${longitude}`;

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${baseUrl}`);
    }

    const data = await response.json();

    if (!isValidQiblaResponse(data)) {
        throw new Error(`Invalid qibla response from ${baseUrl}`);
    }

    return data;
}

/**
 * Try all mirrors for qibla direction
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{data: object, mirror: string}>}
 */
async function tryAllMirrorsQibla(latitude, longitude) {
    const mirrors = await getOrderedMirrors();
    const errors = [];

    for (const mirror of mirrors) {
        try {
            const data = await tryMirrorQibla(mirror, latitude, longitude);
            return { data, mirror };
        } catch (err) {
            errors.push({ mirror, error: err.message });
            console.warn(`[API] Qibla mirror failed: ${mirror} — ${err.message}`);
        }
    }

    throw new AggregateError(
        errors.map(e => new Error(e.error)),
        `All ${mirrors.length} mirrors failed for qibla direction`
    );
}

/**
 * Fetch qibla direction (bearing from True North) for given coordinates
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<number|null>} direction in degrees (0-360), or null on failure
 */
export async function getQiblaDirection(latitude, longitude) {
    const cacheKey = `${QIBLA_CACHE_PREFIX}${latitude.toFixed(2)}_${longitude.toFixed(2)}`;

    return withDeduplication(cacheKey, async () => {
        // Qibla direction is static per location — cache aggressively
        const cached = await storage.get(cacheKey);
        if (cached) return cached;

        await loadNS('common');

        // FAST-FAIL: Intercept physical offline state immediately
        if (!navigator.onLine) {
            // Qibla doesn't need to spam Toast, so we just return silently
            return _resolveLocalFallback(() => calculateLocalQibla(latitude, longitude), cacheKey, false, '[API] Qibla:');
        }

        for (let attempt = 0; attempt <= MAX_RETRY_CYCLES; attempt++) {
            if (attempt > 0) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                await sleep(delay);
            }

            try {
                const { data, mirror } = await tryAllMirrorsQibla(latitude, longitude);
                await storage.set(MIRROR_STORAGE_KEY, mirror);

                const direction = data.data.direction;
                console.log(`[API] Qibla direction: ${direction}° via ${mirror}`);

                // Evict only the previous qibla cache entry (one per location)
                if (_lastQiblaCacheKey && _lastQiblaCacheKey !== cacheKey) {
                    await storage.remove(_lastQiblaCacheKey);
                }
                _lastQiblaCacheKey = cacheKey;
                await storage.set(cacheKey, direction);
                return direction;
            } catch (err) {
                console.warn(`[API] Qibla cycle ${attempt + 1} failed:`, err.message);
            }
        }

        // All retries exhausted — use local spherical calculation
        const fallbackResult = await _resolveLocalFallback(() => calculateLocalQibla(latitude, longitude), cacheKey, false, '[API] Qibla:');
        if (fallbackResult) return fallbackResult;

        logError('[API]', 'Qibla: all mirrors, local calc, and cache exhausted');
        return null;
    });
}
