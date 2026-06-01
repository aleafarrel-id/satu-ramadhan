import { store } from '../core/store.js';
import { getPrayerTimesByCoords } from '../core/api.js';

import { getCurrentPrayer } from '../modules/prayer/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/schedule/countdown.js';
import { getOrgDisplayNameAsync } from '../modules/schedule/ramadhan.js';


import { renderPrayerCard, updatePrayerCardFills, updatePrayerCardDynamicUI } from '../components/card/prayer-card.js';
import { renderPrayerListCard, renderTabletMosqueCard, renderTabletQiblaCard, renderTabletFullListCard, getHomeMapId, updateTabletMosqueImage } from '../components/card/prayer-list.js';
import { renderLocationCard as renderLocationCardShared, bindLocationCardEvents } from '../components/card/location-card.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { handleOrgToggle as handleOrgToggleShared } from '../components/prayer/prayer-widgets.js';
import { renderHomeSkeleton } from '../components/skeleton/skeleton-home.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { renderCountdownCard } from '../components/card/countdown-card.js';
import { renderShortcutCard } from '../components/card/shortcut-card.js';
import * as router from '../router.js';
import { t, loadNS } from '../core/i18n.js';

import { safeClear } from '../utils/dom-utils.js';

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
let _mediaQueryList = null;

/**
 * Monotonic render generation counter.
 * Incremented on each render() and destroy() call. Async operations
 * capture this value at their start and compare via _isStale(gen)
 * to determine if they have been superseded.
 */
let _renderGen = 0;

/** @param {number} gen */
function _isStale(gen) { return gen !== _renderGen; }

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
    const gen = ++_renderGen;
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
    await loadNS('components/card/shortcut-card');
    if (_isStale(gen)) return;

    safeClear(container);
    renderSkeleton(null);

    if (options.refresh) {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (_isStale(gen)) return;
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
        if (_isStale(gen)) return;
        await renderContent();
    } else {
        showLocationModalForHome();
    }

    if (_isStale(gen)) return;

    if (!_mediaQueryList) {
        _mediaQueryList = window.matchMedia('(min-width: 600px)');
        _mediaQueryList.addEventListener('change', _handleMediaChange);
    }

    _unsubscribe.push(store.subscribe('location', _rehydrateAndRender));
    _unsubscribe.push(store.subscribe('settings.org', _rehydrateAndRender));
}

/**
 * Halts the active countdown timer, unsubscribes from Global Store,
 * and nullifies module variables to prevent memory leaks during page navigation.
 */
