/**
 * Prayer List Component
 * Renders a compact horizontal prayer time grid (list view)
 * with action widgets (Kiblat + Org Toggle) and Qibla map.
 *
 * Used by home-page.js as an alternative to the tube grid view.
 */

import { PRAYER_LIST } from '../../modules/prayer/prayer-times.js';
import { SCHEDULE_PRAYERS, cleanTimeStr } from '../../utils/datetime.js';
import { renderFeaturedCard, renderOrgToggle, renderKiblatButton } from '../prayer/prayer-widgets.js';
import { renderQiblaMapCard } from './qibla-map-card.js';

/* ── Constants ── */

/**
 * The 5 main prayers shown in the compact list.
 * Derived from the centralized SCHEDULE_PRAYERS by filtering out
 * imsak and terbit, which are not wajib prayers.
 */
const LIST_PRAYERS = SCHEDULE_PRAYERS.filter(k => k !== 'imsak' && k !== 'terbit');

/** Unique map container ID to avoid collision with compass page */
const HOME_MAP_ID = 'home-qibla-map';

/* ── Public API ── */

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
            ${renderKiblatButton()}
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

/* ── Internal Render Functions ── */

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
                <span class="prayer-list-col__name">${prayer.name}</span>
                <span class="prayer-list-col__time">${time}</span>
            </div>
        `;
    }).join('');
}
