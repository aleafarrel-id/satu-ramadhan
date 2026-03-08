import { getSavedLocation } from '../core/geolocation.js';

import QiblaCompass from '../modules/compass.js';

import { renderLocationCard, bindLocationCardEvents } from '../components/card/location-card.js';
import { renderQiblaInfoCard, updateQiblaInfoCard } from '../components/card/qibla-info-card.js';
import { renderCompass, updateCompassUI } from '../components/compass/compass-dial.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { showCompassGuideModal } from '../components/modal/compass-guide-modal.js';

/* --- STATE --- */
let _container = null;
let _location = null;
let _compass = null;

/* --- LIFECYCLE --- */

/**
 * Initializes and renders the compass page.
 * Displays a skeleton UI while fetching the user's saved location
 * and preparing the Qibla compass module.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 */
export async function render(container) {
    _container = container;

    renderSkeleton();

    _location = await getSavedLocation();
    await initCompass();

    renderContent();
}

/**
 * Cleans up compass instance and frees memory
 * when navigating away from the page.
 */
export function destroy() {
    _compass?.stop();
    _compass = null;
    _container = null;
    _location = null;
}

/* --- INITIALIZATION --- */

/**
 * Instantiates the QiblaCompass module and prepares it
 * with the user's coordinates if available. Returns immediately
 * and starts tracking the device orientation.
 */
async function initCompass() {
    _compass?.stop();
    _compass = new QiblaCompass();

    if (_location?.latitude && _location?.longitude) {
        await _compass.init(_location.latitude, _location.longitude);
    }

    _compass.start();
}

/* --- RENDER METHODS --- */

/**
 * Returns the HTML string for the compass dial skeleton.
 * Shown during the initial loading phase.
 */
function getCompassSkeleton() {
    return `
        <div class="compass-outer-wrapper compass-skeleton-dial">
            <div class="skeleton skeleton--compass-dial"></div>
        </div>
    `;
}

/**
 * Returns the HTML string for the Qibla info card skeleton.
 * Displays placeholder UI below the compass dial.
 */
function getQiblaCardSkeleton() {
    return `
        <div class="card qibla-info-card compass-skeleton-qibla">
            <div class="skeleton skeleton--text-sm" style="width: 100px; margin-bottom: var(--spacing-sm)"></div>
            <div class="qibla-info-card__content">
                <div class="skeleton skeleton--icon-lg"></div>
                <div class="qibla-info-card__badges compass-skeleton-qibla__badges">
                    <div class="skeleton skeleton--badge-flex"></div>
                    <div class="skeleton skeleton--badge-flex"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Injects the complete skeleton layout into the container.
 * Assumes the container is empty.
 */
function renderSkeleton() {
    _container.innerHTML = `
        <div class="card compass-skeleton-loc">
            <div class="skeleton skeleton--text-sm" style="width: 80px; margin-bottom: var(--spacing-sm)"></div>
            <div class="compass-skeleton-loc__row">
                <div class="skeleton skeleton--icon-md"></div>
                <div class="compass-skeleton-loc__body">
                    <div class="skeleton skeleton--text-md" style="width: 50%"></div>
                    <div class="skeleton skeleton--text-base" style="width: 30%"></div>
                </div>
            </div>
        </div>
        ${getCompassSkeleton()}
        ${getQiblaCardSkeleton()}
    `;
}

/**
 * Determines if sufficient location data is available, then
 * populates the page with actual compass and location card elements.
 * Binds required event listeners immediately after insertion.
 */
function renderContent() {
    const hasData = _location?.latitude && _location?.longitude && _compass?.qiblaAngle !== null;

    _container.innerHTML = `
        ${renderLocationCard(_location)}
        
        ${hasData ? `
        <div class="compass-guide-wrapper">
            <button class="btn btn--accent-outline btn--compass-guide" id="btn-compass-guide">
                <i class='bx bx-info-circle'></i>
                <span>Panduan</span>
            </button>
        </div>
        
        <div class="compass-outer-wrapper">
            ${renderCompass()}
        </div>

        ${renderQiblaInfoCard()}
        ` : `
        ${getCompassSkeleton()}
        ${getQiblaCardSkeleton()}
        `}
    `;

    if (hasData && _compass) {
        updateCompassUI(_compass.heading, _compass.qiblaAngle);
        updateQiblaInfoCard(_compass.heading, _compass.qiblaAngle, _compass.hasGyroscope);
    }

    bindLocationCardEvents(showLocationModalForCompass, _container);
    _container.querySelector('#btn-compass-guide')?.addEventListener('click', showCompassGuideModal);
}

/* --- EVENT HANDLERS --- */

/**
 * Opens the location selection modal specifically tailored
 * for the compass page. It re-initializes the compass upon detecting
 * a new location string to ensure accurate Qibla direction.
 */
function showLocationModalForCompass() {
    showLocationModal({
        onLocationDetected: async (location) => {
            _location = location;
            renderContent();
            await initCompass();
            renderContent();
        },
        onManualSelect: () => {
            showLocationSearchModal();
        },
    });
}
