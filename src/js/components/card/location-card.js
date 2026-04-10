/**
 * Location Card Component
 * Reusable across Home and Compass pages.
 */

import { t, loadNS } from '../../core/i18n.js';
import { escapeHtml } from '../../utils/sanitize.js';

const NS = 'components/card/location-card';

/** Ensure namespace is loaded before any render call. */
async function ensureNS() {
    await loadNS(NS);
}

/**
 * Render the full location card with header (synchronous).
 *
 * Safe to call only AFTER the namespace has already been loaded
 * (i.e., after `await loadNS('components/card/location-card')` has been
 * called in the page's render() function).
 *
 * @param {object|null} location - saved location object { regencyName, provinceName, ... }
 * @returns {string} HTML string
 */
export function renderLocationCard(location) {
    return `
        <div class="card location-card">
            <div class="location-card__header">
                ${t('components/card/location-card:header')}
            </div>
            <div id="location-card-content">
                ${renderLocationCardInner(location)}
            </div>
        </div>
    `;
}

/**
 * Render the full location card with header (async version).
 *
 * Loads the namespace itself before rendering. Use this when you cannot
 * guarantee that the namespace is already loaded (e.g., in components
 * that load independently from a page lifecycle).
 *
 * @param {object|null} location - saved location object { regencyName, provinceName, ... }
 * @returns {Promise<string>} HTML string
 */
export async function renderLocationCardAsync(location) {
    await ensureNS();
    return renderLocationCard(location);
}

/**
 * Render location card inner content (updatable)
 * @param {object|null} location - saved location object
 * @returns {string} HTML string
 */
export function renderLocationCardInner(location) {
    if (!location) {
        return `
            <div class="location-card__row">
                <i class='bx bx-map location-card__icon location-card__icon--muted'></i>
                <div class="location-card__body">
                    <div class="location-card__name">${t('components/card/location-card:not_set')}</div>
                    <div class="location-card__hint">${t('components/card/location-card:hint')}</div>
                </div>
                <button class="btn btn--accent-outline location-card__action" id="btn-change-location">
                    <i class='bx bx-current-location'></i>
                    <span>${t('components/card/location-card:btn_set')}</span>
                </button>
            </div>
        `;
    }

    const name = location.districtName
        ? `${escapeHtml(location.districtName)}, ${escapeHtml(location.regencyName)}`
        : escapeHtml(location.regencyName);
    const province = escapeHtml(location.provinceName || '');

    return `
        <div class="location-card__row">
            <i class='bx bx-map location-card__icon location-card__icon--info'></i>
            <div class="location-card__body">
                <div class="location-card__name">${name}</div>
                ${province ? `<div class="location-card__province">${province}</div>` : ''}
            </div>
            <button class="btn btn--accent-outline location-card__action" id="btn-change-location">
                <i class='bx bx-cog'></i>
                <span>${t('components/card/location-card:btn_change')}</span>
            </button>
        </div>
    `;
}

/**
 * Bind click event on the change-location button
 * @param {Function} onChangeLocation - callback when button is clicked
 * @param {Element} [container=document] - scope element to query within
 */
export function bindLocationCardEvents(onChangeLocation, container = document) {
    (container.querySelector ? container : document).querySelector('#btn-change-location')?.addEventListener('click', () => {
        onChangeLocation();
    });
}
