/* Lazy-loaded CSS — only fetched when this page module is imported */
import '../../css/pages/schedule.css';
import '../../css/components/card/share-schedule-card.css';
import '../../css/components/modal/calendar-modal.css';
import '../../css/components/modal/date-picker-modal.css';
import '../../css/components/modal/share-schedule-modal.css';
import '../../css/components/modal/confirm-modal.css';
import '../../css/components/modal/preset-manager-modal.css';

import { isNative } from '../modules/system/platform.js';

import { getPrayerTimesByCoords, getQiblaDirection } from '../core/api.js';
import { store } from '../core/store.js';

import { getOrgDisplayNameAsync } from '../modules/schedule/ramadhan.js';
import { fetchScheduleData, findTodayIndex, isToday, getTodayDateStr } from '../modules/schedule/schedule-data.js';
import { onPrayerChange, offPrayerChange } from '../modules/prayer/prayer-watcher.js';
import { getCurrentPrayer, getPrayerName } from '../modules/prayer/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/schedule/countdown.js';
import * as notification from '../modules/notification/notification.js';
import * as router from '../router.js';

import {
    renderScheduleCard,
    renderScheduleCardBottomSkeleton,
    updateScheduleContent,
    updateScheduleHighlights,
    updateScheduleFeaturedCard,
    getActivePrayerKey,
} from '../components/card/schedule-card.js';
import { renderLocationCard, bindLocationCardEvents } from '../components/card/location-card.js';
import { renderCountdownCardSchedule } from '../components/card/countdown-card.js';
import { renderShortcutCard } from '../components/card/shortcut-card.js';
import {
    renderScheduleTabletMosqueCard,
    updateScheduleTabletMosqueImage,
    renderScheduleTabletQiblaCard,
} from '../components/card/prayer-list.js';
import { renderKiblatButton, renderOrgToggle, handleOrgToggle } from '../components/prayer/prayer-widgets.js';
import { renderShareScheduleCard, bindShareScheduleCardEvents } from '../components/card/share-schedule-card.js';
import { renderScheduleSkeleton } from '../components/skeleton/skeleton-schedule.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { showCalendarModal } from '../components/modal/calendar-modal.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { showShareScheduleModal } from '../components/modal/share-schedule-modal.js';
import { downloadScheduleImage, shareScheduleImage } from '../modules/share/share-schedule-exporter.js';
import { bindSwipeEvents, unbindSwipeEvents } from '../components/schedule/schedule-swipe.js';
import { ensureStoragePermission } from '../modules/permission/permission-dialog-configs.js';

import { logError } from '../utils/error-boundary.js';
import { makeAccessibleBtn } from '../utils/a11y.js';
import { safeClear } from '../utils/dom-utils.js';
import { t, loadNS } from '../core/i18n.js';

/* --- STATE --- */

let _container = null;
let _scheduleData = null;
let _currentDayIndex = 0;
let _todayTimings = null;
let _cachedDepStr = null;

let _dayCheckInterval = null;
let _lastDateStr = null;
let _unsubscribe = [];
let _mediaQueryList = null;

let _animPhase = 'idle';
let _animDirection = null;
let _animId = 0;

/**
 * Monotonic render generation counter.
 * Incremented on each render() and destroy() call.
 * Async operations capture this value at their start and compare later
 * to determine if they have been superseded — a single, centralized
 * mechanism that replaces scattered null-checks throughout the module.
 */
let _renderGen = 0;

/**
 * Returns true if the given generation has been superseded by a newer
 * render() or destroy() cycle. Used as a unified async guard.
 * @param {number} gen - The generation captured at the start of the operation.
 * @returns {boolean}
 */
function _isStale(gen) {
    return gen !== _renderGen;
}

/* --- LIFECYCLE --- */

/**
 * Bootstraps and constructs the single-day 30 format UI.
 * Connects the daily location API payload and bridges user's daily data.
 *
 * @param {HTMLElement} container - Active DOM payload to render upon.
 * @param {Object} [options={}] - Navigation options (e.g., refresh: true)
 */
