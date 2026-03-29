/**
 * App Initializer & Orchestrator
 * Coordinates all modules and handles the application lifecycle.
 */

// Core & Libraries
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CONFIG } from './config/version-config.js';
import { getSavedLocation } from './core/geolocation.js';
import { getQiblaDirection, getPrayerTimesByCoords } from './core/api.js';

// State & Core Services
import { initBackHandler } from './modules/system/back-handler.js';
import {
    initNotificationService,
    checkNotificationPermission,
    requestNotificationPermission,
} from './modules/notification/native-notification.js';
import { syncNotifications } from './modules/notification/notification-sync.js';
import { updateWatcher } from './modules/prayer/prayer-watcher.js';
import { preload as preloadBookmarks } from './modules/quran/bookmark-manager.js';

// Permission UI
import { showPermissionDialogPreset } from './modules/permission/permission-dialog-configs.js';
import { hideModal as hideLocationModal, isModalActive as isLocationModalActive } from './components/modal/location-modal.js';
import '../css/components/modal/permission-dialog.css';

// Utilities & Helpers
import { initPullToRefresh } from './utils/pull-to-refresh.js';
import { initGlobalFocusManager } from './utils/focus-manager.js';

// Router
import * as router from './router.js';
import { refreshCurrentPage } from './router.js';

// UI Components
import * as header from './components/ui/header.js';
import * as navBar from './components/ui/nav-bar.js';

// Static Pages (Critical Path)
import * as homePage from './pages/home-page.js';

const SPLASH_MIN_DURATION = 1500;
const POST_SPLASH_DIALOG_DELAY = 1500;

/**
 * Initialize the entire application
 */
export async function initApp() {
    // Set dynamic app name, version, and developer on splash screen
    const splashTitleEl = document.querySelector('.splash-title');
    if (splashTitleEl) splashTitleEl.textContent = CONFIG.appName;

    const splashVersionEl = document.getElementById('splash-version');
    if (splashVersionEl) splashVersionEl.textContent = `v ${CONFIG.version}`;

    const splashSubtitleEl = document.getElementById('splash-subtitle');
    if (splashSubtitleEl) splashSubtitleEl.textContent = `by ${CONFIG.developer}`;

    // Set document title dynamically
    document.title = CONFIG.appName;

    // Initialize hardware back button handler
    initBackHandler();

    // Initialize native notification service (permissions)
    initNotificationService();
    initGlobalFocusManager();

    // Fire-and-forget: 30-day rolling notification sync on startup
    syncNotifications();

    // Preload bookmark cache for instant UI
    preloadBookmarks();

    // Listen for app resume → re-sync 30-day notifications
    initAppResumeListener();

    const splashEl = document.getElementById('splash-screen');
    const fillEl = document.getElementById('splash-loading-fill');
    const splashStart = Date.now();

    // Initialize global pull-to-refresh
    // - Triggers soft-reload preserving the app shell and avoiding splash screen
    // - Disabled when Quran modal is active to prevent gesture collision
    initPullToRefresh({
        scrollElement: '#app-content',
        threshold: 80,
        disableOnQuran: true,
        async onRefresh() {
            await refreshCurrentPage();
        }
    });

    // Animate loading bar
    animateLoadingBar(fillEl);

    // Initialize global prayer watcher if location is available
    prefetchAndInitWatcher();

    // Initialize header
    const headerEl = document.getElementById('app-header');
    if (headerEl) header.render(headerEl);

    // Initialize bottom nav
    const navEl = document.getElementById('bottom-nav');
    if (navEl) navBar.render(navEl, handleNavigation);

    // Register routes — only homePage is statically imported (critical path).
    // All other pages use lazy handlerFactory via dynamic import().
    router.register('home', homePage);
    router.register('schedule', () => import('./pages/schedule-page.js'));
    router.register('compass', () => import('./pages/compass-page.js'));
    router.register('quran', () => import('./pages/quran-page.js'));
    router.register('settings', () => import('./pages/settings-page.js'));

    // Sync nav-bar on every navigation (including goBack)
    router.onNavigate((page) => navBar.setActive(page));

    // Navigate to home
    await router.navigate('home');

    // Prefetch qibla direction in background so compass page loads instantly
    prefetchQiblaDirection();

    // Ensure minimum splash duration
    const elapsed = Date.now() - splashStart;
    const remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);
    await new Promise(resolve => setTimeout(resolve, remaining));

    // Ensure loading bar is at 100%
    if (fillEl) fillEl.style.width = '100%';
    await new Promise(resolve => setTimeout(resolve, 400));

    // Hide web splash with CSS fade-out transition
    if (splashEl) splashEl.classList.add('hidden');

    // Background pre-fetch: download lazy route modules during idle time.
    // Delayed to avoid competing with post-splash permission dialogs and
    // modal transitions. A heavy JS parse here causes main thread jank/glitches.
    setTimeout(() => {
        router.prefetch('schedule');
        router.prefetch('compass');
        router.prefetch('quran');
        router.prefetch('settings');
    }, 5000);

    setTimeout(triggerPostSplashPermissions, POST_SPLASH_DIALOG_DELAY);
}

