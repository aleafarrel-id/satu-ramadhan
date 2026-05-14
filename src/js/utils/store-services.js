/**
 * Store Services Utility
 * Manages Google Play In-App Review and In-App Update flows.
 */

import { AppUpdate, AppUpdateAvailability, FlexibleUpdateInstallStatus, AppUpdateResultCode } from '@capawesome/capacitor-app-update';
import { AppReview } from '@capawesome/capacitor-app-review';
import { Preferences } from '@capacitor/preferences';
import { isNative } from '../modules/system/platform.js';

const LAUNCH_COUNT_KEY = 'store_launch_count';
const MIN_LAUNCHES_FOR_REVIEW = 5;

const IMMEDIATE_UPDATE_STALENESS_DAYS = 30;

// Module-level lock: ensures review and update dialogs never overlap.
let _isStoreFlowActive = false;

// Private Helpers

/**
 * Reads the current launch count from persistent storage.
 * @returns {Promise<number>}
 */
async function _getLaunchCount() {
    const { value } = await Preferences.get({ key: LAUNCH_COUNT_KEY });
    return value ? parseInt(value, 10) : 0;
}

/**
 * Increments and persists the launch count.
 * @param {number} currentCount
 * @returns {Promise<number>} The new count after increment.
 */
async function _incrementLaunchCount(currentCount) {
    const newCount = currentCount + 1;
    await Preferences.set({ key: LAUNCH_COUNT_KEY, value: String(newCount) });
    return newCount;
}

/**
 * Waits for a Flexible Update download to reach DOWNLOADED status.
 * The listener is registered BEFORE the promise is returned to avoid the
 * race condition where a fast DOWNLOADED event fires before the handle is stored.
 * Resolves with `true` on success, `false` if download fails or is cancelled.
 * @returns {Promise<boolean>}
 */
async function _waitForFlexibleDownload() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });

    // Register listener FIRST, before any state can change.
    const listenerHandle = await AppUpdate.addListener('onFlexibleUpdateStateChange', (state) => {
        const { installStatus } = state;

        if (installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
            clearTimeout(timeoutId);
            listenerHandle.remove().catch(() => { });
            resolve(true);
        } else if (
            installStatus === FlexibleUpdateInstallStatus.FAILED ||
            installStatus === FlexibleUpdateInstallStatus.CANCELED
        ) {
            clearTimeout(timeoutId);
            listenerHandle.remove().catch(() => { });
            resolve(false);
        }
    });

    // Safety timeout: if download hangs for 5 minutes, give up gracefully.
    const timeoutId = setTimeout(() => {
        listenerHandle.remove().catch(() => { });
        resolve(false);
    }, 5 * 60 * 1000);

    return promise;
}

// Public API

/**
 * Checks for an available app update and prompts the user if found.
 *
 * - Immediate Update: for apps stale > IMMEDIATE_UPDATE_STALENESS_DAYS days.
 * - Flexible Update: background download; app restarts after download completes.
 *
 * This must be called once on app startup, AFTER the splash screen is hidden.
 * The `_isStoreFlowActive` lock is set for the entire duration so the review
 * dialog cannot interrupt.
 *
 * @returns {Promise<boolean>} True if an update flow was initiated.
 */
export async function checkForUpdate() {
    if (!isNative) return false;

    try {
        const result = await AppUpdate.getAppUpdateInfo();

        if (result.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
            return false;
        }

        _isStoreFlowActive = true;

        const isUrgent = result.immediateUpdateAllowed &&
            result.clientVersionStalenessDays != null &&
            result.clientVersionStalenessDays > IMMEDIATE_UPDATE_STALENESS_DAYS;

        if (isUrgent) {
            await AppUpdate.performImmediateUpdate();
        } else if (result.flexibleUpdateAllowed) {
            const startResult = await AppUpdate.startFlexibleUpdate();

            if (startResult.code === AppUpdateResultCode.OK) {
                const downloaded = await _waitForFlexibleDownload();
                if (downloaded) {
                    await AppUpdate.completeFlexibleUpdate();
                }
            }
        }

        _isStoreFlowActive = false;
        return true;
    } catch (e) {
        _isStoreFlowActive = false;
        console.warn('[StoreServices] Update check failed (expected on emulator):', e.message);
        return false;
    }
}

/**
 * Attempts to show the Google Play In-App Review dialog.
 *
 * Gated by MIN_LAUNCHES_FOR_REVIEW. Google's API silently no-ops if:
 * - The user has already submitted a review.
 * - The monthly quota has been exceeded.
 * - The app is running outside the Play Store environment (emulator, debug build).
 *
 * @returns {Promise<void>}
 */
export async function requestReviewIfEligible() {
    if (!isNative) return;
    if (_isStoreFlowActive) return;

    try {
        const launchCount = await _getLaunchCount();
        const newCount = await _incrementLaunchCount(launchCount);

        if (newCount < MIN_LAUNCHES_FOR_REVIEW) {
            console.log(`[StoreServices] Review not triggered. Launch: ${newCount}/${MIN_LAUNCHES_FOR_REVIEW}`);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 2500));

        if (_isStoreFlowActive) return;

        await AppReview.requestReview();
        console.log('[StoreServices] In-App Review requested.');
    } catch (e) {
        console.warn('[StoreServices] Review request failed (expected on emulator):', e.message);
    }
}