export async function render(container, options = {}) {
    const gen = ++_renderGen;
    _container = container;

    if (_unsubscribe.length > 0) {
        _unsubscribe.forEach(id => store.unsubscribe(id));
    }
    _unsubscribe = [];

    await loadNS('pages/schedule-page');
    await loadNS('components/card/location-card');
    await loadNS('components/card/schedule-card');
    await loadNS('components/card/share-schedule-card');
    await loadNS('components/card/countdown-card');
    await loadNS('components/card/shortcut-card');
    await loadNS('modules/prayer/prayer-times');
    await loadNS('components/prayer/prayer-widgets');
    await loadNS('components/card/qibla-map-card');
    await loadNS('components/ui/header');
    await loadNS('components/modal/location-modal');
    await loadNS('modules/share/share-schedule-exporter');
    if (_isStale(gen)) return;

    const location = store.getState('location');
    const org = store.getState('settings.org');

    const currentDepStr = location ? `${location.latitude}_${location.longitude}_${org}` : null;

    if (!location) {
        safeClear(container);
        renderScheduleSkeleton(_container, null, showLocationModalForSchedule);
        await renderError(false);
    } else {
        const isRefresh = options?.refresh === true;
        const isStale = _cachedDepStr !== currentDepStr;

        if (!isRefresh && !isStale && _scheduleData && _todayTimings) {
            _currentDayIndex = findTodayIndex(_scheduleData);
            await renderDayView();
        } else {
            safeClear(_container);
            renderScheduleSkeleton(_container, location, showLocationModalForSchedule);
            if (isRefresh) {
                await new Promise(resolve => setTimeout(resolve, 350));
                if (_isStale(gen)) return;
            }
            await _rehydrateAndRender();
        }
    }

    if (_isStale(gen)) return;

    if (!_mediaQueryList) {
        _mediaQueryList = window.matchMedia('(min-width: 600px)');
        _mediaQueryList.addEventListener('change', _handleMediaChange);
    }

    _unsubscribe.push(store.subscribe('location', () => {
        if (!_container) return;
        renderScheduleSkeleton(_container, store.getState('location'), showLocationModalForSchedule);
        _rehydrateAndRender();
    }));

    // Org change
    _unsubscribe.push(store.subscribe('settings.org', () => {
        if (!_container) return;
        _recomputeSchedule();
    }));
}

/**
 * Nullifies swipe thresholds alongside 30-day timeline objects
 * stopping async loop intervals and destroying handlers.
 */
export function destroy() {
    ++_renderGen;
    stopCountdown();
    stopDayCrossingCheck();
    offPrayerChange(handlePrayerTransition);
    unbindSwipeEvents();
    _unsubscribe.forEach(id => store.unsubscribe(id));
    _unsubscribe = [];
    if (_mediaQueryList) {
        _mediaQueryList.removeEventListener('change', _handleMediaChange);
        _mediaQueryList = null;
    }
    _container = null;
}

/**
 * Re-fetch schedule data and re-render after preset changes.
 * Exported so other modules (settings) can trigger a refresh.
 */
export async function refreshScheduleData() {
    if (!_container) return;
    renderScheduleSkeleton(_container, store.getState('location'), showLocationModalForSchedule);
    await _rehydrateAndRender();
}

/**
 * Full data re-fetch: both schedule data AND today's prayer timings.
 * Used when location changes (genuinely new API data needed).
 */
async function _rehydrateAndRender() {
    const gen = _renderGen;
    if (!_container) return;
    const location = store.getState('location');
    const org = store.getState('settings.org');
    if (!location) return;

    try {
        const [scheduleResult, todayTimingsResult] = await Promise.all([
            fetchScheduleData(location),
            getPrayerTimesByCoords(location.latitude, location.longitude).catch(() => null),
        ]);
        if (_isStale(gen)) return;

        _scheduleData = scheduleResult;
        _todayTimings = todayTimingsResult;
        _cachedDepStr = `${location.latitude}_${location.longitude}_${org}`;

        if (!_scheduleData) {
            await renderError(true);
            return;
        }

        _currentDayIndex = findTodayIndex(_scheduleData);
        await renderDayView();
    } catch (error) {
        logError('[Schedule]', error);
        if (_isStale(gen)) return;
        await renderError(true);
    }
}

