/**
 * App Initializer & Orchestrator
 * Coordinates all modules and handles app lifecycle
 */

import { CONFIG } from './config.js';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

import { getSavedLocation } from './core/geolocation.js';
import { getQiblaDirection, getPrayerTimesByCoords } from './core/api.js';

import { initBackHandler } from './modules/system/back-handler.js';
import { initNotificationService } from './modules/notification/native-notification.js';
import { syncNotifications } from './modules/notification/notification-sync.js';
import { updateWatcher } from './modules/prayer/prayer-watcher.js';

import * as header from './components/ui/header.js';
import * as navBar from './components/ui/nav-bar.js';

import * as homePage from './pages/home-page.js';
import * as schedulePage from './pages/schedule-page.js';
import * as compassPage from './pages/compass-page.js';
import * as quranPage from './pages/quran-page.js';
import * as settingsPage from './pages/settings-page.js';
import * as router from './router.js';

import { initPullToRefresh } from './utils/pull-to-refresh.js';
import { initGlobalFocusManager } from './utils/focus-manager.js';

const SPLASH_MIN_DURATION = 1500;

/**
 * Initialize the entire application
 */
export async function initApp() {
    // Set dynamic version and developer name on splash screen
    const splashVersionEl = document.getElementById('splash-version');
    if (splashVersionEl) splashVersionEl.textContent = `v ${CONFIG.version}`;

    const splashSubtitleEl = document.getElementById('splash-subtitle');
    if (splashSubtitleEl) splashSubtitleEl.textContent = `by ${CONFIG.developer}`;

    // Initialize hardware back button handler
    initBackHandler();

    // Initialize native notification service (permissions)
    initNotificationService();
    initGlobalFocusManager();

    // Request native file system permissions upfront (if needed)
    if (Capacitor.getPlatform() !== 'web') {
        try {
            const permStatus = await Filesystem.checkPermissions();
            if (permStatus.publicStorage !== 'granted') {
                await Filesystem.requestPermissions();
            }
        } catch (e) {
            console.warn('[App] Storage permissions request failed:', e.message);
        }
    }

    // Fire-and-forget: 30-day rolling notification sync on startup
    syncNotifications();

    // Listen for app resume → re-sync 30-day notifications
    initAppResumeListener();

    const splashEl = document.getElementById('splash-screen');
    const fillEl = document.getElementById('splash-loading-fill');
    const splashStart = Date.now();

    // Initialize pull-to-refresh
    initPullToRefresh({
        scrollElement: '#app-content',
        threshold: 80,
        onRefresh() {
            window.location.reload();
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

    // Register routes
    router.register('home', homePage);
    router.register('schedule', schedulePage);
    router.register('compass', compassPage);
    router.register('quran', quranPage);
    router.register('settings', settingsPage);

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
}

/**
 * Handle navigation from bottom nav
 */
function handleNavigation(tabId) {
    router.navigate(tabId);
    navBar.setActive(tabId);
}

/**
 * Animate the splash loading bar
 */
function animateLoadingBar(fillEl) {
    if (!fillEl) return;

    let progress = 0;
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
