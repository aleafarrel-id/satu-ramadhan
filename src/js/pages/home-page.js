import { getSavedLocation } from '../core/geolocation.js';
import { getPrayerTimesByCoords } from '../core/api.js';

import { getCurrentPrayer } from '../modules/prayer/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/schedule/countdown.js';
import { getOrgDisplayNameAsync } from '../modules/schedule/ramadhan.js';

import { updateWatcher } from '../modules/prayer/prayer-watcher.js';

import { renderPrayerCard, updatePrayerCardFills, updatePrayerCardDynamicUI } from '../components/card/prayer-card.js';
import { renderPrayerListCard, getHomeMapId } from '../components/card/prayer-list.js';
import { renderLocationCard as renderLocationCardShared, bindLocationCardEvents } from '../components/card/location-card.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { handleOrgToggle as handleOrgToggleShared } from '../components/prayer/prayer-widgets.js';
import { renderHomeSkeleton } from '../components/skeleton/skeleton-home.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { renderCountdownCard } from '../components/card/countdown-card.js';

import { safeClear } from '../utils/dom-utils.js';

/* --- CONSTANTS --- */
const STORAGE_KEY = 'home_view_mode';
const VIEW_TUBE = 'tube';
const VIEW_LIST = 'list';
const FADE_OUT_MS = 200;

/* --- STATE --- */
let _container = null;
let _timings = null;
let _location = null;
let _lastPrayerIndex = -1;
let _viewMode = VIEW_TUBE;

/* --- LIFECYCLE --- */

/**
 * Initializes and renders the home page.
 * Displays a skeleton UI initially, fetches the user's location,
 * then retrieves prayer timings and renders the actual content.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 * @param {Object} [options={}] - Navigation options (e.g., refresh: true)
 */
