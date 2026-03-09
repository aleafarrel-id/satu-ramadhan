/**
 * Compass Page Skeleton Loader
 * Renders loading placeholder for compass and Qibla info
 */

import { renderLocationCard, bindLocationCardEvents } from '../card/location-card.js';

/**
 * Return inner HTML of the compass skeletons (dial + qibla card)
 */
export function getCompassSkeletonInner() {
    return `
        <div class="compass-outer-wrapper compass-skeleton-dial">
            <div class="skeleton skeleton--compass-dial"></div>
        </div>
        
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
 * Render skeleton loading state for compass page
 * @param {HTMLElement} container - page container
 * @param {object|null} location - saved location (real card rendered immediately)
 * @param {Function} onLocationAction - callback when location card button is clicked
 */
export function renderCompassSkeleton(container, location, onLocationAction) {
    container.innerHTML = `
        ${renderLocationCard(location)}
        ${getCompassSkeletonInner()}
    `;

    bindLocationCardEvents(onLocationAction, container);
}
