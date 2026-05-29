/**
 * Theme Manager Core
 * Evaluates 'dark', 'teal', or 'auto' and applies it to the DOM safely.
 *
 * NOTE — Native bar plugins:
 * StatusBar and NavigationBar are local Capacitor plugins defined in
 * android/app/src/main/java/com/saturamadhan/mobile/.
 * They use only WindowInsetsControllerCompat (zero deprecated APIs).
 * See NavigationBarPlugin.java and LocalStatusBarPlugin.java for details.
 */
import { store } from './store.js';
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../modules/system/platform.js';

// Local Capacitor plugins — registered by MainActivity.java.
// Plugin names match the originals so behavior is transparent to callers.
const StatusBar = registerPlugin('StatusBar');
const NavigationBar = registerPlugin('NavigationBar');

let _watcherSubscribed = false;
let _initialThemeSet = false;

let _statusBarOverrides = new Set();

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
 * Called by pages with a white/light background (e.g. Quran, Tasbih, Mushaf)
 * to switch the status bar icons to dark/black while they are open.
 *
 * Only has a visual effect when the active theme is light (teal). Dark and
 * auto-dark themes already use white icons which remain correct regardless.
 *
 * @example
 * // On page open:
 * import { setStatusBarOverride } from '../../core/theme.js';
 * setStatusBarOverride(true);
 *
 * // On page close/destroy:
 * clearStatusBarOverride();
 */
export function setStatusBarOverride(requesterId = 'default') {
    _statusBarOverrides.add(requesterId);
    _applyStatusBarStyle();
}

/**
 * Removes the page-level status bar override and reverts to the theme default.
 * Must be called in every destroy() / close() that called setStatusBarOverride().
 */
export function clearStatusBarOverride(requesterId = 'default') {
    _statusBarOverrides.delete(requesterId);
    _applyStatusBarStyle();
}

/**
 * Applies the correct status bar icon style based on the current theme
 * and any active page-level override. Separate from background color —
 * the background remains transparent; only icon appearance changes.
 * @private
 */
function _applyStatusBarStyle() {
    if (!isNative) return;

    const currentIsDark = document.documentElement.dataset.theme === 'dark';

    // Determine whether icons should be light (white) or dark (black).
    // Rule: DARK icons only when theme is light (teal) AND a white-bg page override is active.
    // In all other cases keep the default DARK style (white icons).
    const useLightIcons = !currentIsDark && _statusBarOverrides.size > 0;

    try {
        // 'LIGHT' → dark (black) icons for light-background pages (Quran, Tasbih, Mushaf)
        // 'DARK'  → light (white) icons for dark/teal-background pages (Home, Schedule, etc.)
        StatusBar.setStyle({ style: useLightIcons ? 'LIGHT' : 'DARK' });
    } catch (err) {
        console.warn('[Theme] Failed to set StatusBar style', err);
    }
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
            // Status bar: transparent by default with edge-to-edge active.
            // No setBackgroundColor() needed — WindowCompat.setDecorFitsSystemWindows(false)
            // in MainActivity already handles this.

            // Navigation bar: color comes from the WebView CSS content showing through
            // the transparent nav bar (edge-to-edge). We only control icon appearance.
            // darkButtons: false = white/light icons (correct for teal and dark backgrounds)
            NavigationBar.setNavigationBarColor({
                color: finalDark ? '#031013' : '#0a3540',
                darkButtons: false
            });

            // Re-evaluate icon style now that the theme has changed.
            // This also respects any active white-page override.
            _applyStatusBarStyle();
        } catch (err) {
            console.warn('[Theme] Failed to set native NavigationBar or StatusBar', err);
        }
    }
}

