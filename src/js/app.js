/**
 * App Initializer & Orchestrator
 * Coordinates all modules and handles the application lifecycle.
 */

// Core & Libraries
import { App } from '@capacitor/app';
import { CONFIG } from './config/version-config.js';
import { getQiblaDirection } from './core/api.js';
import { isNative } from './modules/system/platform.js';

// State & Core Services
import { store } from './core/store.js';
import { initI18n, changeLanguage, loadNS, t, getCurrentLang } from './core/i18n.js';
import { initBackHandler } from './modules/system/back-handler.js';
import {
    initNotificationService,
    checkNotificationPermission,
    requestNotificationPermission,
} from './modules/notification/native-notification.js';
import { syncNotifications } from './modules/notification/notification-sync.js';
import { preload as preloadBookmarks } from './modules/quran/bookmark-manager.js';

// Network
import { initOfflineUpdater } from './modules/network/offline-updater.js';

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

let _cleanupPtr = null;

/**
 * Initialize the entire application
 */
export async function initApp() {
    // Hydrate persistent state before anything else
    await store.hydrate();

    // Initialize i18n — must run after hydrate (reads saved language)
    // and before any render (components may call t())
    await initI18n();

    // Global language-switch listener:
    // When the user changes language in Settings, re-render the global shell
    // (header + nav bar) and soft-reload the active page so every visible
    // string updates without a full app restart.
    store.subscribe('settings.language', async (lang) => {
        await changeLanguage(lang);

        // Dynamically update document layout language for Screen Readers
        document.documentElement.lang = getCurrentLang();

        const headerEl = document.getElementById('app-header');
        if (headerEl) header.render(headerEl);

        const navEl = document.getElementById('bottom-nav');
        if (navEl) {
            const currentPage = router.getCurrentPage() || 'home';
            await navBar.render(navEl, handleNavigation, currentPage);
        }

        document.title = t('common:app_name');

        // Safely re-initialize Global Pull-To-Refresh to mount new translated strings
        if (_cleanupPtr) {
            _cleanupPtr();
            _cleanupPtr = null;
        }
        await setupGlobalPullToRefresh();

        await refreshCurrentPage();
    });

    // Set dynamic app name, version, and developer on splash screen
    const splashTitleEl = document.querySelector('.splash-title');
    if (splashTitleEl) splashTitleEl.textContent = t('common:app_name');

    const splashVersionEl = document.getElementById('splash-version');
    if (splashVersionEl) splashVersionEl.textContent = `v ${CONFIG.version}`;

    const splashSubtitleEl = document.getElementById('splash-subtitle');
    if (splashSubtitleEl) splashSubtitleEl.textContent = `by ${CONFIG.developer}`;

    const splashLoadingTextEl = document.getElementById('splash-loading-text');
    if (splashLoadingTextEl) splashLoadingTextEl.textContent = t('common:app_loading');

    // Set document title dynamically
    document.title = t('common:app_name');

    // Initialize hardware back button handler
    initBackHandler();

    // Initialize native notification service (permissions)
    initNotificationService();
    initGlobalFocusManager();
    initOfflineUpdater();

    // Fire-and-forget: 30-day rolling notification sync on startup
    syncNotifications();

    // Preload bookmark cache for instant UI
    preloadBookmarks();

    // Listen for app resume → re-sync 30-day notifications
    initAppResumeListener();

    const splashEl = document.getElementById('splash-screen');
    const fillEl = document.getElementById('splash-loading-fill');
    const splashStart = Date.now();

    // Configure HTML lang for accessibility on startup
    document.documentElement.lang = getCurrentLang();

    // Initialize global pull-to-refresh
    await setupGlobalPullToRefresh();

    // Animate loading bar
    animateLoadingBar(fillEl);

    // Explicitly import decoupled background workers so they evaluate their store subscriptions
    import('./modules/prayer/prayer-watcher.js');

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
 * Sets up the Global Pull to Refresh mechanism.
 * Injects translated strings securely and allows safe teardown.
 */
async function setupGlobalPullToRefresh() {
    await loadNS('utils/pull-to-refresh');

    _cleanupPtr = initPullToRefresh({
        scrollElement: '#app-content',
        threshold: 80,
        disableOnQuran: true,
        textPull: t('utils/pull-to-refresh:text_pull'),
        textRelease: t('utils/pull-to-refresh:text_release'),
        textRefreshing: t('utils/pull-to-refresh:text_refreshing'),
        async onRefresh() {
            await refreshCurrentPage();
        }
    });
}

/**
 * Prefetch qibla direction in background (fire-and-forget).
 * Uses the saved location to call the API; result is cached by api.js
 * so compass-page.js can load it instantly later.
 */
async function prefetchQiblaDirection() {
    try {
        const location = store.getState('location');
        if (location?.latitude && location?.longitude) {
            await getQiblaDirection(location.latitude, location.longitude);
        }
    } catch (e) {
        console.warn('[App] Qibla prefetch failed:', e.message);
    }
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
    if (!isNative) return;
    await _requestNotificationIfNeeded();
}

async function _requestNotificationIfNeeded() {
    const alreadyGranted = await checkNotificationPermission();
    if (alreadyGranted) return;

    // Skip if user previously declined — respect until they re-enable via settings
    if (store.getState('settings.notification') === false) return;

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
                store.setState('settings.notification', true);
                syncNotifications();
            } else {
                store.setState('settings.notification', false);
            }
        },
        onCancel: () => {
            store.setState('settings.notification', false);
        },
    });
}
