/**
 * Home Page
 * Main page showing prayer times, countdown, and location
 */

import { getSavedLocation } from '../core/geolocation.js';
import { getPrayerTimesByCoords } from '../core/api.js';

import { PRAYER_LIST, getCurrentPrayer, getTubeFillPercent, parseTimeToDate } from '../modules/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/countdown.js';
import { getSelectedOrg, getOrgDisplayName } from '../modules/ramadhan.js';
import { schedulePrayerNotifications } from '../modules/native-notification.js';

import { renderLocationCard as renderLocationCardShared, bindLocationCardEvents } from '../components/card/location-card.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { renderFeaturedCard as renderFeaturedCardShared, handleOrgToggle as handleOrgToggleShared } from '../components/ui/prayer-widgets.js';
import { renderHomeSkeleton } from '../components/ui/skeleton-home.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { renderCountdownCard } from '../components/ui/countdown-card.js';

let _container = null;
let _timings = null;
let _location = null;
let _lastPrayerIndex = -1;

/**
 * Render the home page
 */
export async function render(container) {
    _container = container;

    // Try saved location first (fast, from Capacitor Preferences)
    _location = await getSavedLocation();

    // Show skeleton first, injecting genuine location card immediately
    renderSkeleton(_location);

    if (_location) {
        // Cached location found — load prayer times and render
        try {
            _timings = await getPrayerTimesByCoords(
                _location.latitude,
                _location.longitude
            );
        } catch { /* handled gracefully in renderContent */ }
        await renderContent();
    } else {
        // No cached location — show location modal over skeleton
        showLocationModalForHome();
    }
}

/**
 * Show location modal and handle result
 */
function showLocationModalForHome() {
    showLocationModal({
        onLocationDetected: async (location) => {
            _location = location;
            try {
                _timings = await getPrayerTimesByCoords(
                    location.latitude,
                    location.longitude
                );
            } catch { /* handled in renderContent */ }
            await renderContent();
        },
        onManualSelect: () => {
            showLocationSearchModal();
        },
    });
}

/**
 * Render skeleton loading state — delegates to skeleton-home component
 */
function renderSkeleton(location) {
    renderHomeSkeleton(_container, location, showLocationModalForHome);
}

/**
 * Render full content with data
 */
async function renderContent() {
    // Case 1: No location and no timings — show location setup prompt (not offline error)
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

    // Case 2: Has location but API failed — show offline/retry
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
        <!-- Location Card -->
        ${renderLocationCardShared(_location)}

        <!-- Countdown -->
        ${renderCountdownCard(prayerState)}

        <!-- Prayer Schedule -->
        <div class="schedule-title">Jadwal Hari Ini</div>
        <div class="card card--container">
            <div id="featured-prayer-container">
                ${renderFeaturedCard(prayerState)}
            </div>
            <div class="schedule-bottom" id="tube-grid">
                ${renderTubeGrid(prayerState)}
                <div class="schedule-org-cell">
                    <button class="org-toggle" id="org-toggle">
                        <span class="org-toggle__icon-circle"><i class='bx bxs-home'></i></span>
                        <span class="org-toggle__label" id="org-label">${orgName}</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    /**
    * Homepage buttons binding
    */

    // Bind org toggle
    document.getElementById('org-toggle')?.addEventListener('click', handleOrgToggle);

    // Bind ubah lokasi button → show location modal
    bindLocationCardEvents(showLocationModalForHome);

    // Track initial index
    _lastPrayerIndex = prayerState.currentIndex;

    // Start countdown
    startCountdownTimer();

    // Schedule prayer notifications (reschedule on each data load)
    schedulePrayerNotifications(_timings);
}

/**
 * Render featured (active) prayer card — delegates to shared component
 */
function renderFeaturedCard(prayerState) {
    if (!prayerState.current) return '';
    return `<div class="featured-card-wrapper">${renderFeaturedCardShared(_timings)}</div>`;
}

/**
 * Render the tube grid
 */
