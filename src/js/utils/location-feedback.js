import { checkGpsEnabled, detectLocation, openLocationSettings } from '../core/geolocation.js';

import * as notif from '../modules/notification/notification.js';

/**
 * Handles the button loading state and location detection flow.
 * 
 * @param {HTMLButtonElement} button - The button to attach state to
 * @param {Function} onSuccess - Callback when location is successfully detected
 * @returns {Promise<object|null>} The detected location or null
 */
export async function handleGpsDetectionWithButton(button, onSuccess) {
    if (!button || button.disabled) return null;

    // Save original state & set loading
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i><span>Mendeteksi Lokasi...</span>`;

    const location = await detectLocationWithFeedback(true);
    if (location) {
        onSuccess?.(location);
    }

    // Restore original state
    button.disabled = false;
    button.innerHTML = originalHtml;

    return location;
}

/**
 * Executes location detection flow with standard UI notifications.
 * Wraps the identical logic found across location-modal and settings-loc-card.
 * 
 * @param {boolean} forceRefresh - Whether to force a fresh GPS fetch.
 * @returns {Promise<object|null>} The location object if successful, null otherwise.
 */
export async function detectLocationWithFeedback(forceRefresh = true) {
    const isGpsOn = await checkGpsEnabled();
    if (!isGpsOn) {
        notif.error('GPS belum diaktifkan');
        openLocationSettings();
        return null;
    }

    try {
        const location = await detectLocation(forceRefresh);
        if (location) {
            notif.success(`Lokasi terdeteksi: ${location.regencyName}`);
            return location;
        } else {
            notif.error('Gagal mendeteksi lokasi, silakan coba lagi');
            return null;
        }
    } catch {
        notif.error('Gagal mendeteksi lokasi, pastikan GPS aktif');
        return null;
    }
}

/**
 * Handles manual location selection and standardizes the feedback notification.
 * 
 * @param {object} location - The selected location object
 * @returns {Promise<object>} The saved location object
 */
export async function handleManualLocationSelection(location) {
    if (!location) return null;

    notif.success(`Lokasi diatur: ${location.regencyName}`);
    return location;
}