/**
 * Org-only re-compute: re-builds schedule date boundaries from the new
 * active preset, but does NOT re-fetch today's prayer timings (_todayTimings)
 * since those depend only on location (unchanged).
 *
 * fetchScheduleData() internally calls getMonthlyPrayerTimes() which is
 * cached by location+month — zero network hit when only the org changes.
 */
async function _recomputeSchedule() {
    const gen = _renderGen;
    if (!_container) return;
    const location = store.getState('location');
    const org = store.getState('settings.org');
    if (!location) return;

    try {
        const scheduleResult = await fetchScheduleData(location);
        if (_isStale(gen)) return;

        _scheduleData = scheduleResult;
        _cachedDepStr = `${location.latitude}_${location.longitude}_${org}`;

        if (!_scheduleData) {
            await renderError(true);
            return;
        }

        _currentDayIndex = findTodayIndex(_scheduleData);
        await renderDayView();
    } catch (error) {
        logError('[Schedule]', error);
        if (_isStale(gen)) return;
        await renderError(true);
    }
}

/* --- INITIALIZATION --- */

/**
 * Subscribe to prayer-watcher for instant prayer transition events.
 * This replaces the old 30s polling — highlights update immediately.
 */
function subscribePrayerWatcher() {
    onPrayerChange(handlePrayerTransition);
}

/**
 * Called instantly by prayer-watcher when a prayer transition occurs.
 * Updates highlights and featured card without any delay.
 */
function handlePrayerTransition() {
    if (!_container || !_scheduleData) return;

    if (_todayTimings) {
        updateScheduleFeaturedCard(_todayTimings);
        const currentState = getCurrentPrayer(_todayTimings);
        updateScheduleTabletMosqueImage(currentState);

        // Update the countdown card's prayer name label
        const cdNameEl = document.getElementById('cd-prayer-name');
        if (cdNameEl) {
            cdNameEl.textContent = currentState.next ? getPrayerName(currentState.next.key) : '--';
        }
    }

    const entry = _scheduleData[_currentDayIndex];
    if (!entry || !isToday(entry.date)) return;

    const newActivePrayerKey = getActivePrayerKey(entry.timings);
    updateScheduleHighlights(newActivePrayerKey, _container);
}

/**
 * Start a lightweight interval to detect day crossings (midnight).
 * Only checks date string — not prayer state (handled by watcher).
 */
function startDayCrossingCheck() {
    stopDayCrossingCheck();

    _dayCheckInterval = setInterval(() => {
        if (!_container || !_scheduleData) return;

        const currentDateStr = getTodayDateStr();
        if (_lastDateStr !== currentDateStr) {
            _lastDateStr = currentDateStr;

            _scheduleData.forEach(entry => {
                entry.isToday = isToday(entry.date);
            });

            _currentDayIndex = findTodayIndex(_scheduleData);
            renderDayView();
        }
    }, 60_000);
}

/**
 * Disposes the day-crossing interval timer.
 */
function stopDayCrossingCheck() {
    if (_dayCheckInterval) {
        clearInterval(_dayCheckInterval);
        _dayCheckInterval = null;
    }
}

/* --- RENDER METHODS --- */

/**
 * Renders prominent fault-tolerances when the API or user configurations
 * fallback against missing location tracking or severed internet sockets.
 *
 * @param {boolean} hasLocation - Deciphers which warning layout to mount.
 */
