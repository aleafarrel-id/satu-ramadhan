/**
 * Prayer List Component
 * Renders a compact horizontal prayer time grid (list view)
 * with action widgets (Kiblat + Org Toggle) and Qibla map.
 */

// Core & Libraries
import { PRAYER_LIST, getPrayerName } from '../../modules/prayer/prayer-times.js';

// Utilities & Helpers
import { cleanTimeStr, LIST_PRAYER_KEYS, SCHEDULE_PRAYERS } from '../../utils/datetime.js';

// UI Components
import { renderFeaturedCard, renderOrgToggle, renderKiblatButton } from '../prayer/prayer-widgets.js';
import { renderQiblaMapCard } from './qibla-map-card-markup.js';

/**
 * Use the centralized list constraints (Subuh to Isya)
 */
const LIST_PRAYERS = LIST_PRAYER_KEYS;

/** Unique map container ID to avoid collision with compass page */
const HOME_MAP_ID = 'home-qibla-map';

/**
 * Render the complete list view card:
 * featured card → action widgets (Kiblat + Org) → prayer grid → qibla map.
 * Widget order matches schedule-page.js for visual consistency.
 * @param {object} timings     - Prayer timings object { imsak, subuh, ... }
 * @param {string} orgName     - Display name of selected organization
 * @param {object} prayerState - Current prayer state from getCurrentPrayer()
 * @returns {string} HTML string
 */
export function renderPrayerListCard(timings, orgName, prayerState) {
    return `
        <div id="featured-prayer-container">
            ${renderFeaturedCard(timings, prayerState)}
        </div>
        <div class="schedule-actions">
            ${renderKiblatButton('home-btn-kiblat')}
            ${renderOrgToggle(orgName, 'org-toggle')}
        </div>
        <div class="prayer-list-grid">
            ${renderPrayerColumns(timings, prayerState)}
        </div>
        ${renderQiblaMapCard(HOME_MAP_ID)}
    `;
}

/**
 * Get the map container ID used by this component.
 * Used by home-page.js to call initQiblaMapCard() after DOM insertion.
 * @returns {string}
 */
export function getHomeMapId() {
    return HOME_MAP_ID;
}

/**
 * Render 5-column prayer time grid.
 * Draws prayer names from the centralized PRAYER_LIST and cleans
 * time strings via the shared cleanTimeStr() utility.
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
function renderPrayerColumns(timings, prayerState) {
    return LIST_PRAYERS.map(key => {
        const prayer = PRAYER_LIST.find(p => p.key === key);
        if (!prayer) return '';

        const time = cleanTimeStr(timings[key]) || '--:--';
        const isActive = prayerState.current?.key === key;
        const activeClass = isActive ? ' prayer-list-col--active' : '';

        return `
            <div class="prayer-list-col${activeClass}">
                <span class="prayer-list-col__name">${getPrayerName(prayer.key)}</span>
                <span class="prayer-list-col__time">${time}</span>
            </div>
        `;
    }).join('');
}

/**
 * ─────────────────────────────────────────────────────────────
 * TABLET/FOLDABLE SPECIFIC COMPONENTS (BENTO LAYOUT)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Render the Qibla Map card for the top-right bento slot.
 * Acts as a standalone map block; Leaflet is initialised
 * by home-page.js after DOM insertion.
 * @returns {string} HTML string
 */
export function renderTabletQiblaCard() {
    return renderQiblaMapCard(HOME_MAP_ID + '-tablet');
}

/**
 * Render the Mosque Hero Card for the bottom bento slot.
 * Layout: Full-width mosque image with a full-width glassmorphism 
 * bottom bar containing the featured prayer and action widgets.
 *
 * @param {object} timings     - Prayer timings
 * @param {string} orgName     - Organization display name
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
export function renderTabletMosqueCard(timings, orgName, prayerState) {
    const imgSrc = getMosqueImageSrc(prayerState?.current?.key);
    return `
        <div class="tablet-mosque-hero">
            <img
                src="${imgSrc}"
                id="tablet-mosque-img"
                alt="Masjid Istiqlal"
                class="tablet-mosque-hero__img"
                loading="lazy"
            >
            <div class="tablet-mosque-hero__bottom-bar">
                <div id="featured-prayer-container-tablet" class="tablet-mosque-hero__featured">
                    ${renderFeaturedCard(timings, prayerState)}
                </div>
                <div class="tablet-mosque-hero__actions">
                    ${renderKiblatButton('home-btn-kiblat-tablet')}
                    ${renderOrgToggle(orgName, 'org-toggle-tablet')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render the full 7-column prayer schedule grid for the bento bottom slot.
 * Uses SCHEDULE_PRAYERS to include Imsak and Terbit (excluded in mobile list).
 *
 * @param {object} timings     - Prayer timings object
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
export function renderTabletFullListCard(timings, prayerState) {
    const columnsHtml = SCHEDULE_PRAYERS.map(key => {
        const prayer = PRAYER_LIST.find(p => p.key === key);
        if (!prayer) return '';

        const time = cleanTimeStr(timings[key]) || '--:--';
        const isActive = prayerState.current?.key === key;
        const activeClass = isActive ? ' prayer-list-col--active' : '';

        return `
            <div class="prayer-list-col${activeClass}">
                <span class="prayer-list-col__name">${getPrayerName(prayer.key)}</span>
                <span class="prayer-list-col__time">${time}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="prayer-list-grid tablet-full-grid">
            ${columnsHtml}
        </div>
    `;
}

/**
 * Get the appropriate mosque image source based on the current prayer.
 * @param {string} prayerKey
 * @returns {string}
 */
