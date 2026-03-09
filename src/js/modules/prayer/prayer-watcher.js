/**
 * Prayer Watcher Module
 * Handles scheduling of exactly-timed in-app notifications
 * for prayer times using setTimeout and recursive scheduling.
 * 
 * Also supports subscriber callbacks for instant prayer transition
 * events.
 */

import { getCurrentPrayer } from './prayer-times.js';
import { info } from '../notification/notification.js';

let _timeout = null;
let _timings = null;
let _lastTriggeredDateMs = null;

/** @type {Set<Function>} */
const _listeners = new Set();

/* ── Public API ── */

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

/* ── Internal ── */

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

    info(`Waktu ${prayer.name} telah tiba`);

    // Notify all subscribers of the prayer transition
    for (const listener of _listeners) {
        try { listener({ prayer, timings: _timings }); } catch { /* noop */ }
    }

    // Schedule the next one slightly after to ensure time has passed
    _timeout = setTimeout(() => {
        scheduleNext();
    }, 1000);
}

