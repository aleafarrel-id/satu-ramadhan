/**
 * Home Page Skeleton Loader
 * Renders loading placeholder while data is being fetched
 */

import { renderLocationCard, bindLocationCardEvents } from '../card/location-card.js';

/**
 * Render skeleton loading state for home page
 * @param {HTMLElement} container - page container
 * @param {object|null} location - saved location (real card rendered immediately)
 * @param {Function} onLocationAction - callback when location card button is clicked
 */
export function renderHomeSkeleton(container, location, onLocationAction) {
    container.innerHTML = `
        <!-- Location Card Real (No Skeleton) -->
        ${renderLocationCard(location)}

        <!-- Countdown Card Skeleton -->
        <div class="card countdown">
            <div class="skeleton skeleton--countdown-label"></div>
            <div class="skeleton-countdown-row">
                <div class="skeleton-col">
                    <div class="skeleton skeleton--countdown-box"></div>
                    <div class="skeleton skeleton--countdown-unit"></div>
                </div>
                <span class="countdown__separator countdown__separator--dim">:</span>
                <div class="skeleton-col">
                    <div class="skeleton skeleton--countdown-box"></div>
                    <div class="skeleton skeleton--countdown-unit"></div>
                </div>
                <span class="countdown__separator countdown__separator--dim">:</span>
                <div class="skeleton-col">
                    <div class="skeleton skeleton--countdown-box"></div>
                    <div class="skeleton skeleton--countdown-unit"></div>
                </div>
            </div>
        </div>

        <!-- Schedule Section Skeleton -->
        <div class="schedule-title">Jadwal Hari Ini</div>
        <div class="card card--container">
            <!-- Featured Prayer Skeleton -->
            <div class="card card--inner skeleton-featured skeleton--mb-md">
                <div class="skeleton skeleton--featured-icon"></div>
                <div class="skeleton-featured__body">
                    <div class="skeleton skeleton--text-md" style="width: 45%"></div>
                    <div class="skeleton skeleton--text-xl" style="width: 30%"></div>
                </div>
                <div class="skeleton skeleton--badge-lg"></div>
            </div>

            <!-- Tube Grid Skeleton (matches schedule-bottom grid) -->
            <div class="schedule-bottom">
                <!-- Tall stacked tube (col 1, rows 1-2) -->
                <div class="skeleton skeleton--tube-tall"></div>
                <!-- Org toggle row (cols 2-4, row 1) -->
                <div class="schedule-org-cell">
                    <div class="skeleton skeleton-org">
                        <div class="skeleton skeleton-org__icon"></div>
                        <div class="skeleton skeleton-org__label"></div>
                    </div>
                </div>
                <!-- 3 tubes (cols 2-4, row 2) -->
                <div class="skeleton skeleton--tube"></div>
                <div class="skeleton skeleton--tube"></div>
                <div class="skeleton skeleton--tube"></div>
            </div>
        </div>
    `;

    // Bind location card instantly so user can click "Atur" even before schedule loads
    bindLocationCardEvents(onLocationAction, container);
}
