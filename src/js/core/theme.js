/**
 * Theme Manager Core
 * Evaluates 'dark', 'teal', or 'auto' and applies it to the DOM safely.
 */
import { store } from './store.js';
import { StatusBar, Style } from '@capacitor/status-bar';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { isNative } from '../modules/system/platform.js';

let _watcherSubscribed = false;
let _initialThemeSet = false;

/**
 * Initializes the theme based on user state.
 * Must be called early in app startup to prevent FOUC.
 */
export function initTheme() {
    const savedTheme = store.getState('settings.theme') ?? 'auto';
    applyThemeBackground(savedTheme);

    // Subscribe to store changes so other components don't have to worry about DOM mutation
    store.subscribe('settings.theme', (newTheme) => {
        // Applies immediately to DOM. The View Transition API from the modal
        // will freeze the frame and execute this smoothly.
        applyThemeBackground(newTheme);
    });
}

/**
 * Executes the logic to figure out if dark mode should be enabled,
 * and sets the HTML dataset.
 */
export function applyThemeBackground(themeMode) {
    let finalDark = false;

    if (themeMode === 'auto') {
        const prayerWatcher = _getCachedPrayerWatcher();

        if (prayerWatcher) {
            const timings = prayerWatcher.getCurrentTimings ? prayerWatcher.getCurrentTimings() : null;
            if (timings) {
                const isDark = _calculateIsDarkSync(timings);
                _applyDOMMode(isDark);
                _setupWatcher(prayerWatcher);
                return;
            }
        }



        import('../modules/prayer/prayer-watcher.js').then((pw) => {
            const timings = pw.getCurrentTimings ? pw.getCurrentTimings() : null;
            if (timings && store.getState('settings.theme') === 'auto') {
                _evaluateDynamicTheme(timings);
            }
            _setupWatcher(pw);
        });
        return;
    } else if (themeMode === 'dark') {
        finalDark = true;
    }

    _applyDOMMode(finalDark);
}

/**
 * Internal helper to setup listeners once
 */
function _setupWatcher(pw) {
    if (_watcherSubscribed) return;
    _watcherSubscribed = true;

    if (pw.onWatcherUpdate) {
        pw.onWatcherUpdate((newTimings) => {
            if (store.getState('settings.theme') === 'auto') {
                _evaluateDynamicTheme(newTimings, true);
            }
        });
    }

    if (pw.onPrayerChange) {
        pw.onPrayerChange(({ prayer, timings: t }) => {
            if (store.getState('settings.theme') === 'auto') {
                _evaluateDynamicTheme(t, true, prayer);
            }
        });
    }
}

/**
 * Tries to get the already loaded module if available
 */
function _getCachedPrayerWatcher() {
    try {
        return null;
    } catch {
        return null;
    }
}

function _calculateIsDarkSync(timings) {
    if (!timings || !timings.magrib || !timings.terbit) return false;

    try {
        const now = new Date();
        const parseTime = (timeStr) => {
            const [hours, minutes] = timeStr.replace(/\s*\(.*\)/, '').split(':').map(Number);
            const d = new Date();
            d.setHours(hours, minutes, 0, 0);
            return d;
        };

        const magrib = parseTime(timings.magrib);
        const terbit = parseTime(timings.terbit);

        // Dark mode is active if time is after magrib OR before terbit
        if (now >= magrib || now < terbit) {
            return true;
        }
    } catch {
        // Fallback to false on error
    }

    return false;
}

/**
 * Checks if the given prayer corresponds to a dark theme.
 * @param {string} prayerKey
 * @returns {boolean}
 */
export function isDarkPrayer(prayerKey) {
    const darkPrayers = ['magrib', 'isya', 'imsak', 'subuh'];
    return darkPrayers.includes(prayerKey);
}

/**
 * Asynchronously evaluates the exact prayer period.
 */
function _evaluateDynamicTheme(timings, shouldAnimate = false, explicitPrayer = null) {
    import('../modules/prayer/prayer-times.js').then(({ getCurrentPrayer }) => {
        if (!timings) return;

        // Cache today's boundary timings for instantaneous synchronous boot evaluation
        if (timings.magrib && timings.terbit) {
            try {
                localStorage.setItem('satu_ramadhan_timings_cache', JSON.stringify({
                    date: new Date().toDateString(),
                    magrib: timings.magrib,
                    terbit: timings.terbit
                }));
            } catch { }
        }

        let currentPrayerKey = null;

        if (explicitPrayer && explicitPrayer.key) {
            currentPrayerKey = explicitPrayer.key;
        } else {
            const state = getCurrentPrayer(timings);
            if (!state || !state.current) return;
            currentPrayerKey = state.current.key;
        }

        const isDark = isDarkPrayer(currentPrayerKey);

        const currentIsDark = document.documentElement.dataset.theme === 'dark';

        // Only trigger DOM update if the state has actually changed.
        if (!_initialThemeSet || currentIsDark !== isDark) {
            _applyDOMMode(isDark, shouldAnimate);
        }
    });
}

/**
 * Applies the finalized background to the DOM and PWA Status Bar
 */
function _applyDOMMode(finalDark, shouldAnimate = false) {
    if (shouldAnimate && _initialThemeSet) {
        const vw = document.documentElement.clientWidth;
        import('../utils/theme-transition.js').then(({ executeThemeTransition }) => {
            executeThemeTransition({
                x: vw / 2,
                y: 0,
                updateDOMCallback: () => applyToDOM(finalDark)
            });
        }).catch((err) => {
            console.warn('[Theme] Failed to load transition module', err);
            applyToDOM(finalDark);
        });
        return;
    }

    applyToDOM(finalDark);
    _initialThemeSet = true;
}

export function applyToDOM(finalDark) {
    if (finalDark) {
        document.documentElement.dataset.theme = 'dark';
    } else {
        delete document.documentElement.dataset.theme;
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', finalDark ? '#031013' : '#1A2B3A');
    }

    if (isNative) {
        try {
            StatusBar.setStyle({ style: Style.Dark });
            StatusBar.setBackgroundColor({ color: finalDark ? '#031013' : '#0a3540' });
            
            NavigationBar.setNavigationBarColor({
                color: finalDark ? '#031013' : '#0a3540',
                darkButtons: false
            });
        } catch (err) {
            console.warn('[Theme] Failed to set native StatusBar or NavigationBar', err);
        }
    }
}
