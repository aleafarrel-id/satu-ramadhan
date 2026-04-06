import { store } from '../core/store.js';
import { getPrayerTimesByCoords } from '../core/api.js';

import { getCurrentPrayer } from '../modules/prayer/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/schedule/countdown.js';
import { getOrgDisplayNameAsync } from '../modules/schedule/ramadhan.js';


import { renderPrayerCard, updatePrayerCardFills, updatePrayerCardDynamicUI } from '../components/card/prayer-card.js';
import { renderPrayerListCard, getHomeMapId } from '../components/card/prayer-list.js';
import { renderLocationCard as renderLocationCardShared, bindLocationCardEvents } from '../components/card/location-card.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { handleOrgToggle as handleOrgToggleShared } from '../components/prayer/prayer-widgets.js';
import { renderHomeSkeleton } from '../components/skeleton/skeleton-home.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { renderCountdownCard } from '../components/card/countdown-card.js';
import { t, loadNS } from '../core/i18n.js';

import { safeClear } from '../utils/dom-utils.js';
import { LIST_PRAYER_KEYS } from '../utils/datetime.js';

/* --- CONSTANTS --- */
const VIEW_TUBE = 'tube';
const VIEW_LIST = 'list';
const FADE_OUT_MS = 200;

/* --- STATE --- */
let _container = null;
let _timings = null;
let _lastPrayerIndex = -1;
let _viewMode = VIEW_TUBE;
let _unsubscribe = [];

/* --- LIFECYCLE --- */

/**
 * Initializes and renders the home page.
 * Displays a skeleton UI initially, then retrieves prayer timings and renders content.
 * Automatically refreshes seamlessly via Global Store subscriptions.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 * @param {Object} [options={}] - Navigation options (e.g., refresh: true)
 */
export async function render(container, options = {}) {
    _container = container;

    if (_unsubscribe.length > 0) {
        _unsubscribe.forEach(id => store.unsubscribe(id));
    }
    _unsubscribe = [];

    await loadNS('pages/home-page');
    await loadNS('components/card/location-card');
    await loadNS('components/card/countdown-card');
    await loadNS('modules/prayer/prayer-times');
    await loadNS('components/prayer/prayer-widgets');
    await loadNS('components/card/qibla-map-card');

    safeClear(container);
    renderSkeleton(null);

    if (options.refresh) {
        await new Promise(resolve => setTimeout(resolve, 350));
    }

    _viewMode = store.getState('home.viewMode');
    if (_viewMode !== VIEW_TUBE && _viewMode !== VIEW_LIST) {
        _viewMode = VIEW_TUBE;
    }
    const loc = store.getState('location');

    if (loc) {
        try {
            _timings = await getPrayerTimesByCoords(loc.latitude, loc.longitude);
        } catch { /* handled gracefully in renderContent */ }
        await renderContent();
    } else {
        showLocationModalForHome();
    }

    _unsubscribe.push(store.subscribe('location', _rehydrateAndRender));
    _unsubscribe.push(store.subscribe('settings.org', _rehydrateAndRender));
}

/**
 * Halts the active countdown timer, unsubscribes from Global Store,
 * and nullifies module variables to prevent memory leaks during page navigation.
 */
export function destroy() {
    stopCountdown();
    _unsubscribe.forEach(id => store.unsubscribe(id));
    _unsubscribe = [];
    _container = null;
    _timings = null;
}

/**
 * Getter for current prayer timings.
 * @returns {object|null} Current prayer timings or null if not loaded
 */
export function getTimings() {
    return _timings;
}

/**
 * Re-render the home content autonomously when store triggers changes.
 */
async function _rehydrateAndRender() {
    if (!_container) return;
    const loc = store.getState('location');
    if (!loc) return;
    try {
        _timings = await getPrayerTimesByCoords(loc.latitude, loc.longitude);
    } catch { /* handled in renderContent */ }
    stopCountdown();
    await renderContent();
}

/* --- INITIALIZATION --- */

/**
 * Starts the global countdown timer for the next prayer.
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
 */
function renderSkeleton(location) {
    renderHomeSkeleton(_container, location, showLocationModalForHome);
}

/**
 * Evaluates the current state strings and renders the main content.
 */
