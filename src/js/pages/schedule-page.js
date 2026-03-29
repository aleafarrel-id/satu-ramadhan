/* Lazy-loaded CSS — only fetched when this page module is imported */
import '../../css/pages/schedule.css';
import '../../css/components/card/share-schedule-card.css';
import '../../css/components/modal/calendar-modal.css';
import '../../css/components/modal/date-picker-modal.css';
import '../../css/components/modal/share-schedule-modal.css';
import '../../css/components/modal/confirm-modal.css';
import '../../css/components/modal/preset-manager-modal.css';

import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

import { getPrayerTimesByCoords, getQiblaDirection } from '../core/api.js';
import { getSavedLocation } from '../core/geolocation.js';

import { getOrgDisplayNameAsync } from '../modules/schedule/ramadhan.js';
import { fetchScheduleData, findTodayIndex, isToday, getTodayDateStr } from '../modules/schedule/schedule-data.js';
import { onPrayerChange, offPrayerChange } from '../modules/prayer/prayer-watcher.js';

import {
    renderScheduleCard,
    renderScheduleCardBottomSkeleton,
    updateScheduleContent,
    updateScheduleHighlights,
    updateScheduleFeaturedCard,
    getActivePrayerKey,
} from '../components/card/schedule-card.js';
import { renderLocationCard, bindLocationCardEvents } from '../components/card/location-card.js';
import { bindShareScheduleCardEvents } from '../components/card/share-schedule-card.js';
import { handleOrgToggle } from '../components/prayer/prayer-widgets.js';
import { renderScheduleSkeleton } from '../components/skeleton/skeleton-schedule.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { showCalendarModal } from '../components/modal/calendar-modal.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { showShareScheduleModal } from '../components/modal/share-schedule-modal.js';
import { downloadScheduleImage, shareScheduleImage } from '../modules/share/share-schedule-exporter.js';
import { bindSwipeEvents, unbindSwipeEvents } from '../components/schedule/schedule-swipe.js';
import { showPermissionDialogPreset } from '../modules/permission/permission-dialog-configs.js';

import { makeAccessibleBtn } from '../utils/a11y.js';
import { safeClear } from '../utils/dom-utils.js';

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
 * @param {Object} [options={}] - Navigation options (e.g., refresh: true)
 */
export async function render(container, options = {}) {
    _container = container;

    safeClear(container);
    renderScheduleSkeleton(_container);

    if (options.refresh) {
        await new Promise(resolve => setTimeout(resolve, 350));
    }

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

/**
 * Re-fetch schedule data and re-render after preset changes.
 * Exported so other modules (settings) can trigger a refresh.
 */
export async function refreshScheduleData() {
    if (!_container) return;
    const location = await getSavedLocation();
    if (!location) return;

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
    if (!hasLocation) {
        _container.innerHTML = `
            ${renderLocationCard(null)}
            ${renderEmptyState({
            icon: 'bx-map-pin',
            title: 'Lokasi Belum Diatur',
            description: 'Jadwal akan ditampilkan setelah lokasi Anda diatur.',
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
    const title = 'Gagal Memuat Jadwal';
    const desc = 'Periksa koneksi internet Anda dan coba lagi.';

    _container.innerHTML = `
        <div class="schedule-page">
            ${renderEmptyState({
        icon,
        iconVariant: 'warning',
        title,
        description: desc,
        action: {
            label: 'Coba Lagi',
            icon: 'bx-refresh',
            onclick: 'location.reload()',
        },
        compact: true,
    })}
        </div>
    `;
}

/**
 * Opens the location selection modal tailored for the schedule page's empty state.
 */
function showLocationModalForSchedule() {
    showLocationModal({
        onLocationDetected: async () => {
            renderScheduleSkeleton(_container);
            await refreshScheduleData();
        },
        onManualSelect: () => {
            showLocationSearchModal({
                onLocationSelected: async () => {
                    renderScheduleSkeleton(_container);
                    await refreshScheduleData();
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
    if (!_scheduleData || !_scheduleData[_currentDayIndex]) return;

    const entry = _scheduleData[_currentDayIndex];
    const orgName = await getOrgDisplayNameAsync();

    _container.innerHTML = renderScheduleCard(entry, orgName, _todayTimings, _currentDayIndex, _scheduleData.length);
    bindShareScheduleCardEvents(() => handleShareSchedule(), _container);

    _lastDateStr = getTodayDateStr();

    bindEvents();
    subscribePrayerWatcher();
    startDayCrossingCheck();
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

    if (Capacitor.getPlatform() !== 'web') {
        const hasStorage = await _ensureStoragePermission();
        if (!hasStorage) return;
    }
    await _openShareModal();
}

function _ensureStoragePermission() {
    return new Promise(async (resolve) => {
        try {
            const status = await Filesystem.checkPermissions();
            if (status.publicStorage === 'granted') {
                resolve(true);
                return;
            }
        } catch (e) {
            resolve(false);
            return;
        }

        showPermissionDialogPreset('storage', {
            onConfirm: async () => {
                try {
                    const result = await Filesystem.requestPermissions();
                    resolve(result.publicStorage === 'granted');
                } catch (e) {
                    resolve(false);
                }
            },
            onCancel: () => resolve(false),
        });
    });
}

/**
 * Builds the share payload and opens the share schedule modal.
 * Extracted to avoid duplication between direct-grant and dialog-confirm flows.
 */
async function _openShareModal() {
    const location = await getSavedLocation();
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
        await handleOrgToggle('schedule-org-toggle-label', async () => {
            const location = await getSavedLocation();
            if (location) {
                _scheduleData = await fetchScheduleData(location);
                _currentDayIndex = findTodayIndex(_scheduleData);
                renderDayView();
            }
        });
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

    bindSwipeEvents('schedule-swipe-area', handleSwipe);
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
