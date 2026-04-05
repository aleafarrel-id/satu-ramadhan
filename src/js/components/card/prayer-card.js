/**
 * Prayer Card Component
 * Renders the daily prayer schedule tube grid with liquid fill animations,
 * featured card, org toggle, and provides skeleton loading state.
 */

// Core & Libraries
import { PRAYER_LIST, getTubeFillPercent, parseTimeToDate, getPrayerName } from '../../modules/prayer/prayer-times.js';

// UI Components
import { renderFeaturedCard as renderFeaturedCardShared } from '../prayer/prayer-widgets.js';

const TUBE_LAYOUT = [
    { type: 'stacked', items: ['terbit', 'subuh', 'imsak'] },
    { type: 'stacked', items: ['ashar', 'dzuhur'] },
    { type: 'single', key: 'magrib' },
    { type: 'single', key: 'isya' },
];

/**
 * Render the complete prayer card HTML: featured card + tube grid + org toggle.
 * @param {object} timings  - Prayer timings object { imsak, subuh, ... }
 * @param {string} orgName  - Display name of selected organization
 * @param {object} prayerState - Current prayer state from getCurrentPrayer()
 * @returns {string} HTML string
 */
export function renderPrayerCard(timings, orgName, prayerState) {
    return `
        <div id="featured-prayer-container">
            ${renderFeaturedCard(timings, prayerState)}
        </div>
        <div class="schedule-bottom" id="tube-grid">
            ${renderTubeGrid(timings, prayerState)}
            <div class="schedule-org-cell">
                <button class="org-toggle" id="org-toggle">
                    <span class="org-toggle__icon-circle"><i class='bx bxs-home'></i></span>
                    <span class="org-toggle__label" id="org-label">${orgName}</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Update CSS `--fill-percent` on each tube via DOM queries.
 * Called every countdown tick to animate the liquid levels.
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state from getCurrentPrayer()
 */
export function updatePrayerCardFills(timings, prayerState) {
    if (!timings) return;

    const now = new Date();
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
                : parseTimeToDate(timings[PRAYER_LIST[currentIdx].key]);

            const nextIdx = currentIdx + 1;
            let sectionEnd;
            if (nextIdx < PRAYER_LIST.length) {
                sectionEnd = parseTimeToDate(timings[PRAYER_LIST[nextIdx].key]);
            } else {
                sectionEnd = parseTimeToDate(timings[PRAYER_LIST[0].key]);
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

/**
 * Patch mutable DOM elements (featured card & next prayer label)
 * without full container reflows during countdown ticks.
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state from getCurrentPrayer()
 */
export function updatePrayerCardDynamicUI(timings, prayerState) {
    const nameEl = document.getElementById('cd-prayer-name');
    if (nameEl) {
        nameEl.textContent = prayerState.next ? getPrayerName(prayerState.next.key) : '--';
    }

    const featuredContainer = document.getElementById('featured-prayer-container');
    if (featuredContainer) {
        featuredContainer.innerHTML = renderFeaturedCard(timings, prayerState);
    }
}

/**
 * Render the skeleton loading state for the prayer card section.
 * Used by skeleton-home.js to show a placeholder while data is fetching.
 * @returns {string} HTML string
 */
export function renderPrayerCardSkeleton() {
    return `
        <!-- Featured Prayer Skeleton -->
        <div class="card card--inner skeleton-featured skeleton--mb-md">
            <div class="skeleton skeleton--featured-icon"></div>
            <div class="skeleton-featured__body">
                <div class="skeleton skeleton--text-md" style="width: 45%"></div>
                <div class="skeleton skeleton--text-xl" style="width: 30%"></div>
            </div>
            <div class="skeleton skeleton--badge-lg"></div>
        </div>

        <!-- Tube Grid Skeleton (matches schedule-bottom grid) -->
        <div class="schedule-bottom">
            <!-- Tall stacked tube (col 1, rows 1-2) -->
            <div class="skeleton skeleton--tube-tall" style="display: flex; flex-direction: column; justify-content: space-around; padding: 1.25rem 0.75rem;">
                <div class="tube__stack-item" style="opacity: 0.5; align-items: center; border: none; background: transparent;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
                <div class="tube__stack-divider" style="opacity: 0.2; background: rgba(255, 255, 255, 0.2); margin: 0 auto;"></div>
                <div class="tube__stack-item" style="opacity: 0.5; align-items: center; border: none; background: transparent;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
                <div class="tube__stack-divider" style="opacity: 0.2; background: rgba(255, 255, 255, 0.2); margin: 0 auto;"></div>
                <div class="tube__stack-item" style="opacity: 0.5; align-items: center; border: none; background: transparent;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
            </div>
            
            <!-- Org toggle row (cols 2-4, row 1) -->
            <div class="schedule-org-cell">
                <div class="skeleton skeleton-org">
                    <div class="skeleton skeleton-org__icon"></div>
                    <div class="skeleton skeleton-org__label"></div>
                </div>
            </div>
            
            <!-- 3 tubes (cols 2-4, row 2) -->
            <!-- Second tube: Stacked 2 -->
            <div class="skeleton skeleton--tube" style="display: flex; flex-direction: column; justify-content: space-around; padding: 10px 5px;">
                 <div class="tube__stack-item" style="opacity: 0.5; transform: scale(0.9); align-items: center; border: none; background: transparent;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 6px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
                <div class="tube__stack-divider" style="opacity: 0.2; background: rgba(255, 255, 255, 0.2); margin: 0 auto;"></div>
                 <div class="tube__stack-item" style="opacity: 0.5; transform: scale(0.9); align-items: center; border: none; background: transparent;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 6px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
            </div>

            <!-- Third tube: Single -->
            <div class="skeleton skeleton--tube" style="display: flex; flex-direction: column; justify-content: center; padding: 1.25rem 0.75rem;">
                 <div style="opacity: 0.5; display: flex; flex-direction: column; align-items: center; width: 100%;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
            </div>

            <!-- Fourth tube: Single -->
            <div class="skeleton skeleton--tube" style="display: flex; flex-direction: column; justify-content: center; padding: 1.25rem 0.75rem;">
                <div style="opacity: 0.5; display: flex; flex-direction: column; align-items: center; width: 100%;">
                    <div class="skeleton skeleton--prayer-icon" style="margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton--text-sm" style="width: 60%; margin-bottom: 4px;"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render the featured "current prayer" card wrapper.
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
function renderFeaturedCard(timings, prayerState) {
    if (!prayerState.current) return '';
    return `<div class="featured-card-wrapper">${renderFeaturedCardShared(timings, prayerState)}</div>`;
}

/**
 * Render the complete tube grid with stacked and single tubes.
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
function renderTubeGrid(timings, prayerState) {
    return TUBE_LAYOUT.map((tube, index) => {
        const extraClass = index === 0 ? ' tube--tall' : '';

        return tube.type === 'stacked'
            ? renderStackedTube(tube.items, timings, prayerState, extraClass)
            : renderSingleTube(tube.key, timings, prayerState);
    }).join('');
}

/**
 * Render a wider stacked tube spanning multiple prayers (e.g. Terbit/Subuh/Imsak).
 * @param {string[]} keys       - Prayer keys nested inside this tube
 * @param {object}   timings    - Prayer timings object
 * @param {object}   prayerState - Current prayer state
 * @param {string}   extraClass - Optional CSS modifier for taller tubes
 * @returns {string} HTML string
 */
function renderStackedTube(keys, timings, prayerState, extraClass = '') {
    const itemsHtml = keys.map((key, i) => {
        const prayer = PRAYER_LIST.find(p => p.key === key);
        if (!prayer) return '';
        const time = timings[key] || '--:--';

        return `
            ${i > 0 ? '<div class="tube__stack-divider"></div>' : ''}
            <div class="tube__stack-item">
                <div class="tube__icon">${prayer.icon}</div>
                <div class="tube__name">${getPrayerName(prayer.key)}</div>
                <div class="tube__time">${cleanTime(time)}</div>
            </div>
        `;
    }).join('');

    const isActive = keys.some(k => prayerState.current?.key === k);
    const classes = ['tube', 'tube--stacked', isActive ? 'active' : '', extraClass.trim()].filter(Boolean).join(' ');

    return `<div class="${classes}" data-prayer="${keys.join(',')}">${itemsHtml}${renderLiquidHTML()}</div>`;
}

/**
 * Render a single (non-stacked) tube element for Magrib or Isya.
 * @param {string} key         - Prayer key
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
function renderSingleTube(key, timings, prayerState) {
    const prayer = PRAYER_LIST.find(p => p.key === key);
    if (!prayer) return '';

    const time = timings[key] || '--:--';
    const isActive = prayerState.current?.key === key;
    const isPassed = isPrayerPassed(key, prayerState);
    const classes = ['tube', isActive ? 'active' : '', isPassed ? 'passed' : ''].filter(Boolean).join(' ');

    return `
        <div class="${classes}" data-prayer="${key}">
            <div class="tube__icon">${prayer.icon}</div>
            <div class="tube__name">${getPrayerName(prayer.key)}</div>
            <div class="tube__time">${cleanTime(time)}</div>
            ${renderLiquidHTML()}
        </div>
    `;
}

/**
 * Render the SVG liquid wave animation inside a tube.
 * @returns {string} HTML string
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
 * Check if a prayer time has already passed, accounting for post-midnight.
 * @param {string} key         - Prayer key
 * @param {object} prayerState - Current prayer state
 * @returns {boolean}
 */
function isPrayerPassed(key, prayerState) {
    if (prayerState.isPostMidnight) return false;
    const idx = PRAYER_LIST.findIndex(p => p.key === key);
    return idx < prayerState.currentIndex;
}

/**
 * Strip timezone notes from time strings, e.g. "04:15 (WIB)" → "04:15".
 * @param {string} timeStr - Raw time string
 * @returns {string}
 */
function cleanTime(timeStr) {
    return timeStr.replace(/\s*\(.*\)/, '');
}