async function renderContent() {
    let contentHtml = '';
    const loc = store.getState('location');

    if (!_timings) {
        const emptyStateProps = !loc ? {
            icon: 'bx-map-pin',
            title: t('pages/home-page:error_no_location_title'),
            description: t('pages/home-page:error_no_location_desc'),
            compact: true,
        } : {
            icon: 'bx-wifi-off',
            iconVariant: 'warning',
            title: t('pages/home-page:error_offline_title'),
            description: t('pages/home-page:error_offline_desc'),
            action: {
                label: t('retry'),
                icon: 'bx-refresh',
                onclick: 'location.reload()',
            },
            secondaryAction: {
                label: t('pages/home-page:btn_change_location_offline'),
                icon: 'bx-search',
                onclick: '_homeShowManualSearch()',
            },
            compact: true,
        };

        // Expose helper to global scope for the inline onclick handler
        if (!window._homeShowManualSearch) {
            window._homeShowManualSearch = () => {
                showLocationSearchModal({
                    onLocationSelected: (location) => {
                        store.setState('location', location);
                    },
                });
            };
        }

        contentHtml = renderEmptyState(emptyStateProps);
    } else {
        const prayerState = getCurrentPrayer(_timings);
        const orgName = await getOrgDisplayNameAsync();

        const tubeActive = _viewMode === VIEW_TUBE ? ' active' : '';
        const listActive = _viewMode === VIEW_LIST ? ' active' : '';

        contentHtml = `
            ${renderCountdownCard(prayerState)}
            <div class="home-schedule-header">
                <div class="schedule-title">${t('pages/home-page:schedule_today')}</div>
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
        ${renderLocationCardShared(loc)}
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
        await initMapIfListView();
    }
}

/**
 * Renders the schedule view content based on current _viewMode.
 */
function renderScheduleView(prayerState, orgName) {
    return _viewMode === VIEW_LIST
        ? renderPrayerListCard(_timings, orgName, prayerState)
        : renderPrayerCard(_timings, orgName, prayerState);
}

/**
 * Binds event listeners for the schedule section.
 */
function bindScheduleEvents() {
    document.getElementById('home-view-tube')?.addEventListener('click', () => switchView(VIEW_TUBE));
    document.getElementById('home-view-list')?.addEventListener('click', () => switchView(VIEW_LIST));
    bindViewSpecificEvents();
}

/**
 * Binds event listeners that are specific to the current view content.
 */
function bindViewSpecificEvents() {
    document.getElementById('org-toggle')?.addEventListener('click', handleOrgToggle);
    document.getElementById('home-btn-kiblat')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="compass"]')?.click();
    });
}

/**
 * Switches between tube and list view modes.
 */
async function switchView(mode) {
    if (mode === _viewMode) return;

    const wrapper = document.getElementById('home-schedule-wrapper');
    if (!wrapper || !_timings) return;

    _viewMode = mode;
    store.setState('home.viewMode', mode);

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
 * Updates the list view column highlights.
 */
function updateListHighlights(prayerState) {
    const cols = document.querySelectorAll('.prayer-list-col');
    const activeKey = prayerState.current?.key;
    const keys = LIST_PRAYER_KEYS;

    cols.forEach((col, i) => {
        col.classList.toggle('prayer-list-col--active', keys[i] === activeKey);
    });
}

/* --- QIBLA MAP --- */

/**
 * Lazily initialise the Qibla map if the list view is active.
 */
async function initMapIfListView() {
    const loc = store.getState('location');
    if (_viewMode !== VIEW_LIST || !loc) return;

    // Dynamic import to avoid loading Leaflet unless needed
    const { initQiblaMapCard } = await import('../components/card/qibla-map-card.js');
    await import('../../css/components/card/qibla-map-card.css');

    await initQiblaMapCard(getHomeMapId(), loc.latitude, loc.longitude);
}


/* --- EVENT HANDLERS --- */

/**
 * Triggers the geographic selection modal directly from the home interface.
 * No UI re-render happens here natively; the Store Observer picks up the state
 * mutation and refreshes automatically!
 */
function showLocationModalForHome() {
    showLocationModal({
        onLocationDetected: (location) => {
            store.setState('location', location);
        },
        onManualSelect: () => {
            showLocationSearchModal({
                onLocationSelected: (location) => {
                    store.setState('location', location);
                },
            });
        },
    });
}

/**
 * Switches the organizational source for fetching timings.
 */
async function handleOrgToggle() {
    const labelId = _viewMode === VIEW_LIST ? 'org-toggle-label' : 'org-label';
    await handleOrgToggleShared(labelId, async () => {
        const loc = store.getState('location');
        if (loc) {
            try {
                _timings = await getPrayerTimesByCoords(loc.latitude, loc.longitude);
            } catch { /* handled in renderContent */ }
            stopCountdown();
            await renderContent();
        }
    });
}