export function getMosqueImageSrc(prayerKey) {
    const middayKeys = ['terbit', 'dzuhur'];
    const afternoonKeys = ['ashar'];
    const nightKeys = ['magrib', 'isya', 'imsak', 'subuh'];

    if (nightKeys.includes(prayerKey)) {
        return '/assets/mosque/mosque-night.webp';
    } else if (afternoonKeys.includes(prayerKey)) {
        return '/assets/mosque/mosque-afternoon.webp';
    } else if (middayKeys.includes(prayerKey)) {
        return '/assets/mosque/mosque-midday.webp';
    }

    // Default fallback
    return '/assets/mosque/mosque-midday.webp';
}

/**
 * Updates the tablet mosque image dynamically with a CSS opacity fade.
 * @param {object} prayerState 
 */
export function updateTabletMosqueImage(prayerState) {
    const imgEl = document.getElementById('tablet-mosque-img');
    if (!imgEl) return;

    const newSrc = getMosqueImageSrc(prayerState?.current?.key);

    if (imgEl.getAttribute('src') !== newSrc) {
        // Preload the next image to avoid blank flash during transition
        const tempImg = new Image();
        tempImg.onload = () => {
            // Initiate fade out
            imgEl.style.opacity = '0';

            // Wait for CSS transition (0.4s) to finish before swapping src
            setTimeout(() => {
                imgEl.setAttribute('src', newSrc);
                // Initiate fade in
                imgEl.style.opacity = '1';
            }, 400);
        };
        // Error handling fallback
        tempImg.onerror = () => {
            imgEl.setAttribute('src', newSrc);
        };
        tempImg.src = newSrc;
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * SCHEDULE-PAGE TABLET COMPONENTS
 * Isolated variants to avoid ID collision with home-page bento.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Schedule-page mosque hero card.
 * Only shows the "Now" featured widget inside the overlay.
 * Kiblat and Org Toggle are rendered outside by schedule-page.js.
 * @param {object} timings     - Prayer timings
 * @param {object} prayerState - Current prayer state
 * @returns {string} HTML string
 */
export function renderScheduleTabletMosqueCard(timings, prayerState) {
    const imgSrc = getMosqueImageSrc(prayerState?.current?.key);
    return `
        <div class="tablet-mosque-hero">
            <img
                src="${imgSrc}"
                id="sched-mosque-img"
                alt="Masjid Istiqlal"
                class="tablet-mosque-hero__img"
                loading="lazy"
            >
            <div class="tablet-mosque-hero__bottom-bar">
                <div id="sched-featured-tablet" class="tablet-mosque-hero__featured">
                    ${renderFeaturedCard(timings, prayerState)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Updates the schedule-page mosque image with an opacity fade.
 * Targets sched-mosque-img, independent from home's tablet-mosque-img.
 * @param {object} prayerState
 */
export function updateScheduleTabletMosqueImage(prayerState) {
    const imgEl = document.getElementById('sched-mosque-img');
    if (!imgEl) return;

    const newSrc = getMosqueImageSrc(prayerState?.current?.key);
    if (imgEl.getAttribute('src') === newSrc) return;

    const tempImg = new Image();
    tempImg.onload = () => {
        imgEl.style.opacity = '0';
        setTimeout(() => {
            imgEl.setAttribute('src', newSrc);
            imgEl.style.opacity = '1';
        }, 400);
    };
    tempImg.onerror = () => { imgEl.setAttribute('src', newSrc); };
    tempImg.src = newSrc;
}

/**
 * Render the Qibla Map card for the schedule-page tablet bento slot.
 * Uses sched-qibla-map to keep Leaflet singleton ID separate from home's map.
 * @returns {string} HTML string
 */
export function renderScheduleTabletQiblaCard() {
    return renderQiblaMapCard('sched-qibla-map');
}