async function renderError(hasLocation) {
    if (!_container) return;

    if (!hasLocation) {
        _container.innerHTML = `
            ${renderLocationCard(null)}
            ${renderEmptyState({
            icon: 'bx-map-pin',
            title: t('pages/schedule-page:error_no_location_title'),
            description: t('pages/schedule-page:error_no_location_desc'),
            compact: true,
        })}
            <div class="schedule-skeleton-placeholder" style="margin-top: var(--spacing-lg); pointer-events: none;">
                ${renderScheduleCardBottomSkeleton()}
            </div>
        `;
        bindLocationCardEvents(showLocationModalForSchedule, _container);
        return;
    }

    const icon = 'bx-wifi-off';
    const title = t('pages/schedule-page:error_offline_title');
    const desc = t('pages/schedule-page:error_offline_desc');

    _container.innerHTML = `
        <div class="schedule-page">
            ${renderEmptyState({
        icon,
        iconVariant: 'warning',
        title,
        description: desc,
        action: {
            label: t('retry'),
            icon: 'bx-refresh',
            id: 'schedule-btn-retry',
        },
        compact: true,
    })}
        </div>
    `;

    _container.querySelector('#schedule-btn-retry')?.addEventListener('click', () => location.reload());
}

/**
 * Opens the location selection modal tailored for the schedule page's empty state.
 */