export async function render(container, options = {}) {
    _container = container;

    safeClear(container);
    renderSkeleton(null);

    if (options.refresh) {
        await new Promise(resolve => setTimeout(resolve, 350));
    }

    _location = await getSavedLocation();
    _viewMode = localStorage.getItem(STORAGE_KEY) || VIEW_TUBE;

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

/**
 * Getter for current prayer timings.
 * Used by settings-panel to re-schedule notifications on toggle change.
 * @returns {object|null} Current prayer timings or null if not loaded
 */
export function getTimings() {
    return _timings;
}

/**
 * Re-render the home content after preset changes (called from Settings).
 * Exported so other modules can trigger a refresh without full page reload.
 */
export async function refreshHomeContent() {
    if (!_container || !_location) return;
    try {
        _timings = await getPrayerTimesByCoords(_location.latitude, _location.longitude);
    } catch { /* handled in renderContent */ }
    stopCountdown();
    await renderContent();
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

                // Update featured card in both views
                updatePrayerCardDynamicUI(_timings, currentState);

                // Update list view highlights if active
                if (_viewMode === VIEW_LIST) {
                    updateListHighlights(currentState);
                }
            }

            // Only update tube fills when the tube view is active
            if (_viewMode === VIEW_TUBE) {
                updatePrayerCardFills(_timings, currentState);
            }
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
    let contentHtml = '';

    if (!_timings) {
        const emptyStateProps = !_location ? {
            icon: 'bx-map-pin',
            title: 'Atur Lokasi Anda',
            description: 'Jadwal sholat akan ditampilkan setelah lokasi diatur melalui Pengaturan.',
            compact: true,
        } : {
            icon: 'bx-wifi-off',
            iconVariant: 'warning',
            title: 'Gagal Memuat Jadwal',
            description: 'Periksa koneksi internet Anda dan coba lagi.',
            action: {
                label: 'Coba Lagi',
                icon: 'bx-refresh',
                onclick: 'location.reload()',
            },
            compact: true,
        };

        contentHtml = renderEmptyState(emptyStateProps);
    } else {
        const prayerState = getCurrentPrayer(_timings);
        const orgName = await getOrgDisplayNameAsync();

        const tubeActive = _viewMode === VIEW_TUBE ? ' active' : '';
        const listActive = _viewMode === VIEW_LIST ? ' active' : '';

        contentHtml = `
            ${renderCountdownCard(prayerState)}
            <div class="home-schedule-header">
                <div class="schedule-title">Jadwal Hari Ini</div>
                <div class="schedule-nav__arrows shadow-sm">
                    <button class="schedule-nav__btn schedule-nav__btn--prev${tubeActive}" id="home-view-tube">
                        <i class='bx bx-grid-alt'></i>
                    </button>
                    <button class="schedule-nav__btn schedule-nav__btn--next${listActive}" id="home-view-list">
                        <i class='bx bx-list-ul'></i>
                    </button>
                </div>
            </div>
            <div class="card card--container" id="home-schedule-wrapper">
                ${renderScheduleView(prayerState, orgName)}
            </div>
        `;

        _lastPrayerIndex = prayerState.currentIndex;
    }

    safeClear(_container);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        ${renderLocationCardShared(_location)}
        ${contentHtml}
    `;
    // Append all internal elements of the wrapper to the container
    while (wrapper.firstChild) {
        _container.appendChild(wrapper.firstChild);
    }

    bindLocationCardEvents(showLocationModalForHome, _container);
    bindScheduleEvents();

    if (_timings) {
        startCountdownTimer();
        updateWatcher(_timings);
        await initMapIfListView();
    }
}

/**
 * Renders the schedule view content based on current _viewMode.
 * @param {object} prayerState - Current prayer state
 * @param {string} orgName     - Organization display name
 * @returns {string} HTML string
 */
function renderScheduleView(prayerState, orgName) {
    return _viewMode === VIEW_LIST
        ? renderPrayerListCard(_timings, orgName, prayerState)
        : renderPrayerCard(_timings, orgName, prayerState);
}

/**
 * Binds event listeners for the schedule section:
 * view toggle buttons, org toggle, and kiblat navigation.
 */
function bindScheduleEvents() {
    document.getElementById('home-view-tube')?.addEventListener('click', () => switchView(VIEW_TUBE));
    document.getElementById('home-view-list')?.addEventListener('click', () => switchView(VIEW_LIST));
    bindViewSpecificEvents();
}

/**
 * Binds event listeners that are specific to the current view content.
 * Called after initial render and after view switches.
 */
function bindViewSpecificEvents() {
    document.getElementById('org-toggle')?.addEventListener('click', handleOrgToggle);
    document.getElementById('home-btn-kiblat')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="compass"]')?.click();
    });
}

/**
 * Switches between tube and list view modes with a smooth fade animation.
 * Only re-renders the schedule wrapper, preserving the countdown timer.
 * @param {string} mode - VIEW_TUBE or VIEW_LIST
 */
async function switchView(mode) {
    if (mode === _viewMode) return;

    const wrapper = document.getElementById('home-schedule-wrapper');
    if (!wrapper || !_timings) return;

    _viewMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);

    // Update toggle button active states
    document.getElementById('home-view-tube')?.classList.toggle('active', mode === VIEW_TUBE);
    document.getElementById('home-view-list')?.classList.toggle('active', mode === VIEW_LIST);

    // Fade out
    wrapper.classList.add('view-fading-out');

    await new Promise(resolve => setTimeout(resolve, FADE_OUT_MS));

    // Swap content
    const prayerState = getCurrentPrayer(_timings);
    const orgName = await getOrgDisplayNameAsync();
    wrapper.innerHTML = renderScheduleView(prayerState, orgName);

    // Fade in
    wrapper.classList.remove('view-fading-out');
    wrapper.classList.add('view-fading-in');
    wrapper.addEventListener('animationend', () => {
        wrapper.classList.remove('view-fading-in');
    }, { once: true });

    // Re-bind events for the new content
    bindViewSpecificEvents();
    await initMapIfListView();
}

/**
 * Updates the list view column highlights when a prayer transition occurs.
 * Avoids full re-render — just toggles CSS classes on existing columns.
 * @param {object} prayerState - Current prayer state from getCurrentPrayer()
 */
function updateListHighlights(prayerState) {
    const cols = document.querySelectorAll('.prayer-list-col');
    const activeKey = prayerState.current?.key;
    const keys = ['subuh', 'dzuhur', 'ashar', 'magrib', 'isya'];

    cols.forEach((col, i) => {
        col.classList.toggle('prayer-list-col--active', keys[i] === activeKey);
    });
}

/* --- QIBLA MAP --- */

/**
 * Lazily initialise the Qibla map if the list view is active
 * and a location is available.
 */
async function initMapIfListView() {
    if (_viewMode !== VIEW_LIST || !_location) return;

    // Dynamic import to avoid loading Leaflet unless needed
    const { initQiblaMapCard } = await import('../components/card/qibla-map-card.js');
    await import('../../css/components/card/qibla-map-card.css');

    await initQiblaMapCard(getHomeMapId(), _location.latitude, _location.longitude);
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
            showLocationSearchModal({
                onLocationSelected: async (location) => {
                    _location = location;
                    try {
                        _timings = await getPrayerTimesByCoords(location.latitude, location.longitude);
                    } catch { /* handled in renderContent */ }
                    await renderContent();
                },
            });
        },
    });
}

/**
 * Switches the organizational source for fetching timings
 * (e.g. between Kemenag and Muhammadiyah or NU), then re-renders
 * content so prayer times reflect the new org.
 */
async function handleOrgToggle() {
    const labelId = _viewMode === VIEW_LIST ? 'org-toggle-label' : 'org-label';
    await handleOrgToggleShared(labelId, async () => {
        if (_location) {
            try {
                _timings = await getPrayerTimesByCoords(_location.latitude, _location.longitude);
            } catch { /* handled in renderContent */ }
            stopCountdown();
            await renderContent();
        }
    });
}
