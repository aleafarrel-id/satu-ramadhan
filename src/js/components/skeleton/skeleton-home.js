/**
 * Home Page Skeleton Loader
 */

// UI Components
import { renderLocationCard, bindLocationCardEvents } from '../card/location-card.js';
import { renderPrayerCardSkeleton } from '../card/prayer-card.js';
import { t } from '../../core/i18n.js';

/**
 * Render skeleton loading state for home page
 * @param {HTMLElement} container - page container
 * @param {object|null} location - saved location (real card rendered immediately)
 * @param {Function} onLocationAction - callback when location card button is clicked
 */
export function renderHomeSkeleton(container, location, onLocationAction) {
    container.innerHTML = `
        <div class="home-bento-grid">
            <div class="home-bento-left">
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
                    <div class="schedule-title">${t('pages/home-page:schedule_today')}</div>
                    <div class="schedule-nav__arrows shadow-sm">
                        <div class="skeleton skeleton--toggle-btn"></div>
                        <div class="skeleton skeleton--toggle-btn"></div>
                    </div>
                </div>
                <div class="card card--container" id="home-schedule-wrapper">
                    ${renderPrayerCardSkeleton()}
                </div>
            </div>
            
            <!-- Tablet/Foldable Additional Layout -->
            <div class="home-bento-right">
                <div class="card qibla-map-card skeleton-bento-card skeleton-bento-card--center">
                    <div class="skeleton skeleton--bento-map"></div>
                    <div class="skeleton skeleton--text-md skeleton--w-120px"></div>
                </div>
            </div>
            <div class="home-bento-bottom">
                <div class="card skeleton-bento-card">
                     <div class="skeleton skeleton--bento-mosque"></div>
                </div>
                <div class="card card--container tablet-full-grid-wrapper">
                    <div class="skeleton-bento-grid">
                        ${Array(7).fill(0).map(() => `
                            <div class="skeleton-bento-grid-col">
                                <div class="skeleton skeleton--text-sm skeleton--w-80"></div>
                                <div class="skeleton skeleton--icon-md"></div>
                                <div class="skeleton skeleton--text-xs skeleton--w-60"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    bindLocationCardEvents(onLocationAction, container);
}
