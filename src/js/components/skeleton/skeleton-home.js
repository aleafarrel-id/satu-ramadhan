/**
 * Home Page Skeleton Loader
 */

// UI Components
import { renderLocationCard, bindLocationCardEvents } from '../card/location-card.js';
import { renderPrayerCardSkeleton } from '../card/prayer-card.js';

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
        <div class="home-schedule-header">
            <div class="schedule-title">Jadwal Hari Ini</div>
            <div class="schedule-nav__arrows shadow-sm">
                <div class="skeleton skeleton--toggle-btn"></div>
                <div class="skeleton skeleton--toggle-btn"></div>
            </div>
        </div>
        <div class="card card--container">
            ${renderPrayerCardSkeleton()}
        </div>
    `;

    bindLocationCardEvents(onLocationAction, container);
}
