/**
 * Home Page Skeleton Loader
 * Renders loading placeholder while data is being fetched
 */

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
                <button class="schedule-nav__btn schedule-nav__btn--prev active" disabled>
                    <i class='bx bx-grid-alt'></i>
                </button>
                <button class="schedule-nav__btn schedule-nav__btn--next" disabled>
                    <i class='bx bx-list-ul'></i>
                </button>
            </div>
        </div>
        <div class="card card--container">
            ${renderPrayerCardSkeleton()}
        </div>
    `;

    // Bind location card instantly so user can click "Atur" even before schedule loads
    bindLocationCardEvents(onLocationAction, container);
}
