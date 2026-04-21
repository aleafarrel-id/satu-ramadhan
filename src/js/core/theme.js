/**
 * Theme Manager Core
 * Evaluates 'dark', 'teal', or 'auto' and applies it to the DOM safely.
 */
import { store } from './store.js';

let _mediaQueryListener = null;

/**
 * Initializes the theme based on user state and OS preferences.
 * Must be called early in app startup to prevent FOUC.
 */
export function initTheme() {
    const savedTheme = store.getState('settings.theme') ?? 'auto';
    applyThemeBackground(savedTheme);

    // Watch for OS theme changes if 'auto' is selected
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    _mediaQueryListener = (e) => {
        if (store.getState('settings.theme') === 'auto') {
            applyThemeBackground('auto', e.matches);
        }
    };
    mql.addEventListener('change', _mediaQueryListener);

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
export function applyThemeBackground(themeMode, isOsDark = null) {
    let finalDark = false;
    
    if (themeMode === 'auto') {
        const prefersDark = isOsDark !== null ? isOsDark : window.matchMedia('(prefers-color-scheme: dark)').matches;
        finalDark = prefersDark;
    } else if (themeMode === 'dark') {
        finalDark = true;
    } else {
        // 'teal' / default
        finalDark = false;
    }

    // Apply the CSS scope mappings
    if (finalDark) {
        document.documentElement.dataset.theme = 'dark';
    } else {
        // We delete the dataset to fallback mathematically to default css :root (Teal)
        delete document.documentElement.dataset.theme;
    }

    // Enterprise standard: Sync PWA status bar & chrome to match background
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', finalDark ? '#031013' : '#1A2B3A');
    }
}
