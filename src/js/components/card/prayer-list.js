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
    return `
        <div class="tablet-mosque-hero">
            <img
                src="/assets/mosque/mosque-midday.webp"
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
