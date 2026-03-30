/* Lazy-loaded CSS — only fetched when this page module is imported */
import '../../css/pages/compass.css';
import '../../css/components/compass/compass-dial.css';
import '../../css/components/card/qibla-info-card.css';
import '../../css/components/card/qibla-map-card.css';
import '../../css/components/modal/compass-guide-modal.css';

import { store } from '../core/store.js';

import QiblaCompass from '../modules/compass/compass.js';

import { renderLocationCard, bindLocationCardEvents } from '../components/card/location-card.js';
import { renderQiblaInfoCard, updateQiblaInfoCard } from '../components/card/qibla-info-card.js';
import { renderQiblaMapCard } from '../components/card/qibla-map-card-markup.js';
import { initQiblaMapCard, destroyQiblaMapCard } from '../components/card/qibla-map-card.js';
import { renderCompass, updateCompassUI } from '../components/compass/compass-dial.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { showCompassGuideModal } from '../components/modal/compass-guide-modal.js';
import { renderCompassSkeleton, getCompassSkeletonInner } from '../components/skeleton/skeleton-compass.js';
import { renderEmptyState } from '../components/ui/empty-state.js';

/* --- STATE --- */
let _container = null;
let _compass = null;
let _unsubscribeId = null;

/* --- LIFECYCLE --- */

/**
 * Initializes and renders the compass page.
 * Displays a skeleton UI while fetching the user's saved location
 * and preparing the Qibla compass module.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 */
export async function render(container, options = {}) {
    _container = container;
    
    if (_unsubscribeId) {
        store.unsubscribe(_unsubscribeId);
        _unsubscribeId = null;
    }
    
    const loc = store.getState('location');
    renderCompassSkeleton(_container, loc, showLocationModalForCompass);

    if (options.refresh) {
        await new Promise(resolve => setTimeout(resolve, 350));
    }

    await initCompass(loc);
    renderContent(loc);

    _unsubscribeId = store.subscribe('location', async () => {
        const newLoc = store.getState('location');
        renderCompassSkeleton(_container, newLoc, showLocationModalForCompass);
        await initCompass(newLoc);
        renderContent(newLoc);
    });
}

/**
 * Cleans up compass instance and frees memory
 * when navigating away from the page.
 */
export function destroy() {
    destroyQiblaMapCard();
    if (_unsubscribeId) {
        store.unsubscribe(_unsubscribeId);
        _unsubscribeId = null;
    }
    _compass?.stop();
    _compass = null;
    _container = null;
}

/* --- INITIALIZATION --- */

/**
 * Instantiates the QiblaCompass module and prepares it
 * with the user's coordinates if available. Returns immediately
 * and starts tracking the device orientation.
 */
async function initCompass(loc) {
    _compass?.stop();
    _compass = new QiblaCompass();

    if (loc?.latitude && loc?.longitude) {
        await _compass.init(loc.latitude, loc.longitude);
    }

    _compass.start();
}

/* --- RENDER METHODS --- */

/**
 * Returns the HTML string for the compass dial skeleton.
 * Shown during the initial loading phase.
 */


/**
 * Determines if sufficient location data is available, then
 * populates the page with actual compass and location card elements.
 * Binds required event listeners immediately after insertion.
 */
function renderContent(loc) {
    if (!loc) {
        _container.innerHTML = `
            ${renderLocationCard(loc)}
            ${renderEmptyState({
            icon: 'bx-map-pin',
            title: 'Lokasi Belum Diatur',
            description: 'Arah kiblat akan ditampilkan setelah lokasi Anda diatur.',
            compact: true,
        })}
            <div class="compass-skeleton-placeholder">
                ${getCompassSkeletonInner()}
            </div>
        `;
        bindLocationCardEvents(showLocationModalForCompass, _container);
        return;
    }

    const hasData = loc?.latitude && loc?.longitude && _compass?.qiblaAngle !== null;

    if (!hasData) {
        _container.innerHTML = `
            ${renderLocationCard(loc)}
            ${renderEmptyState({
            icon: 'bx-compass',
            iconVariant: 'warning',
            title: 'Kompas Tidak Tersedia',
            description: 'Arah kiblat tidak dapat dihitung atau sensor gyroscope tidak tersedia.',
            compact: true,
        })}
            <div class="compass-skeleton-placeholder">
                ${getCompassSkeletonInner()}
            </div>
        `;
        bindLocationCardEvents(showLocationModalForCompass, _container);
        return;
    }

    _container.innerHTML = `
        ${renderQiblaMapCard('qibla-mini-map')}
        ${renderLocationCard(loc)}
        
        <div class="compass-outer-wrapper">
            ${renderCompass()}
        </div>

        ${renderQiblaInfoCard()}
    `;

    if (hasData && _compass) {
        updateCompassUI(_compass.heading, _compass.qiblaAngle);
        updateQiblaInfoCard(_compass.heading, _compass.qiblaAngle, _compass.hasGyroscope);
    }

    bindLocationCardEvents(showLocationModalForCompass, _container);
    _container.querySelector('#btn-compass-guide')?.addEventListener('click', showCompassGuideModal);

    /* Initialise map card after DOM is ready */
    if (loc?.latitude && loc?.longitude) {
        initQiblaMapCard('qibla-mini-map', loc.latitude, loc.longitude);
    }
}

/* --- EVENT HANDLERS --- */

/**
 * Opens the location selection modal specifically tailored
 * for the compass page. It re-initializes the compass upon detecting
 * a new location string to ensure accurate Qibla direction.
 */
function showLocationModalForCompass() {
    showLocationModal({
        onLocationDetected: (location) => {
            store.setState('location', location);
        },
        onManualSelect: () => {
            showLocationSearchModal({
                onLocationSelected: (location) => {
                    store.setState('location', location);
                },
            });
        },
    });
}