function renderTubeGrid(prayerState) {
    // Tube 1 (tall, left): Terbit, Subuh, Imsak
    // Tube 2: Ashar, Dzuhur (stacked)
    // Tube 3: Magrib
    // Tube 4: Isya'
    const tubeLayout = [
        { type: 'stacked', items: ['terbit', 'subuh', 'imsak'] },
        { type: 'stacked', items: ['ashar', 'dzuhur'] },
        { type: 'single', key: 'magrib' },
        { type: 'single', key: 'isya' },
    ];

    return tubeLayout.map((tube, index) => {
        const extraClass = index === 0 ? ' tube--tall' : '';
        if (tube.type === 'stacked') {
            return renderStackedTube(tube.items, prayerState, extraClass);
        } else {
            return renderSingleTube(tube.key, prayerState);
        }
    }).join('');
}

/**
 * Generate liquid fill HTML with SVG waves
 */
function renderLiquidHTML() {
    return `
        <div class="tube__liquid">
            <div class="tube__liquid-body"></div>
            <div class="tube__wave">
                <svg viewBox="0 0 400 24" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="wave-grad" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stop-color="var(--clr-liquid-body)" />
                            <stop offset="100%" stop-color="var(--clr-liquid-surface)" />
                        </linearGradient>
                    </defs>
                    <path d="M0 12 Q 50 0, 100 12 T 200 12 T 300 12 T 400 12 V 24 H 0 Z" fill="url(#wave-grad)"/>
                </svg>
            </div>
            <div class="tube__wave tube__wave--back">
                <svg viewBox="0 0 400 24" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 12 Q 50 24, 100 12 T 200 12 T 300 12 T 400 12 V 24 H 0 Z" fill="var(--clr-liquid-body)"/>
                </svg>
            </div>
            <div class="tube__bubbles">
                <div class="tube__bubble"></div>
                <div class="tube__bubble"></div>
                <div class="tube__bubble"></div>
                <div class="tube__bubble"></div>
            </div>
        </div>
    `;
}

/**
 * Render a single prayer tube
 */
function renderSingleTube(key, prayerState) {
    const prayer = PRAYER_LIST.find(p => p.key === key);
    if (!prayer) return '';

    const time = _timings[key] || '--:--';
    const isActive = prayerState.current?.key === key;
    const isPassed = isPrayerPassed(key, prayerState);
    const classes = ['tube', isActive ? 'active' : '', isPassed ? 'passed' : ''].filter(Boolean).join(' ');

    return `
        <div class="${classes}" data-prayer="${key}">
            <div class="tube__icon">${prayer.icon}</div>
            <div class="tube__name">${prayer.name}</div>
            <div class="tube__time">${cleanTime(time)}</div>
            ${renderLiquidHTML()}
        </div>
    `;
}

/**
 * Render a stacked tube (wider, multiple prayers)
 */
function renderStackedTube(keys, prayerState, extraClass = '') {
    const itemsHtml = keys.map((key, i) => {
        const prayer = PRAYER_LIST.find(p => p.key === key);
        if (!prayer) return '';
        const time = _timings[key] || '--:--';

        return `
            ${i > 0 ? '<div class="tube__stack-divider"></div>' : ''}
            <div class="tube__stack-item">
                <div class="tube__icon">${prayer.icon}</div>
                <div class="tube__name">${prayer.name}</div>
                <div class="tube__time">${cleanTime(time)}</div>
            </div>
        `;
    }).join('');

    // Check if any item in stack is active
    const isActive = keys.some(k => prayerState.current?.key === k);
    const classes = ['tube', 'tube--stacked', isActive ? 'active' : '', extraClass.trim()].filter(Boolean).join(' ');

    return `<div class="${classes}" data-prayer="${keys.join(',')}">${itemsHtml}${renderLiquidHTML()}</div>`;
}

/**
 * Check if a prayer time has passed
 */
function isPrayerPassed(key, prayerState) {
    if (prayerState.isPostMidnight) return false;
    const idx = PRAYER_LIST.findIndex(p => p.key === key);
    return idx < prayerState.currentIndex;
}

/**
 * Clean time string (remove timezone notes)
 */
function cleanTime(timeStr) {
    return timeStr.replace(/\s*\(.*\)/, '');
}

