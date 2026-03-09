import { getPrayerTimesByCoords } from '../core/api.js';
import { getSavedLocation } from '../core/geolocation.js';

import { getSelectedOrg, getOrgDisplayName } from '../modules/schedule/ramadhan.js';
import { fetchScheduleData, findTodayIndex, isToday, getTodayDateStr } from '../modules/schedule/schedule-data.js';
import { onPrayerChange, offPrayerChange } from '../modules/prayer/prayer-watcher.js';

import {
    renderScheduleCard,
    updateScheduleContent,
    updateScheduleHighlights,
    updateScheduleFeaturedCard,
    getActivePrayerKey,
} from '../components/card/schedule-card.js';
import { handleOrgToggle } from '../components/prayer/prayer-widgets.js';
import { renderScheduleSkeleton } from '../components/skeleton/skeleton-schedule.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { showCalendarModal } from '../components/modal/calendar-modal.js';
import { bindSwipeEvents, unbindSwipeEvents } from '../components/schedule/schedule-swipe.js';

/* --- STATE --- */

let _container = null;
let _scheduleData = null;
let _currentDayIndex = 0;
let _todayTimings = null;

let _dayCheckInterval = null;
let _lastDateStr = null;

let _animPhase = 'idle';
let _animDirection = null;
let _animId = 0;

/* --- LIFECYCLE --- */

/**
 * Bootstraps and constructs the single-day 30 format UI.
 * Connects the daily location API payload and bridges user's daily data.
 *
 * @param {HTMLElement} container - Active DOM payload to render upon.
 */
export async function render(container) {
    _container = container;
    renderScheduleSkeleton(_container);

    const location = await getSavedLocation();

    if (!location) {
        renderError(false);
        return;
    }

    const [scheduleResult, todayTimingsResult] = await Promise.all([
        fetchScheduleData(location),
        getPrayerTimesByCoords(location.latitude, location.longitude).catch(() => null),
    ]);

    _scheduleData = scheduleResult;
    _todayTimings = todayTimingsResult;

    if (!_scheduleData) {
        renderError(true);
        return;
    }

    _currentDayIndex = findTodayIndex(_scheduleData);
    await renderDayView();
}

/**
 * Nullifies swipe thresholds alongside 30-day timeline objects
 * stopping async loop intervals and destroying handlers.
 */
export function destroy() {
    stopDayCrossingCheck();
    offPrayerChange(handlePrayerTransition);
    unbindSwipeEvents();
    _container = null;
    _scheduleData = null;
    _todayTimings = null;
    _currentDayIndex = 0;
    _lastDateStr = null;
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

    const entry = _scheduleData[_currentDayIndex];
    if (!entry || !isToday(entry.date)) return;

    const newActivePrayerKey = getActivePrayerKey(entry.timings);
    updateScheduleHighlights(newActivePrayerKey, _container);
    updateScheduleFeaturedCard(_todayTimings);
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
function renderError(hasLocation) {
    const icon = hasLocation ? 'bx-wifi-off' : 'bx-map-pin';
    const title = hasLocation ? 'Gagal Memuat Jadwal' : 'Lokasi Belum Diatur';
    const desc = hasLocation
        ? 'Tidak dapat memuat jadwal Ramadhan. Periksa koneksi internet Anda dan coba lagi.'
        : 'Atur lokasi terlebih dahulu di Pengaturan untuk melihat jadwal secara lengkap.';

    _container.innerHTML = `
        <div class="schedule-page">
            ${renderEmptyState({
        icon,
        iconVariant: hasLocation ? 'warning' : undefined,
        title,
        description: desc,
        action: hasLocation ? {
            label: 'Coba Lagi',
            icon: 'bx-refresh',
            onclick: 'location.reload()',
        } : undefined,
    })}
        </div>
    `;
}

/**
 * Computes and renders the centralized DOM structure dictating the sweeping
 * timeline views combining navbar elements with native widget handlers.
 */
async function renderDayView() {
    if (!_scheduleData || !_scheduleData[_currentDayIndex]) return;

    const entry = _scheduleData[_currentDayIndex];
    const org = await getSelectedOrg();
    const orgName = getOrgDisplayName(org);

    _container.innerHTML = renderScheduleCard(entry, orgName, _todayTimings, _currentDayIndex);

    _lastDateStr = getTodayDateStr();

    bindEvents();
    subscribePrayerWatcher();
    startDayCrossingCheck();
}

/* --- EVENTS & HANDLERS --- */

/**
 * Establishes centralized interaction layers linking native swipe loops
 * to core navigation patterns alongside dynamic organization modals.
 */
function bindEvents() {
    unbindSwipeEvents();

    document.getElementById('schedule-prev')?.addEventListener('click', () => {
        if (_currentDayIndex > 0) {
            navigateWithAnimation('right');
        }
    });

    document.getElementById('schedule-next')?.addEventListener('click', () => {
        if (_currentDayIndex < 29) {
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
        await handleOrgToggle('schedule-org-toggle-label', async () => {
            const location = await getSavedLocation();
            if (location) {
                _scheduleData = await fetchScheduleData(location);
                _currentDayIndex = findTodayIndex(_scheduleData);
                renderDayView();
            }
        });
    });

    document.getElementById('btn-kiblat')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="compass"]')?.click();
    });

    document.getElementById('btn-calendar-modal')?.addEventListener('click', () => {
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

    bindSwipeEvents('schedule-swipe-area', handleSwipe);
}

/**
 * Handle swipe gesture direction from the swipe module.
 * @param {string} direction - 'left' or 'right'
 */
function handleSwipe(direction) {
    if (direction === 'left' && _currentDayIndex < 29) {
        navigateWithAnimation('left');
    } else if (direction === 'right' && _currentDayIndex > 0) {
        navigateWithAnimation('right');
    }
}

/* --- ANIMATION --- */

/**
 * Navigates to the next/previous day with interrupt-safe animation.
 *
 * Rapid same-direction taps: only the index is updated — the already-running
 * slide-out callback will read the latest _currentDayIndex when it fires.
 * Rapid reverse-direction or mid-slide-in taps: the running animation is
 * cancelled via _animId and a fresh slide starts immediately.
 *
 * @param {string} direction - Navigational vector mapping next steps.
 */
function navigateWithAnimation(direction) {
    if (direction === 'left' && _currentDayIndex < 29) {
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

        inner.classList.remove(outClass);

        const entry = _scheduleData[_currentDayIndex];
        updateScheduleContent(entry, _currentDayIndex, _container);

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