function showLocationModalForSchedule() {
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
 * Computes and renders the centralized DOM structure dictating the sweeping
 * timeline views combining navbar elements with native widget handlers.
 */
async function renderDayView() {
    const gen = _renderGen;
    if (!_scheduleData || !_scheduleData[_currentDayIndex]) return;

    const entry = _scheduleData[_currentDayIndex];
    const orgName = await getOrgDisplayNameAsync();
    if (_isStale(gen)) return;

    const loc = store.getState('location');
    const scheduleCardHtml = renderScheduleCard(entry, orgName, _todayTimings, _currentDayIndex, _scheduleData.length);

    // Build tablet bento panels — only rendered when timings are available
    const prayerState = _todayTimings ? getCurrentPrayer(_todayTimings) : null;
    const savedCarouselIndex = store.getState('schedule.carouselIndex') ?? 0;

    const bentoCarouselHtml = (_todayTimings && prayerState) ? `
        <div class="top-carousel-wrapper">
            <div class="top-carousel" id="sched-top-carousel">
                <div class="carousel-slide">${renderCountdownCardSchedule(prayerState)}</div>
                <div class="carousel-slide">${renderShortcutCard()}</div>
            </div>
            <div class="carousel-dots" id="sched-carousel-dots">
                <span class="carousel-dot${savedCarouselIndex === 0 ? ' active' : ''}" data-index="0"></span>
                <span class="carousel-dot${savedCarouselIndex === 1 ? ' active' : ''}" data-index="1"></span>
            </div>
        </div>
    ` : '';


    const bentoRightHtml = `
        <div class="sched-bento-right">
            ${(_todayTimings && prayerState) ? renderScheduleTabletMosqueCard(_todayTimings, prayerState) : ''}
            ${(_todayTimings && prayerState) ? `
            <div class="sched-bento-hero-actions">
                ${renderKiblatButton('sched-btn-kiblat-tablet')}
                ${renderOrgToggle(orgName, 'sched-org-toggle-tablet')}
            </div>` : ''}
            <div class="sched-bento-share-card">
                ${renderShareScheduleCard().replace('id="btn-generate-schedule"', 'id="sched-btn-generate-tablet"')}
            </div>
            ${(_todayTimings && prayerState) ? renderScheduleTabletQiblaCard() : ''}
        </div>
    `;

    _container.innerHTML = `
        <div class="sched-bento-grid">
            <div class="sched-bento-left">
                ${renderLocationCard(loc)}
                ${bentoCarouselHtml}
                ${scheduleCardHtml}
            </div>
            ${bentoRightHtml}
        </div>
    `;

    bindLocationCardEvents(showLocationModalForSchedule, _container);
    bindShareScheduleCardEvents(() => handleShareSchedule(), _container);

    _lastDateStr = getTodayDateStr();

    bindEvents();
    subscribePrayerWatcher();
    startDayCrossingCheck();
    _bindScheduleCarouselEvents();
    _bindScheduleShortcutEvents();
    _bindScheduleTabletEvents(orgName);

    // Bind the tablet generate button
    _container.querySelector('#sched-btn-generate-tablet')?.addEventListener('click', () => {
        handleShareSchedule();
    });

    _startScheduleCountdown();
    await _initScheduleTabletMap();
}

/* --- SHARE SCHEDULE --- */

/**
 * Collect active state data and show the share schedule preview modal.
 * Guard: only callable after _scheduleData is populated.
 *
 * If file-system permission is not yet granted on native,
 * shows an in-app rationale dialog first.
 */
async function handleShareSchedule() {
    if (!_scheduleData) return;

    if (isNative) {
        const hasStorage = await _ensureStoragePermission();
        if (!hasStorage) return;
    }
    await _openShareModal();
}

function _ensureStoragePermission() {
    return ensureStoragePermission('storage');
}

/**
 * Builds the share payload and opens the share schedule modal.
 * Extracted to avoid duplication between direct-grant and dialog-confirm flows.
 */
async function _openShareModal() {
    const location = store.getState('location');
    const orgName = await getOrgDisplayNameAsync();
    const qiblaAngle = location
        ? await getQiblaDirection(location.latitude, location.longitude)
        : null;

    // Extract Hijri metadata from the first schedule entry
    const firstEntry = _scheduleData[0];
    const hijriMonthName = firstEntry?.hijriMonthName || '—';
    const hijriYear = firstEntry?.hijriYear || 0;

    const payload = {
        location,
        orgName,
        qiblaAngle,
        scheduleData: _scheduleData,
        hijriMonthName,
        hijriYear,
    };

    showShareScheduleModal({
        payload,
        onShare: async (canvas) => shareScheduleImage(canvas),
        onDownload: async (canvas) => downloadScheduleImage(canvas),
    });
}

/* --- EVENTS & HANDLERS --- */

/**
 * Establishes centralized interaction layers linking native swipe loops
 * to core navigation patterns alongside dynamic organization modals.
 */
function bindEvents() {
    const lastIndex = _scheduleData ? _scheduleData.length - 1 : 0;

    unbindSwipeEvents();

    document.getElementById('schedule-prev')?.addEventListener('click', () => {
        if (_currentDayIndex > 0) {
            navigateWithAnimation('right');
        }
    });

    document.getElementById('schedule-next')?.addEventListener('click', () => {
        if (_currentDayIndex < lastIndex) {
            navigateWithAnimation('left');
        }
    });

    document.getElementById('schedule-today')?.addEventListener('click', () => {
        const todayIdx = findTodayIndex(_scheduleData);
        if (_currentDayIndex !== todayIdx) {
            const dir = todayIdx > _currentDayIndex ? 'left' : 'right';
            _currentDayIndex = todayIdx;
            animateSlide(dir);
        }
    });

    document.getElementById('schedule-org-toggle')?.addEventListener('click', async () => {
        await handleOrgToggle('schedule-org-toggle-label', async () => { });
    });

    document.getElementById('schedule-btn-kiblat')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="compass"]')?.click();
    });

    makeAccessibleBtn(document.getElementById('btn-calendar-modal'), () => {
        showCalendarModal({
            scheduleData: _scheduleData,
            currentIndex: _currentDayIndex,
            onSelectDay: (newIndex) => {
                if (newIndex === _currentDayIndex) return;
                const dir = newIndex > _currentDayIndex ? 'left' : 'right';
                _currentDayIndex = newIndex;
                animateSlide(dir);
            },
        });
    });

    const swipeArea = document.getElementById('schedule-swipe-area');
    if (swipeArea) {
        swipeArea.addEventListener('click', (e) => {
            const row = e.target.closest('.schedule-prayer-row.clickable');
            if (row) {
                const key = row.getAttribute('data-prayer');
                if (key) {
                    const toggleBtn = row.querySelector('.schedule-prayer-row__adzan-toggle');
                    const currentVal = store.getState('settings.adzanControls.' + key) !== false;
                    const newVal = !currentVal;
                    store.setState('settings.adzanControls.' + key, newVal);

                    // Optimistic UI update
                    if (toggleBtn) {
                        const icon = toggleBtn.querySelector('i');
                        if (icon) {
                            icon.className = newVal ? 'bx bx-volume-full' : 'bx bx-volume-mute';
                        }
                        toggleBtn.classList.toggle('active', newVal);
                    }

                    const prayerName = getPrayerName(key);
                    if (newVal) {
                        notification.info(t('pages/schedule-page:toast_adzan_unmuted', { prayer: prayerName }));
                    } else {
                        notification.info(t('pages/schedule-page:toast_adzan_muted', { prayer: prayerName }));
                    }
                }
            }
        });
    }

    bindSwipeEvents('schedule-swipe-area', handleSwipe);
}