/**
 * Handle navigation from bottom nav
 */
function handleNavigation(tabId) {
    router.navigate(tabId);
}

/**
 * Animate the splash loading bar
 */
function animateLoadingBar(fillEl) {
    if (!fillEl) return;

    const steps = [
        { target: 30, duration: 400 },
        { target: 60, duration: 600 },
        { target: 85, duration: 800 },
    ];

    let stepIndex = 0;

    function nextStep() {
        if (stepIndex >= steps.length) return;

        const step = steps[stepIndex];
        fillEl.style.transition = `width ${step.duration}ms ease`;
        fillEl.style.width = step.target + '%';

        stepIndex++;
        setTimeout(nextStep, step.duration + 100);
    }

    // Start after a small delay
    setTimeout(nextStep, 200);
}

/**
 * Prefetch qibla direction in background (fire-and-forget).
 * Uses the saved location to call the API; result is cached by api.js
 * so compass-page.js can load it instantly later.
 */
async function prefetchQiblaDirection() {
    try {
        const location = await getSavedLocation();
        if (location?.latitude && location?.longitude) {
            await getQiblaDirection(location.latitude, location.longitude);
        }
    } catch (e) {
        console.warn('[App] Qibla prefetch failed:', e.message);
    }
}

/**
 * Prefetch timings and initialize global prayer watcher
 */
async function prefetchAndInitWatcher() {
    try {
        const location = await getSavedLocation();
        if (location?.latitude && location?.longitude) {
            const timings = await getPrayerTimesByCoords(location.latitude, location.longitude);
            if (timings) {
                updateWatcher(timings);
            }
        }
    } catch (e) { }
}

/**
 * Initialize the App lifecycle listener.
 * On every resume from background → trigger 30-day notification sync.
 */
function initAppResumeListener() {
    try {
        App.addListener('appStateChange', (state) => {
            if (state.isActive) {
                console.log('[App] Resumed — syncing 30-day notifications');
                syncNotifications();
            }
        });
        console.log('[App] Resume listener initialized');
    } catch (e) {
        console.warn('[App] Could not register appStateChange listener:', e.message);
    }
}

async function triggerPostSplashPermissions() {
    if (!Capacitor.isNativePlatform()) return;
    await _requestNotificationIfNeeded();
}

async function _requestNotificationIfNeeded() {
    const alreadyGranted = await checkNotificationPermission();
    if (alreadyGranted) return;

    // Skip if user previously declined — respect until they re-enable via settings
    if (localStorage.getItem('satu_ramadhan_notif') === 'false') return;

    // If there is an active location modal, hide it to prevent visual glitches
    // when the two modals stack on first launch.
    if (isLocationModalActive()) {
        await hideLocationModal();
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    showPermissionDialogPreset('notification', {
        onConfirm: async () => {
            const granted = await requestNotificationPermission();
            if (granted) {
                localStorage.setItem('satu_ramadhan_notif', 'true');
                syncNotifications();
            } else {
                localStorage.setItem('satu_ramadhan_notif', 'false');
            }
        },
        onCancel: () => {
            localStorage.setItem('satu_ramadhan_notif', 'false');
        },
    });
}
