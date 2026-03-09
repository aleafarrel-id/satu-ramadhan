import { getSavedLocation } from '../core/geolocation.js';
import { getPrayerTimesByCoords } from '../core/api.js';

import { getCurrentPrayer } from '../modules/prayer/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/schedule/countdown.js';
import { getSelectedOrg, getOrgDisplayName } from '../modules/schedule/ramadhan.js';
import { schedulePrayerNotifications } from '../modules/notification/native-notification.js';
import { updateWatcher } from '../modules/prayer/prayer-watcher.js';

import { renderPrayerCard, updatePrayerCardFills, updatePrayerCardDynamicUI } from '../components/card/prayer-card.js';
import { renderLocationCard as renderLocationCardShared, bindLocationCardEvents } from '../components/card/location-card.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { handleOrgToggle as handleOrgToggleShared } from '../components/prayer/prayer-widgets.js';
import { renderHomeSkeleton } from '../components/skeleton/skeleton-home.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { renderCountdownCard } from '../components/card/countdown-card.js';

/* --- STATE --- */
let _container = null;
let _timings = null;
let _location = null;
let _lastPrayerIndex = -1;

/* --- LIFECYCLE --- */

/**
 * Initializes and renders the home page.
 * Displays a skeleton UI initially, fetches the user's location,
 * then retrieves prayer timings and renders the actual content.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 */
export async function render(container) {
    _container = container;
    _location = await getSavedLocation();

    renderSkeleton(_location);

    if (_location) {
        try {
            _timings = await getPrayerTimesByCoords(_location.latitude, _location.longitude);
        } catch { /* handled gracefully in renderContent */ }
        await renderContent();
    } else {
        showLocationModalForHome();
    }
}

/**
 * Halts the active countdown timer and nullifies module
 * variables to prevent memory leaks during page navigation.
 */
export function destroy() {
    stopCountdown();
    _container = null;
    _timings = null;
}

/* --- INITIALIZATION --- */

/**
 * Starts the global countdown timer for the next prayer.
 * Syncs UI elements (like tube levels and active prayer card) 
 * tick-by-tick so it perfectly matches the remaining time.
 */
function startCountdownTimer() {
    const hoursEl = document.getElementById('cd-hours');
    const minutesEl = document.getElementById('cd-minutes');
    const secondsEl = document.getElementById('cd-seconds');

    if (!hoursEl) return;

    startCountdown(
        ({ hours, minutes, seconds }) => {
            hoursEl.textContent = String(hours);
            minutesEl.textContent = String(minutes).padStart(2, '0');
            secondsEl.textContent = String(seconds).padStart(2, '0');

            const currentState = getCurrentPrayer(_timings);
            if (_lastPrayerIndex !== currentState.currentIndex) {
                _lastPrayerIndex = currentState.currentIndex;
                updatePrayerCardDynamicUI(_timings, currentState);
            }

            updatePrayerCardFills(_timings, currentState);
        },
        () => getCurrentPrayer(_timings).next?.date
    );
}

/* --- RENDER METHODS --- */

/**
 * Renders the home skeleton layout to provide a responsive
 * feel before network requests complete.
 *
 * @param {Object} location - Optional location entity if cached.
 */
function renderSkeleton(location) {
    renderHomeSkeleton(_container, location, showLocationModalForHome);
}

/**
 * Evaluates the current state strings (_timings, _location) and renders
 * the main content, encompassing empty states, location card, 
 * countdown timer, and dynamic tall-tubes for daily schedule tracking.
 */
async function renderContent() {
    if (!_timings && !_location) {
        _container.innerHTML = `
            ${renderLocationCardShared(_location)}
            ${renderEmptyState({
            icon: 'bx-map-pin',
            title: 'Atur Lokasi Anda',
            description: 'Jadwal sholat akan ditampilkan setelah lokasi diatur melalui Pengaturan.',
            compact: true,
        })}
        `;
        bindLocationCardEvents(showLocationModalForHome, _container);
        return;
    }

    if (!_timings && _location) {
        _container.innerHTML = `
            ${renderLocationCardShared(_location)}
            ${renderEmptyState({
            icon: 'bx-wifi-off',
            iconVariant: 'warning',
            title: 'Gagal Memuat Jadwal',
            description: 'Tidak dapat memuat jadwal waktu sholat. Periksa koneksi internet Anda dan coba lagi.',
            action: {
                label: 'Coba Lagi',
                icon: 'bx-refresh',
                onclick: 'location.reload()',
            },
        })}
        `;
        bindLocationCardEvents(showLocationModalForHome, _container);
        return;
    }

    const prayerState = getCurrentPrayer(_timings);
    const org = await getSelectedOrg();
    const orgName = getOrgDisplayName(org);

    _container.innerHTML = `
        ${renderLocationCardShared(_location)}
        ${renderCountdownCard(prayerState)}

        <div class="schedule-title">Jadwal Hari Ini</div>
        <div class="card card--container">
            ${renderPrayerCard(_timings, orgName, prayerState)}
        </div>
    `;

    document.getElementById('org-toggle')?.addEventListener('click', handleOrgToggle);
    bindLocationCardEvents(showLocationModalForHome, _container);

    _lastPrayerIndex = prayerState.currentIndex;

    startCountdownTimer();
    schedulePrayerNotifications(_timings);
    updateWatcher(_timings);
}

/* --- EVENT HANDLERS --- */

/**
 * Triggers the geographic selection modal directly from the 
 * home interface and fetches new prayer batches if an update takes place.
 */
function showLocationModalForHome() {
    showLocationModal({
        onLocationDetected: async (location) => {
            _location = location;
            try {
                _timings = await getPrayerTimesByCoords(location.latitude, location.longitude);
            } catch { /* handled in renderContent */ }
            await renderContent();
        },
        onManualSelect: () => {
            showLocationSearchModal();
        },
    });
}

/**
 * Switches the organizational source for fetching timings
 * (e.g. between Kemenag and Muhammadiyah or NU), then re-fetches
 * timings and re-renders content so prayer times reflect the new org.
 */
async function handleOrgToggle() {
    await handleOrgToggleShared('org-label', async () => {
        if (_location) {
            try {
                _timings = await getPrayerTimesByCoords(_location.latitude, _location.longitude);
            } catch { /* handled in renderContent */ }
            stopCountdown();
            await renderContent();
        }
    });
}
