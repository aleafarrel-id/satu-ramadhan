/**
 * Offline Recovery Module
 * 
 * Intercepts network connectivity restorations and prompts the user
 * to update if the active cached schedule is derived from local fallback calculations.
 */

import { App } from '@capacitor/app';
import { showConfirmModal } from '../../components/modal/confirm-modal.js';
import { detectLocation } from '../../core/geolocation.js';
import { refreshCurrentPage } from '../../router.js';
import { store } from '../../core/store.js';
import * as storage from '../../core/storage.js';
import { loadNS, t } from '../../core/i18n.js';
import { success, error, info } from '../notification/notification.js';

const SESSION_DISMISS_KEY = 'offlineRecoveryDismissed';

export function initOfflineUpdater() {
    // Sync initial state
    _updateNetworkState();

    window.addEventListener('online', () => {
        _updateNetworkState();
        onNetworkRestored();
    });

    window.addEventListener('offline', () => {
        _updateNetworkState();
    });

    try {
        App.addListener('appStateChange', (state) => {
            if (state.isActive) {
                _updateNetworkState();
                // Short delay to let native network stack settle before checking for recovery
                if (navigator.onLine) {
                    setTimeout(onNetworkRestored, 1500);
                }
            }
        });
    } catch (e) {
        console.warn('Could not bind appStateChange to OfflineUpdater:', e.message);
    }

    // Perform an initial check on cold boot if the device is already online
    if (navigator.onLine) {
        // Slight delay to ensure the UI is fully mounted and won't visually clash with the splash screen
        setTimeout(onNetworkRestored, 3000);
    }
}

function _updateNetworkState() {
    store.setState('network.isOffline', !navigator.onLine);
}

async function onNetworkRestored() {
    // Fast-fail if not online
    if (!navigator.onLine) return;

    // Fast-fail if already dismissed in this session
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === 'true') {
        return;
    }

    try {
        const isUsingFallback = await checkCurrentMonthCacheIsFallback();

        if (isUsingFallback) {
            await promptUpdate();
        }
    } catch (err) {
        console.error('Error during offline recovery check:', err);
    }
}

async function checkCurrentMonthCacheIsFallback() {
    const loc = store.getState('location');
    if (!loc || !loc.latitude || !loc.longitude) return false;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const cacheKey = `monthly_cache_${loc.latitude.toFixed(2)}_${loc.longitude.toFixed(2)}_${year}_${month}`;
    const monthlyData = await storage.get(cacheKey);

    if (!monthlyData || !Array.isArray(monthlyData) || monthlyData.length === 0) {
        // We do not have monthly cache, or it's invalid.
        return false;
    }

    // Check if the dataset itself is branded as offline fallback
    // calculateLocalMonthlyTimes spreads calculateLocalDayTimes, so each item should have isOfflineFallback: true
    const sampleDay = monthlyData[0];
    return sampleDay && sampleDay.isOfflineFallback === true;
}

async function promptUpdate() {
    await loadNS('common');

    showConfirmModal({
        title: t('common:offline_recovery_title'),
        message: t('common:offline_recovery_message'),
        confirmText: t('common:offline_recovery_confirm'),
        cancelText: t('common:offline_recovery_cancel'),
        isDanger: false,
        theme: 'default',
        onConfirm: async () => {
            // Delete the compromised offline cache explicitly
            const loc = store.getState('location');
            if (loc && loc.latitude && loc.longitude) {
                const now = new Date();
                const cacheKeyMonthly = `monthly_cache_${loc.latitude.toFixed(2)}_${loc.longitude.toFixed(2)}_${now.getFullYear()}_${now.getMonth() + 1}`;
                await storage.remove(cacheKeyMonthly);
                // Also remove day cache just in case
                const cacheKeyDay = `prayer_cache_${loc.latitude.toFixed(2)}_${loc.longitude.toFixed(2)}_${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
                await storage.remove(cacheKeyDay);
            }

            // Force GPS re-detection to rebuild cache accurately using fresh coordinates
            // detectLocation(true) triggers GPS and saves to store, mimicking the location search modal behavior.
            try {
                const newLoc = await detectLocation(true);
                if (newLoc) {
                    store.setState('location', newLoc);
                    success(t('common:offline_recovery_success'));
                } else {
                    error(t('common:offline_recovery_failed'));
                }
            } catch (e) {
                console.warn('GPS prompt during offline recovery failed, falling back to refreshing with current location', e);
                error(t('common:offline_recovery_failed'));
            }

            // Finally, refresh UI which will trigger fetchScheduleData
            await refreshCurrentPage();
        },
        onCancel: () => {
            // Suppress the prompt until the app is fully restarted
            sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
            info(t('common:offline_recovery_skipped'));
        }
    });
}
