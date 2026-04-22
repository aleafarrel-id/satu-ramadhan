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
let _driftCheckInterval = null;
let _currentPrayerKey = null;
let _lastTriggeredDateMs = null;
let _isRunning = false;

/** @type {Set<Function>} */
const _listeners = new Set();
/** @type {Set<Function>} */
const _updateListeners = new Set();

/**
 * Returns the latest timings loaded into the watcher
 */
export function getCurrentTimings() {
    return _timings;
}

/**
 * Register to listen to the core timings update (API cache resolved)
 */
export function onWatcherUpdate(callback) {
    _updateListeners.add(callback);
}

/**
 * Stop the current watcher timeout
 */
export function stopWatcher() {
    if (_timeout) {
        clearTimeout(_timeout);
        _timeout = null;
    }
    if (_driftCheckInterval) {
        clearInterval(_driftCheckInterval);
        _driftCheckInterval = null;
    }
    _isRunning = false;
}

/**
 * Starts the watcher and monitoring intervals
 */
export function startWatcher() {
    if (_isRunning) return;
    _isRunning = true;
    _evaluateAndRestart();
    
    // Periodically check for time drifts (e.g. system clock manually changed)
    // This guarantees UI sync even if setTimeout fails due to monotonic clock constraints
    if (!_driftCheckInterval) {
        _driftCheckInterval = setInterval(() => checkAndSync(), 5000);
    }
}

/**
 * Update watcher with new timings and schedule the next notification
 * @param {object} timings - Prayer timings object
 */
export function updateWatcher(timings) {
    _timings = timings;
    for (const cb of _updateListeners) {
        try { cb(_timings); } catch { /* noop */ }
    }
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
 * Checks if the time has drifted (e.g. system clock changed, or woke from deep sleep)
 * and manually triggers a sync if the prayer state has changed.
 */
export function checkAndSync() {
    if (!_timings) return;
    
    import('./prayer-times.js').then(({ getCurrentPrayer }) => {
        const prayerState = getCurrentPrayer(_timings);
        if (!prayerState || !prayerState.current) return;

        if (_currentPrayerKey && _currentPrayerKey !== prayerState.current.key) {
            console.log(`[PrayerWatcher] State drifted from ${_currentPrayerKey} to ${prayerState.current.key}. Syncing...`);
            _currentPrayerKey = prayerState.current.key;
            
            for (const listener of _listeners) {
                try { listener({ prayer: prayerState.current, timings: _timings }); } catch { /* noop */ }
            }
            
            scheduleNext();
        }
    });
}

/**
 * Find the next prayer and schedule a timeout for it
 */
function scheduleNext() {
    if (_timeout) {
        clearTimeout(_timeout);
        _timeout = null;
    }

    if (!_timings) return;

    const prayerState = getCurrentPrayer(_timings);
    
    // Detect missed states (e.g. from device sleep or clock drift)
    if (_currentPrayerKey && _currentPrayerKey !== prayerState.current.key) {
        for (const listener of _listeners) {
            try { listener({ prayer: prayerState.current, timings: _timings }); } catch { /* noop */ }
        }
    }
    _currentPrayerKey = prayerState.current.key;

    const nextPrayer = prayerState.next;

    if (!nextPrayer || !nextPrayer.date) return;

    const nextTimeMs = nextPrayer.date.getTime();
    const nowMs = Date.now();
    const timeUntilNext = nextTimeMs - nowMs;

    // Retry if time already passed
    if (timeUntilNext < 0 || _lastTriggeredDateMs === nextTimeMs) {
        _timeout = setTimeout(() => {
            scheduleNext();
        }, 1000);
        return;
    }

    _timeout = setTimeout(() => {
        triggerNotification(nextPrayer, nextTimeMs);
    }, timeUntilNext);
}

/**
 * Called when the timeout triggers — notifies in-app and all subscribers.
 */
function triggerNotification(prayer, triggerTimeMs) {
    _lastTriggeredDateMs = triggerTimeMs;

    const driftMs = Date.now() - triggerTimeMs;
    
    // Skip outdated toasts if device woke from long sleep
    if (driftMs < 60000) {
        const notifBody = t(`modules/prayer/prayer-times:notif_${prayer.key}_body`);
        info(notifBody);
    }

    _currentPrayerKey = prayer.key;

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
        // Fallback to last known state on failure
    }
}

// Subscribe to store reactive properties
store.subscribe('location', _evaluateAndRestart);
store.subscribe('settings.org', _evaluateAndRestart);

// Trigger initial evaluation immediately to catch early hydration hits
_evaluateAndRestart();
