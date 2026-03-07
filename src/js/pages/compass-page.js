/**
 * Compass Page
 * Qibla direction compass with location card
 */

import { getSavedLocation } from '../core/geolocation.js';

import QiblaCompass from '../modules/compass.js';

import { renderLocationCard, bindLocationCardEvents } from '../components/card/location-card.js';
import { renderQiblaInfoCard, updateQiblaInfoCard } from '../components/card/qibla-info-card.js';
import { renderCompass, updateCompassUI } from '../components/compass/compass-dial.js';
import { showLocationModal } from '../components/modal/location-modal.js';
import { showLocationSearchModal } from '../components/modal/location-search-modal.js';
import { showCompassGuideModal } from '../components/modal/compass-guide-modal.js';

let _container = null;
let _location = null;
let _compass = null;

/**
 * Render the compass page
 */
export async function render(container) {
    _container = container;

    // Show skeleton immediately while awaiting data
    renderSkeleton();

    // Load saved location
    _location = await getSavedLocation();

    // Initialize compass with qibla direction + device heading
    // This fetches the actual qibla direction from API. We wait for it
    // so the initial render already has the correct degree, preventing animation from 0.
    await initCompass();

    // Render final content and apply values synchronously
    renderContent();
}

/**
 * Initialize or reinitialize the qibla compass
 */
async function initCompass() {
    // Clean up previous instance
    _compass?.stop();
    _compass = new QiblaCompass();

    if (_location?.latitude && _location?.longitude) {
        // Safe to call even before DOM exists, updates will fail gracefully
        await _compass.init(_location.latitude, _location.longitude);
    }

    _compass.start();
}

/**
 * Get Compass Dial Skeleton HTML
 */
function getCompassSkeleton() {
    return `
        <div class="compass-outer-wrapper compass-skeleton-dial">
            <div class="skeleton skeleton--compass-dial"></div>
        </div>
    `;
}

/**
 * Get Qibla Info Card Skeleton HTML
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
 * Render skeleton loading state
 */
function renderSkeleton() {
    _container.innerHTML = `
        <!-- Location Card Skeleton -->
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
 * Render page content
 */
function renderContent() {
    // Determine if we have acquired full data to show the compass and angles
    const hasData = _location?.latitude && _location?.longitude && _compass?.qiblaAngle !== null;

    _container.innerHTML = `
        <!-- Location Card -->
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

        <!-- Qibla Info Card -->
        ${renderQiblaInfoCard()}
        ` : `
        ${getCompassSkeleton()}
        ${getQiblaCardSkeleton()}
        `}
    `;

    // Immediately apply the correct angles before browser paints,
    // avoiding the initial transition animation from 0deg.
    if (hasData && _compass) {
        updateCompassUI(_compass.heading, _compass.qiblaAngle);
        updateQiblaInfoCard(_compass.heading, _compass.qiblaAngle, _compass.hasGyroscope);
    }

    // Bind location card button (always interactive even without data)
    bindLocationCardEvents(showLocationModalForCompass, _container);
    _container.querySelector('#btn-compass-guide')?.addEventListener('click', showCompassGuideModal);
}

/**
 * Show location modal and handle result
 */
function showLocationModalForCompass() {
    showLocationModal({
        onLocationDetected: async (location) => {
            _location = location;
            // Show skeleton for compass block while fetching qibla mapping after location change
            renderContent();
            await initCompass();
            renderContent();
        },
        onManualSelect: () => {
            showLocationSearchModal();
        },
    });
}

/**
 * Cleanup
 */
export function destroy() {
    _compass?.stop();
    _compass = null;
    _container = null;
    _location = null;
}