/* --- TABLET / FOLDABLE HELPERS --- */

/**
 * Bind tablet-only action buttons (Kiblat + Org Toggle below hero).
 * @param {string} orgName - current org display name
 */
function _bindScheduleTabletEvents(orgName) {
    document.getElementById('sched-btn-kiblat-tablet')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="compass"]')?.click();
    });

    document.getElementById('sched-org-toggle-tablet')?.addEventListener('click', async () => {
        await handleOrgToggle('sched-org-toggle-tablet-label', async () => { });
    });
}

/**
 * Bind scroll-snap carousel events for the tablet bento carousel.
 * Persists the active slide index to schedule.carouselIndex in store.
 */
function _bindScheduleCarouselEvents() {
    const carouselWrapper = document.getElementById('sched-top-carousel');
    const dots = document.querySelectorAll('#sched-carousel-dots .carousel-dot');

    if (!carouselWrapper || dots.length === 0) return;

    function syncDots(index) {
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    }

    carouselWrapper.addEventListener('scroll', () => {
        const index = Math.round(carouselWrapper.scrollLeft / carouselWrapper.clientWidth);
        syncDots(index);
        store.setState('schedule.carouselIndex', index);
    }, { passive: true });

    const savedIndex = store.getState('schedule.carouselIndex') ?? 0;
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
 * Bind shortcut card navigation buttons for schedule-page context.
 */
function _bindScheduleShortcutEvents() {
    const carouselEl = document.getElementById('sched-top-carousel');
    if (!carouselEl) return;

    const shortcuts = {
        'tasbih': () => import('./tasbih-page.js').then(m => m.open()),
        'surah': () => { sessionStorage.setItem('quran_tab', 'surah'); router.navigate('quran'); },
        'juz': () => { sessionStorage.setItem('quran_tab', 'juz'); router.navigate('quran'); },
        'mushaf': () => { sessionStorage.setItem('quran_tab', 'mushaf'); router.navigate('quran'); },
        'kiblat': () => router.navigate('compass'),
    };

    carouselEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[id^="shortcut-"]');
        if (!btn) return;
        const id = btn.id.replace('shortcut-', '');
        shortcuts[id]?.();
    });
}

/**
 * Start the countdown timer targeting schedule-specific scd-* element IDs.
 */
function _startScheduleCountdown() {
    if (!_todayTimings) return;

    const hoursEl = document.getElementById('scd-hours');
    if (!hoursEl) return;

    const minutesEl = document.getElementById('scd-minutes');
    const secondsEl = document.getElementById('scd-seconds');

    startCountdown(
        ({ hours, minutes, seconds }) => {
            if (!document.getElementById('scd-hours')) {
                stopCountdown();
                return;
            }
            hoursEl.textContent = String(hours);
            minutesEl.textContent = String(minutes).padStart(2, '0');
            secondsEl.textContent = String(seconds).padStart(2, '0');
        },
        () => getCurrentPrayer(_todayTimings).next?.date
    );
}

