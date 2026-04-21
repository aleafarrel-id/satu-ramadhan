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
import { initTheme } from './core/theme.js';
import { initI18n, changeLanguage, loadNS, t, getCurrentLang } from './core/i18n.js';
import { initBackHandler } from './modules/system/back-handler.js';
import {
    initNotificationService,
    checkNotificationPermission,
    requestNotificationPermission,
    PrayerService,
} from './modules/notification/native-notification.js';
import { syncNotifications } from './modules/notification/notification-sync.js';
import { preload as preloadBookmarks } from './modules/quran/bookmark-manager.js';

// Network
import { initOfflineUpdater } from './modules/network/offline-updater.js';

// Permission UI
import { showPermissionDialogPreset } from './modules/permission/permission-dialog-configs.js';
import { hideModal as hideLocationModal, isModalActive as isLocationModalActive, showLocationModal } from './components/modal/location-modal.js';
import { showLocationSearchModal } from './components/modal/location-search-modal.js';
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

import { initTasbihGesture } from './modules/tasbih/tasbih-gesture.js';

/** Resolved after the first dynamic import of tasbih-page.js */
let _tasbih = null;

const SPLASH_MIN_DURATION = 1500;
const POST_SPLASH_DIALOG_DELAY = 1500;

let _cleanupPtr = null;

/**
 * Initialize the entire application
 */
export async function initApp() {
    // Hydrate persistent state before anything else
    await store.hydrate();

    // Initialize Theme globally before painting
    initTheme();

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

    // ── Cold-Start Murottal Rehydration ────────────────────────────────────────
    // Covers the case where the app was fully killed (force-close / swipe-dismiss)
    // while murottal was playing. In this scenario, the native foreground service
    // keeps running but the JS layer starts from scratch with all state reset.
    if (isNative) {
        import('./modules/quran/quran-audio-service.js')
            .then(({ rehydrateFromNative }) => rehydrateFromNative())
            .catch(e => console.warn('[App] Cold-start murottal rehydration failed:', e.message));
    }

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

    // Initialize Tasbih System — dynamically imported to keep Tasbih out of the
    // startup main chunk. import() resolves after splash; all callbacks below
    // run after that point, so _tasbih is always populated when needed.
    const tasbihPanelEl = document.getElementById('tasbih-panel');
    if (tasbihPanelEl) {
        import('./pages/tasbih-page.js').then((mod) => {
            _tasbih = mod;
            _tasbih.init(tasbihPanelEl);
        });
        initTasbihGesture({
            onOpen: () => _tasbih?.open(),
            getCurrentPage: () => router.getCurrentPage()
        });
    }

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

    // Background pre-fetch: download lazy route modules sequentially.
    // Await each chunk and inject a delay to prevent stacking JS evaluation
    // penalties, which would otherwise drop frames and cause UI lag.
    setTimeout(async () => {
        const pagesToPrefetch = ['schedule', 'compass', 'settings', 'quran'];
        for (const page of pagesToPrefetch) {
            // Await requestIdleCallback to ensure we only fetch when browser is not animating
            await new Promise(resolve => {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => resolve(), { timeout: 1000 });
                } else {
                    setTimeout(resolve, 50);
                }
            });

            await router.prefetch(page);
            // Give main thread 500ms to breathe between parsing chunks
            await new Promise(res => setTimeout(res, 500));
        }
    }, 4000);

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
        checkDisabled: () => _tasbih?.isOpen() ?? false,
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
 * On every resume from background:
 *   - Re-sync 30-day prayer notifications
 *   - Rehydrate Murottal playback state from native background service
 */
function initAppResumeListener() {
    try {
        App.addListener('appStateChange', async (state) => {
            if (state.isActive) {
                console.log('[App] Resumed — syncing 30-day notifications');
                syncNotifications();

                // Rehydrate murottal state from native background service
                if (isNative) {
                    try {
                        const { rehydrateFromNative } = await import('./modules/quran/quran-audio-service.js');
                        await rehydrateFromNative();
                    } catch (e) {
                        console.warn('[App] Murottal rehydration failed:', e.message);
                    }
                }
            }
        });
        console.log('[App] Resume listener initialized');
    } catch (e) {
        console.warn('[App] Could not register appStateChange listener:', e.message);
    }
}

async function triggerPostSplashPermissions() {
    if (!isNative) return;

    const interruptedByNotif = await _requestNotificationIfNeeded();
    const interruptedByBattery = await _requestBatteryOptIfNeeded();

    // Jika dialog lokasi ditutup paksa demi menampilkan dialog perizinan,
    // kembalikan dialog lokasinya (jika user masih belum set lokasi)
    if (interruptedByNotif || interruptedByBattery) {
        if (!store.getState('location')) {
            // Beri waktu agar dialog izin selesai tertutup
            await new Promise(resolve => setTimeout(resolve, 400));
            showLocationModal({
                onLocationDetected: (location) => {
                    store.setState('location', location);
                },
                onManualSelect: () => {
                    showLocationSearchModal({
                        onLocationSelected: (loc) => {
                            store.setState('location', loc);
                        }
                    });
                }
            });
        }
    }
}

async function _requestNotificationIfNeeded() {
    const alreadyGranted = await checkNotificationPermission();
    if (alreadyGranted) return false;

    if (store.getState('settings.notification') === false) return false;

    let interrupted = false;
    if (isLocationModalActive()) {
        interrupted = true;
        await hideLocationModal();
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    await showPermissionDialogPreset('notification', {
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

    return interrupted;
}

async function _requestBatteryOptIfNeeded() {
    if (store.getState('settings.battery_opt_seen')) return false;

    if (store.getState('settings.notification') === false) return false;

    try {
        const status = await PrayerService.isIgnoringBatteryOptimizations();
        if (status && status.isIgnoring) {
            store.setState('settings.battery_opt_seen', true);
            return false;
        }
    } catch (e) {
        console.warn('[App] isIgnoringBatteryOptimizations failed:', e);
    }

    let interrupted = false;
    if (isLocationModalActive()) {
        interrupted = true;
        await hideLocationModal();
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Small delay to allow previous dialog animation to settle
    await new Promise(resolve => setTimeout(resolve, 350));

    await showPermissionDialogPreset('battery', {
        onConfirm: async () => {
            try {
                store.setState('settings.battery_opt_seen', true);
                await PrayerService.openBatteryOptimizationSettings();
            } catch (e) {
                console.warn('[App] Could not open battery settings:', e);
            }
        },
        onCancel: () => {
            // User chose "Lain Kali" — mark as seen so it won't auto-show again
            // They can still open it manually from settings
            store.setState('settings.battery_opt_seen', true);
        },
    });

    return interrupted;
}