/**
 * Start countdown timer and synchronized UI updates
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

            // Sync check for prayer change
            const currentState = getCurrentPrayer(_timings);
            if (_lastPrayerIndex !== currentState.currentIndex) {
                _lastPrayerIndex = currentState.currentIndex;
                updateDynamicUI(currentState);
            }

            // Sync tube updates to countdown tick
            updateTubeFills(currentState);
        },
        () => {
            return getCurrentPrayer(_timings).next?.date;
        }
    );
}

/**
 * Update dynamic UI elements without re-rendering everything
 */
function updateDynamicUI(prayerState) {
    const nameEl = document.getElementById('cd-prayer-name');
    if (nameEl) {
        nameEl.textContent = prayerState.next?.name || '--';
    }

    const featuredContainer = document.getElementById('featured-prayer-container');
    if (featuredContainer) {
        featuredContainer.innerHTML = renderFeaturedCard(prayerState);
    }
}

/**
 * Update tube fill levels
 * For stacked tubes, calculates fill across the entire chronological span
 * of all prayers in the tube (earliest prayer start → next prayer after latest)
 */
function updateTubeFills(prayerState = null) {
    if (!_timings) return;

    const now = new Date();
    if (!prayerState) prayerState = getCurrentPrayer(_timings);

    const tubes = document.querySelectorAll('.tube[data-prayer]');
    tubes.forEach(tube => {
        const keys = tube.dataset.prayer.split(',');
        const liquid = tube.querySelector('.tube__liquid');

        // Find all PRAYER_LIST indices for keys in this tube
        const indices = keys
            .map(k => PRAYER_LIST.findIndex(p => p.key === k))
            .filter(i => i >= 0);

        if (indices.length === 0) return;

        // Get chronological range of this tube
        const minIdx = Math.min(...indices);  // earliest prayer in tube
        const maxIdx = Math.max(...indices);  // latest prayer in tube

        // Check if the current prayer falls within this tube's range
        const currentIdx = prayerState.currentIndex;
        const tubeContainsCurrent = currentIdx >= minIdx && currentIdx <= maxIdx;

        if (tubeContainsCurrent) {
            // Section-aware fill: each prayer gets equal visual height
            const sectionCount = maxIdx - minIdx + 1;
            const sectionHeight = 100 / sectionCount;

            // How many sections are fully passed (below current)
            const passedSections = currentIdx - minIdx;

            // Section start: use adjusted yesterday date for post-midnight Isya'
            const sectionStart = prayerState.isPostMidnight
                ? prayerState.current.date
                : parseTimeToDate(_timings[PRAYER_LIST[currentIdx].key]);

            // Section end: wrap Isya' → Imsak across midnight
            const nextIdx = currentIdx + 1;
            let sectionEnd;
            if (nextIdx < PRAYER_LIST.length) {
                sectionEnd = parseTimeToDate(_timings[PRAYER_LIST[nextIdx].key]);
            } else {
                // Last prayer (Isya') wraps to next Imsak
                sectionEnd = parseTimeToDate(_timings[PRAYER_LIST[0].key]);
                if (!prayerState.isPostMidnight) {
                    // Evening: Imsak is tomorrow
                    sectionEnd.setDate(sectionEnd.getDate() + 1);
                }
            }

            const sectionProgress = getTubeFillPercent(sectionStart, sectionEnd, now);
            const percent = (passedSections * sectionHeight) + (sectionProgress / 100 * sectionHeight);
            if (liquid) liquid.style.setProperty('--fill-percent', percent + '%');
            tube.classList.add('active');
            tube.classList.remove('passed');
        } else if (!prayerState.isPostMidnight && currentIdx > maxIdx) {
            // All prayers in this tube have passed: empty and dimmed
            if (liquid) liquid.style.setProperty('--fill-percent', '0%');
            tube.classList.remove('active');
            tube.classList.add('passed');
        } else {
            // Future: empty
            if (liquid) liquid.style.setProperty('--fill-percent', '0%');
            tube.classList.remove('active', 'passed');
        }
    });
}

/**
 * Handle organization toggle — delegates to shared handler
 */
async function handleOrgToggle() {
    await handleOrgToggleShared('org-label');
}

/**
 * Cleanup
 */
export function destroy() {
    stopCountdown();
    _container = null;
    _timings = null;
}