/**
 * Lazily initialise the Qibla map for the schedule tablet bento slot.
 * Only loads Leaflet on viewports ≥ 600px.
 */
async function _initScheduleTabletMap() {
    const loc = store.getState('location');
    if (!loc || window.innerWidth < 600) return;

    const { initQiblaMapCard } = await import('../components/card/qibla-map-card.js');
    await import('../../css/components/card/qibla-map-card.css');
    await initQiblaMapCard('sched-qibla-map', loc.latitude, loc.longitude);
}

/**
 * Handle viewport changes between foldable and mobile.
 * Re-initialises the map and countdown when expanding to tablet/foldable.
 */
async function _handleMediaChange(e) {
    if (!_todayTimings || !_container) return;
    if (e.matches) {
        await _initScheduleTabletMap();
    }
}

/**
 * Handle swipe gesture direction from the swipe module.
 * Uses dynamic schedule length instead of hardcoded 29.
 * @param {string} direction - 'left' or 'right'
 */
function handleSwipe(direction) {
    const lastIndex = _scheduleData ? _scheduleData.length - 1 : 0;

    if (direction === 'left' && _currentDayIndex < lastIndex) {
        navigateWithAnimation('left');
    } else if (direction === 'right' && _currentDayIndex > 0) {
        navigateWithAnimation('right');
    }
}

/* --- ANIMATION --- */

/**
 * Navigates to the next/previous day with interrupt-safe animation.
 * Uses dynamic schedule length instead of hardcoded bounds.
 *
 * @param {string} direction - Navigational vector mapping next steps.
 */
function navigateWithAnimation(direction) {
    const lastIndex = _scheduleData ? _scheduleData.length - 1 : 0;

    if (direction === 'left' && _currentDayIndex < lastIndex) {
        _currentDayIndex++;
    } else if (direction === 'right' && _currentDayIndex > 0) {
        _currentDayIndex--;
    } else {
        return;
    }

    /* Already sliding out in the same direction: the in-flight onOut handler
       will pick up the updated _currentDayIndex when it fires — no restart needed. */
    if (_animPhase === 'out' && _animDirection === direction) {
        return;
    }

    animateSlide(direction);
}

/**
 * Composes a two-tiered phase transition (slide-out/in) chaining DOM
 * listeners seamlessly hiding rendering delays on heavy interfaces.
 * Cancels any in-flight animation via _animId before starting a new one.
 *
 * @param {string} direction - Denotes either left or right slide logic maps.
 */
function animateSlide(direction) {
    const inner = document.getElementById('schedule-swipe-inner');
    if (!inner) { renderDayView(); return; }

    /* Cancels any in-flight animationend callbacks from a previous animation */
    const currentAnimId = ++_animId;
    _animPhase = 'out';
    _animDirection = direction;

    inner.classList.remove('sliding-out-left', 'sliding-out-right', 'sliding-in-left', 'sliding-in-right');
    void inner.offsetWidth;

    const outClass = direction === 'left' ? 'sliding-out-left' : 'sliding-out-right';
    inner.classList.add(outClass);

    inner.addEventListener('animationend', function onOut(e) {
        if (e.target !== inner) return;
        inner.removeEventListener('animationend', onOut);

        if (currentAnimId !== _animId) return;
        if (!_container || !_scheduleData) return;

        inner.classList.remove(outClass);

        const entry = _scheduleData[_currentDayIndex];
        updateScheduleContent(entry, _currentDayIndex, _container, _scheduleData.length);

        _animPhase = 'in';
        const inClass = direction === 'left' ? 'sliding-in-left' : 'sliding-in-right';
        inner.classList.add(inClass);

        inner.addEventListener('animationend', function onIn(e) {
            if (e.target !== inner) return;
            inner.removeEventListener('animationend', onIn);

            if (currentAnimId !== _animId) return;

            inner.classList.remove(inClass);
            _animPhase = 'idle';
            _animDirection = null;
        });
    });
}
