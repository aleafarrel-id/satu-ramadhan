/**
 * Prayer Watcher Module
 */

import { getCurrentPrayer, getPrayerName } from './prayer-times.js';
import { info } from '../notification/notification.js';
import { store } from '../../core/store.js';
import { getPrayerTimesByCoords } from '../../core/api.js';
import { t } from '../../core/i18n.js';

let _timeout = null;
let _timings = null;
let _lastTriggeredDateMs = null;

/** @type {Set<Function>} */
const _listeners = new Set();

/**
 * Stop the current watcher timeout
 */
export function stopWatcher() {
    if (_timeout) {
        clearTimeout(_timeout);
        _timeout = null;
    }
}

/**
 * Update watcher with new timings and schedule the next notification
 * @param {object} timings - Prayer timings object
 */
export function updateWatcher(timings) {
    _timings = timings;
    scheduleNext();
}

/**
 * Register a callback to be invoked when a prayer transition occurs.
 * Callback receives { prayer, timings } where prayer is the newly active prayer.
 * @param {Function} callback
 */
export function onPrayerChange(callback) {
    _listeners.add(callback);
}

/**
 * Unregister a previously registered prayer change callback.
 * @param {Function} callback
 */
export function offPrayerChange(callback) {
    _listeners.delete(callback);
}

/**
 * Find the next prayer and schedule a timeout for it
 */
function scheduleNext() {
    stopWatcher();

    if (!_timings) return;

    const prayerState = getCurrentPrayer(_timings);
    const nextPrayer = prayerState.next;

    if (!nextPrayer || !nextPrayer.date) return;

    const nextTimeMs = nextPrayer.date.getTime();
    const nowMs = Date.now();

    // Calculate how long until the next prayer time
    const timeUntilNext = nextTimeMs - nowMs;

    // Safety check: if time is negative or somehow already processed
    if (timeUntilNext < 0 || _lastTriggeredDateMs === nextTimeMs) {
        // If we just passed it, wait a second and try to schedule the one after
        _timeout = setTimeout(() => {
            scheduleNext();
        }, 1000);
        return;
    }

    // Schedule the exact timeout
    _timeout = setTimeout(() => {
        triggerNotification(nextPrayer, nextTimeMs);
    }, timeUntilNext);
}

/**
 * Called when the timeout triggers — notifies in-app and all subscribers.
 */
function triggerNotification(prayer, triggerTimeMs) {
    _lastTriggeredDateMs = triggerTimeMs;

    const notifBody = t(`modules/prayer/prayer-times:notif_${prayer.key}_body`);
    info(notifBody);

    // Notify all subscribers of the prayer transition
    for (const listener of _listeners) {
        try { listener({ prayer, timings: _timings }); } catch { /* noop */ }
    }

    // Schedule the next one slightly after to ensure time has passed
    _timeout = setTimeout(() => {
        scheduleNext();
    }, 1000);
}

/**
 * Autonomous integration: Fetch timings and restart watcher
 * when relevant store parameters (location, org) change.
 */
async function _evaluateAndRestart() {
    const loc = store.getState('location');
    if (!loc?.latitude || !loc?.longitude) return;

    try {
        const timings = await getPrayerTimesByCoords(loc.latitude, loc.longitude);
        if (timings) {
            updateWatcher(timings);
        }
    } catch {
        // Silently fail if API/network is unavailable; the watcher will hold its last known state.
    }
}

// Subscribe to store reactive properties
store.subscribe('location', _evaluateAndRestart);
store.subscribe('settings.org', _evaluateAndRestart);

// Trigger initial evaluation immediately to catch early hydration hits
_evaluateAndRestart();
