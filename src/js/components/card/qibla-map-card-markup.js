/**
 * Qibla Map Card Markup Component
 * Lightweight HTML string generator for the map container.
 */

import { t } from '../../core/i18n.js';
import { store } from '../../core/store.js';

/**
 * Renders the HTML container for the Leaflet map card.
 * Must be inserted into the DOM before calling initQiblaMapCard().
 * Reads the persisted lock state so the icon is correct on first render.
 *
 * @param {string} [mapId='qibla-map'] — unique DOM id for the Leaflet container
 * @returns {string} HTML string
 */
export function renderQiblaMapCard(mapId = 'qibla-map') {
    const isLocked = store.getState('map.isLocked') !== false; // default true
    const lockIconClass = isLocked ? 'bx bx-lock' : 'bx bx-lock-open';
    const lockBtnClass = isLocked ? 'is-locked' : '';
    const lockLabel = t('components/card/qibla-map-card:lock_map');

    return `
        <div class="card qibla-map-card">
            <div class="qibla-map-card__label">
                <i class='bx bx-map-alt'></i>
                <span>${t('components/card/qibla-map-card:title')}</span>
            </div>
            <div id="${mapId}" class="qibla-map-card__container"></div>
            <button class="qibla-map-card__reset hidden" aria-label="${t('components/card/qibla-map-card:reset_map')}" data-focus-item>
                <i class='bx bx-reset'></i>
            </button>
            <button class="qibla-map-card__lock ${lockBtnClass}" aria-label="${lockLabel}" data-focus-item>
                <i class='${lockIconClass}'></i>
            </button>
            <div class="qibla-map-card__loader">
                <i class='bx bx-loader-alt bx-spin'></i>
            </div>
        </div>
    `;
}