export function destroy() {
    ++_renderGen;
    stopCountdown();
    _unsubscribe.forEach(id => store.unsubscribe(id));
    _unsubscribe = [];
    if (_mediaQueryList) {
        _mediaQueryList.removeEventListener('change', _handleMediaChange);
        _mediaQueryList = null;
    }
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
    const gen = _renderGen;
    if (!_container) return;
    const loc = store.getState('location');
    if (!loc) return;
    try {
        _timings = await getPrayerTimesByCoords(loc.latitude, loc.longitude);
    } catch { /* handled in renderContent */ }
    if (_isStale(gen)) return;
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

                // Update list view highlights AND tablet full list highlights
                updateListHighlights(currentState);

                // Update tablet/foldable dynamic mosque background
                updateTabletMosqueImage(currentState);
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
    const gen = _renderGen;
    let contentHtml = '';
    const loc = store.getState('location');

    // Hoist to function scope so tablet components always have access.
    let prayerState = null;
    let orgName = null;

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
                id: 'home-btn-retry',
            },
            secondaryAction: {
                label: t('pages/home-page:btn_change_location_offline'),
                icon: 'bx-search',
                id: 'home-btn-manual-search',
            },
            compact: true,
        };

        contentHtml = renderEmptyState(emptyStateProps);
    } else {
        prayerState = getCurrentPrayer(_timings);
        orgName = await getOrgDisplayNameAsync();
        if (_isStale(gen)) return;

        const tubeActive = _viewMode === VIEW_TUBE ? ' active' : '';
        const listActive = _viewMode === VIEW_LIST ? ' active' : '';
        const savedCarouselIndex = store.getState('home.carouselIndex') ?? 0;

        contentHtml = `
            <div class="top-carousel-wrapper">
                <div class="top-carousel" id="home-top-carousel">
                    <div class="carousel-slide">
                        ${renderCountdownCard(prayerState)}
                    </div>
                    <div class="carousel-slide">
                        ${renderShortcutCard()}
                    </div>
                </div>
                <div class="carousel-dots-container">
                    <button class="carousel-nav-btn carousel-nav-btn--prev" id="home-carousel-prev" type="button" aria-label="${t('common:prev', { defaultValue: 'Sebelumnya' })}">
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <div class="carousel-dots" id="home-carousel-dots">
                        <span class="carousel-dot${savedCarouselIndex === 0 ? ' active' : ''}" data-index="0"></span>
                        <span class="carousel-dot${savedCarouselIndex === 1 ? ' active' : ''}" data-index="1"></span>
                    </div>
                    <button class="carousel-nav-btn carousel-nav-btn--next visible" id="home-carousel-next" type="button" aria-label="${t('common:next', { defaultValue: 'Berikutnya' })}">
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
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

    // Bento layout: right block gets the Qibla map, bottom block gets the Mosque Hero + Full List.
    const bentoRightHtml = (_timings && prayerState)
        ? `<div class="home-bento-right">${renderTabletQiblaCard()}</div>`
        : '';

    const bentoBotHtml = (_timings && prayerState)
        ? `<div class="home-bento-bottom">
               ${renderTabletMosqueCard(_timings, orgName, prayerState)}
               <div class="card card--container tablet-full-grid-wrapper">
                   ${renderTabletFullListCard(_timings, prayerState)}
               </div>
           </div>`
        : '';

    wrapper.innerHTML = `
        <div class="home-bento-grid">
            <!-- Left column: Location card + carousel (all viewports) -->
            <div class="home-bento-left">
                ${renderLocationCardShared(loc)}
                ${contentHtml}
            </div>
            <!-- Right column: Mosque card with prayer widgets (tablet/foldable only) -->
            ${bentoRightHtml}
            <!-- Bottom row: Full 7-time prayer list (tablet/foldable only) -->
            ${bentoBotHtml}
        </div>
    `;

    // Append all internal elements of the wrapper to the container
    while (wrapper.firstChild) {
        _container.appendChild(wrapper.firstChild);
    }

    bindLocationCardEvents(showLocationModalForHome, _container);
    bindScheduleEvents();
    bindCarouselEvents();

    // Bind empty-state retry/search buttons (only present when _timings is null)
    _container.querySelector('#home-btn-retry')?.addEventListener('click', () => location.reload());
    _container.querySelector('#home-btn-manual-search')?.addEventListener('click', () => {
        showLocationSearchModal({
            onLocationSelected: (loc) => {
                store.setState('location', loc);
            },
        });
    });

    if (_timings) {
        startCountdownTimer();
        await initMapIfListView();
        await initMapForTablet();
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
 * Binds event listeners for the native scroll snap carousel.
 * Persists the active slide index to the store and updates UI indicators.
 */
function bindCarouselEvents() {
    const carouselWrapper = document.getElementById('home-top-carousel');
    const dotsContainer = document.getElementById('home-carousel-dots');
    const btnPrev = document.getElementById('home-carousel-prev');
    const btnNext = document.getElementById('home-carousel-next');

    if (!carouselWrapper || !dotsContainer) return;

    const dots = dotsContainer.querySelectorAll('.carousel-dot');
    const totalSlides = dots.length;

    /** Update dot indicators and arrows to match the currently visible slide. */
    function _syncNav(index) {
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        if (btnPrev) btnPrev.classList.toggle('visible', index > 0);
        if (btnNext) btnNext.classList.toggle('visible', index < totalSlides - 1);
    }

    // Update state and UI on scroll
    carouselWrapper.addEventListener('scroll', () => {
        const index = Math.round(carouselWrapper.scrollLeft / carouselWrapper.clientWidth);
        _syncNav(index);
        store.setState('home.carouselIndex', index);
    }, { passive: true });

    // Event delegation for the carousel wrapper (Navigation + Shortcuts)
    carouselWrapper.parentElement.addEventListener('click', (e) => {
        // Arrows
        const btn = e.target.closest('.carousel-nav-btn');
        if (btn) {
            const index = store.getState('home.carouselIndex') ?? 0;
            const direction = btn.classList.contains('carousel-nav-btn--prev') ? -1 : 1;
            const nextIndex = Math.max(0, Math.min(totalSlides - 1, index + direction));
            
            carouselWrapper.scrollTo({
                left: nextIndex * carouselWrapper.clientWidth,
                behavior: 'smooth'
            });
            return;
        }

        // Shortcuts (Delegation fixes ID collision issues)
        const shortcutBtn = e.target.closest('.shortcut-card__item');
        if (shortcutBtn) {
            const id = shortcutBtn.id.replace('shortcut-', '');
            _handleShortcut(id);
        }
    });

    // Initial sync
    const savedIndex = store.getState('home.carouselIndex') ?? 0;
    _syncNav(savedIndex);

    if (savedIndex > 0) {
        requestAnimationFrame(() => {
            const slides = carouselWrapper.querySelectorAll('.carousel-slide');
            const targetSlide = slides[savedIndex];
            if (!targetSlide) return;
            const containerRect = carouselWrapper.getBoundingClientRect();
            const slideRect = targetSlide.getBoundingClientRect();
            carouselWrapper.style.scrollBehavior = 'auto';
            carouselWrapper.scrollLeft = carouselWrapper.scrollLeft + (slideRect.left - containerRect.left);
            requestAnimationFrame(() => { carouselWrapper.style.scrollBehavior = ''; });
        });
    }
}

/**
 * Binds event listeners that are specific to the current view content.
 */
function bindViewSpecificEvents() {
    document.getElementById('org-toggle')?.addEventListener('click', () => handleOrgToggle('org-toggle-label'));
    document.getElementById('org-toggle-tablet')?.addEventListener('click', () => handleOrgToggle('org-toggle-tablet-label'));

    const goToCompass = () => router.navigate('compass');
    document.getElementById('home-btn-kiblat')?.addEventListener('click', goToCompass);
    document.getElementById('home-btn-kiblat-tablet')?.addEventListener('click', goToCompass);
}

/**
 * Internal handler for shortcut actions.
 * @param {string} id - Shortcut menu ID
 */
function _handleShortcut(id) {
    const handlers = {
        'tasbih': () => import('./tasbih-page.js').then(m => m.open()),
        'surah': () => {
            sessionStorage.setItem('quran_tab', 'surah');
            router.navigate('quran');
        },
        'juz': () => {
            sessionStorage.setItem('quran_tab', 'juz');
            router.navigate('quran');
        },
        'mushaf': () => {
            sessionStorage.setItem('quran_tab', 'mushaf');
            router.navigate('quran');
        },
        'kiblat': () => {
            router.navigate('compass');
        }
    };
    handlers[id]?.();
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

    cols.forEach(col => {
        const key = col.dataset.prayer;
        if (key) {
            col.classList.toggle('prayer-list-col--active', key === activeKey);
        }
    });
}

/* --- QIBLA MAP --- */

/**
 * Lazily initialise the Qibla map when the mobile list view is active.
 */
async function initMapIfListView() {
    const loc = store.getState('location');
    if (_viewMode !== VIEW_LIST || !loc) return;

    const { initQiblaMapCard } = await import('../components/card/qibla-map-card.js');
    await import('../../css/components/card/qibla-map-card.css');

    await initQiblaMapCard(getHomeMapId(), loc.latitude, loc.longitude);
}

/**
 * Lazily initialise the Qibla map for the permanent tablet bento list.
 * Only loads the heavy Leaflet dependency on viewports >= 600px.
 */
async function initMapForTablet() {
    const loc = store.getState('location');
    if (!loc || window.innerWidth < 600) return;

    const { initQiblaMapCard } = await import('../components/card/qibla-map-card.js');
    await import('../../css/components/card/qibla-map-card.css');
    await initQiblaMapCard(getHomeMapId() + '-tablet', loc.latitude, loc.longitude);
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
async function handleOrgToggle(labelIdOverride = null) {
    const labelId = labelIdOverride || (_viewMode === VIEW_LIST ? 'org-toggle-label' : 'org-label');
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

/**
 * Handle screen size changes to initialize/transplant the map layout dynamically.
 */
async function _handleMediaChange(e) {
    if (!_timings) return;
    if (e.matches) {
        await initMapForTablet();
    } else {
        await initMapIfListView();
    }
}
