/**
 * Share Schedule Card Component
 * Renders the "Jadwal Lengkap" card.
 */

import { t } from '../../core/i18n.js';

/**
 * Render the HTML string for the full schedule card.
 *
 * @returns {string} HTML string
 */
export function renderShareScheduleCard() {
    return `
        <div class="card share-schedule-card">
            <div class="location-card__header">
                ${t('components/card/share-schedule-card:header')}
            </div>
            <div class="location-card__row">
                <i class='bx bx-share location-card__icon location-card__icon--info'></i>
                <div class="location-card__body">
                    <div class="location-card__name" style="font-weight: 600;">${t('components/card/share-schedule-card:title')}</div>
                    <div class="location-card__province">${t('components/card/share-schedule-card:desc')}</div>
                </div>
                <button class="btn btn--accent-outline location-card__action" id="btn-generate-schedule" style="display: inline-flex; align-items: center; gap: 4px;">
                    <i class='bx bx-log-in-circle'></i>
                    <span style="line-height: 1;">${t('components/card/share-schedule-card:btn')}</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Bind click events to the generate button inside the card.
 *
 * @param {Function} onGenerate - Callback when the Buat button is clicked
 * @param {Element}  [container=document] - DOM scope for querySelector
 */
export function bindShareScheduleCardEvents(onGenerate, container = document) {
    const scope = container.querySelector ? container : document;

    scope.querySelector('#btn-generate-schedule')?.addEventListener('click', () => {
        onGenerate();
    });
}
