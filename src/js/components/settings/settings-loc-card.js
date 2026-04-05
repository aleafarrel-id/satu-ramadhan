/**
 * Settings Location Card Component
 * Renders the location settings card with GPS and Manual buttons.
 */

// Core & Libraries
import { store } from '../../core/store.js';
import { t } from '../../core/i18n.js';

// Utilities & Helpers
import { handleGpsDetectionWithButton } from '../../utils/location-feedback.js';
import { makeAccessibleBtn } from '../../utils/a11y.js';

// UI Components
import { showLocationSearchModal } from '../modal/location-search-modal.js';

export async function render(container) {
    const savedLocation = store.getState('location');

    function renderStatus(loc) {
        if (loc) {
            const displayName = loc.districtName
                ? `${loc.districtName}, ${loc.regencyName}`
                : loc.regencyName;
            return `<div class="settings-loc-body"><div class="settings-loc-regency">${displayName}</div>${loc.provinceName ? `<div class="settings-loc-province">${loc.provinceName}</div>` : ''}</div>`;
        }
        return `<span class="settings-loc-status">${t('components/settings/settings-loc-card:not_set')}</span>`;
    }

    container.innerHTML = `
        <div class="card settings-loc-card">
            <div class="settings-loc-header" id="settings-loc-header">
                <div class="settings-loc-title">${t('components/settings/settings-loc-card:title')}</div>
                <div class="settings-loc-icon-wrapper">
                    <i class='bx bx-map settings-loc-map-icon ${savedLocation ? '' : 'unset'}'></i>
                    <div id="settings-loc-status-wrapper" class="settings-loc-status-wrapper">
                        ${renderStatus(savedLocation)}
                    </div>
                    <i class='bx bx-chevron-down settings-card-chevron'></i>
                </div>
            </div>
            <div class="settings-card-collapse">
                <div class="settings-card-collapse-inner">
                    <p class="settings-loc-desc">
                        ${t('components/settings/settings-loc-card:desc')}
                    </p>
                    <div class="settings-loc-actions">
                        <button class="btn btn--gold" id="btn-settings-gps">
                            <i class='bx bx-current-location'></i>
                            <span>${t('components/settings/settings-loc-card:btn_gps')}</span>
                        </button>
                        <button class="btn btn--outline" id="btn-settings-manual">
                            <i class='bx bx-search'></i>
                            <span>${t('components/settings/settings-loc-card:btn_manual')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const header = container.querySelector('#settings-loc-header');
    if (header) {
        makeAccessibleBtn(header, () => {
            const card = container.querySelector('.settings-loc-card');
            card?.classList.toggle('expanded');
        });
    }

    const btnGps = container.querySelector('#btn-settings-gps');
    const btnManual = container.querySelector('#btn-settings-manual');

    btnGps?.addEventListener('click', () => {
        handleGpsDetectionWithButton(btnGps, (location) => {
            store.setState('location', location);
            const statusWrapper = container.querySelector('#settings-loc-status-wrapper');
            if (statusWrapper) {
                statusWrapper.innerHTML = renderStatus(location);
            }
            const mapIcon = container.querySelector('.settings-loc-map-icon');
            if (mapIcon) {
                mapIcon.classList.remove('unset');
            }
        });
    });

    btnManual?.addEventListener('click', () => {
        showLocationSearchModal({
            onLocationSelected: (location) => {
                store.setState('location', location);
                const statusWrapper = container.querySelector('#settings-loc-status-wrapper');
                if (statusWrapper) {
                    statusWrapper.innerHTML = renderStatus(location);
                }
                const mapIcon = container.querySelector('.settings-loc-map-icon');
                if (mapIcon) {
                    mapIcon.classList.remove('unset');
                }
            },
        });
    });
}

export function destroy() {
    // cleanup if needed
}
