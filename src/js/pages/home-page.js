import { getSavedLocation } from '../core/geolocation.js';
import { getPrayerTimesByCoords } from '../core/api.js';

import { PRAYER_LIST, getCurrentPrayer, getTubeFillPercent, parseTimeToDate } from '../modules/prayer-times.js';
import { startCountdown, stopCountdown } from '../modules/countdown.js';
import { getSelectedOrg, getOrgDisplayName } from '../modules/ramadhan.js';
import { schedulePrayerNotifications } from '../modules/native-notification.js';
import { updateWatcher } from '../modules/prayer-watcher.js';

import { renderLocationCard as renderLocationCardShared, bindLocationCardEvents } from '../components/card/location-card.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { renderFeaturedCard as renderFeaturedCardShared, handleOrgToggle as handleOrgToggleShared } from '../components/ui/prayer-widgets.js';
import { renderHomeSkeleton } from '../components/ui/skeleton-home.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { renderCountdownCard } from '../components/ui/countdown-card.js';

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
                updateDynamicUI(currentState);
            }

            updateTubeFills(currentState);
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

    document.getElementById('org-toggle')?.addEventListener('click', handleOrgToggle);
    bindLocationCardEvents(showLocationModalForHome);

    _lastPrayerIndex = prayerState.currentIndex;

    startCountdownTimer();
    schedulePrayerNotifications(_timings);
    updateWatcher(_timings);
}

/**
 * Yields an isolated wrapper for the featured card containing
 * the active prayer highlighted boldly.
 *
 * @param {Object} prayerState - The current state denoting which prayer is active.
 */
function renderFeaturedCard(prayerState) {
    if (!prayerState.current) return '';
    return `<div class="featured-card-wrapper">${renderFeaturedCardShared(_timings)}</div>`;
}

/**
 * Calculates the visual distribution for four tubular columns
 * based on grouped and categorized prayer entries.
 *
 * @param {Object} prayerState - Context object handling active/past logic.
 */
function renderTubeGrid(prayerState) {
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
 * Yields the raw SVG and DOM structure mapping the floating
 * liquid waves that dynamically fill up inside tubes.
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
 * Retrieves the structure for an isolated (non-stacked) tube element,
 * calculating active flags specifically for Magrib or Isya items.
 *
 * @param {string} key - Underlying prayer key representation.
 * @param {Object} prayerState - Information regarding current time progression.
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
 * Retrieves the structure for a wider stacked tube spanning multiple
 * prayers (e.g. Terbit/Subuh/Imsak or Ashar/Dzuhur).
 *
 * @param {Array} keys - Batch of prayer strings nested inside this tube.
 * @param {Object} prayerState - Global prayer pointer evaluation.
 * @param {string} extraClass - Optional modifier for taller tubes.
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

    const isActive = keys.some(k => prayerState.current?.key === k);
    const classes = ['tube', 'tube--stacked', isActive ? 'active' : '', extraClass.trim()].filter(Boolean).join(' ');

    return `<div class="${classes}" data-prayer="${keys.join(',')}">${itemsHtml}${renderLiquidHTML()}</div>`;
}

/**
 * Instantly patches mutable DOM texts and labels (like the next prayer
 * banner) to circumvent full container reflows during countdown ticks.
 *
 * @param {Object} prayerState - Live structure dictating the next target.
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
 * Dynamically calibrates CSS height variables mimicking water density
 * moving upward as the day progresses from dawn to midnight.
 *
 * @param {Object} [prayerState] - Derived current tracker context.
 */
function updateTubeFills(prayerState = null) {
    if (!_timings) return;

    const now = new Date();
    if (!prayerState) prayerState = getCurrentPrayer(_timings);

    const tubes = document.querySelectorAll('.tube[data-prayer]');
    tubes.forEach(tube => {
        const keys = tube.dataset.prayer.split(',');
        const liquid = tube.querySelector('.tube__liquid');

        const indices = keys.map(k => PRAYER_LIST.findIndex(p => p.key === k)).filter(i => i >= 0);
        if (indices.length === 0) return;

        const minIdx = Math.min(...indices);
        const maxIdx = Math.max(...indices);
        const currentIdx = prayerState.currentIndex;
        const tubeContainsCurrent = currentIdx >= minIdx && currentIdx <= maxIdx;

        if (tubeContainsCurrent) {
            const sectionCount = maxIdx - minIdx + 1;
            const sectionHeight = 100 / sectionCount;
            const passedSections = currentIdx - minIdx;

            const sectionStart = prayerState.isPostMidnight
                ? prayerState.current.date
                : parseTimeToDate(_timings[PRAYER_LIST[currentIdx].key]);

            const nextIdx = currentIdx + 1;
            let sectionEnd;
            if (nextIdx < PRAYER_LIST.length) {
                sectionEnd = parseTimeToDate(_timings[PRAYER_LIST[nextIdx].key]);
            } else {
                sectionEnd = parseTimeToDate(_timings[PRAYER_LIST[0].key]);
                if (!prayerState.isPostMidnight) {
                    sectionEnd.setDate(sectionEnd.getDate() + 1);
                }
            }

            const sectionProgress = getTubeFillPercent(sectionStart, sectionEnd, now);
            const percent = (passedSections * sectionHeight) + (sectionProgress / 100 * sectionHeight);
            if (liquid) liquid.style.setProperty('--fill-percent', percent + '%');
            tube.classList.add('active');
            tube.classList.remove('passed');
        } else if (!prayerState.isPostMidnight && currentIdx > maxIdx) {
            if (liquid) liquid.style.setProperty('--fill-percent', '0%');
            tube.classList.remove('active');
            tube.classList.add('passed');
        } else {
            if (liquid) liquid.style.setProperty('--fill-percent', '0%');
            tube.classList.remove('active', 'passed');
        }
    });
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
 * (e.g. between Kemenag and Muhammadiyah or NU) visually.
 */
async function handleOrgToggle() {
    await handleOrgToggleShared('org-label');
}

/* --- UTILITIES --- */

/**
 * Scans if a specific scheduled point has already transpired,
 * taking post-midnight loop boundaries gracefully into account.
 *
 * @param {string} key - Underlying target time node.
 * @param {Object} prayerState - Global application timeline indicator.
 */
function isPrayerPassed(key, prayerState) {
    if (prayerState.isPostMidnight) return false;
    const idx = PRAYER_LIST.findIndex(p => p.key === key);
    return idx < prayerState.currentIndex;
}

/**
 * Strips superfluous timezone strings extracted from raw payload
 * making strings like "04:15 (WIB)" uniformly readable.
 *
 * @param {string} timeStr - The literal format to trim.
 */
function cleanTime(timeStr) {
    return timeStr.replace(/\s*\(.*\)/, '');
}
