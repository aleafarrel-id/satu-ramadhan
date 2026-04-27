/**
 * Prayer Watcher Module
 */

import { getCurrentPrayer } from './prayer-times.js';
import { info } from '../notification/notification.js';
import { store } from '../../core/store.js';
import { getPrayerTimesByCoords } from '../../core/api.js';
import { t } from '../../core/i18n.js';

let _tickerInterval = null;
let _timings = null;
let _currentPrayerKey = null;
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
    if (_tickerInterval) {
        clearInterval(_tickerInterval);
        _tickerInterval = null;
    }
    _isRunning = false;
    _currentPrayerKey = null;
}

/**
 * Starts the watcher and monitoring intervals
 */
export function startWatcher() {
    if (_isRunning) return;
    _isRunning = true;

    if (!_tickerInterval) {
        _tickerInterval = setInterval(tick, 1000);
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
    
    // Initialize state to avoid erroneous toasts on first load
    const prayerState = getCurrentPrayer(_timings);
    if (prayerState && prayerState.current) {
        _currentPrayerKey = prayerState.current.key;
    }
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
 * Ticker evaluates chronological progress exactly once per second.
 * Completely replaces fragile setTimeout logic.
 */
function tick() {
    if (!_timings) return;
    
    const prayerState = getCurrentPrayer(_timings);
    if (!prayerState || !prayerState.current) return;
    
    if (_currentPrayerKey && _currentPrayerKey !== prayerState.current.key) {
        console.log(`[PrayerWatcher] Transition detected: ${_currentPrayerKey} -> ${prayerState.current.key}`);
        _currentPrayerKey = prayerState.current.key;
        
        const prayerTimeMs = prayerState.current.date.getTime();
        const driftMs = Date.now() - prayerTimeMs;
        
        // If transition is recent (within last 60 seconds), trigger the in-app toast
        if (driftMs >= 0 && driftMs < 60000) {
            const notifBody = t(`modules/prayer/prayer-times:notif_${prayerState.current.key}_body`);
            info(notifBody);
        }
        
        // Notify all subscribers (like theme.js) of the prayer transition immediately
        for (const listener of _listeners) {
            try { listener({ prayer: prayerState.current, timings: _timings }); } catch { /* noop */ }
        }
    } else if (!_currentPrayerKey) {
        // Fallback catch for uninitialized states
        _currentPrayerKey = prayerState.current.key;
    }
}

/**
 * Left intact as a public API alias for backwards compatibility
 * in case other modules invoke checkAndSync directly.
 */
export function checkAndSync() {
    tick();
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

            // Auto-start the ticker the first time we have valid timings.
            // This makes the watcher fully self-contained — no external
            // startWatcher() call is needed from app.js or any page.
            if (!_isRunning) {
                _isRunning = true;
                if (!_tickerInterval) {
                    _tickerInterval = setInterval(tick, 1000);
                }
            }
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
