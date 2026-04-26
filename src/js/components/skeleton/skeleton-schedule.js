/**
 * Schedule Page Skeleton Loader
 */

// UI Components
import { renderScheduleCardSkeleton } from '../card/schedule-card.js';
import { renderLocationCard, bindLocationCardEvents } from '../card/location-card.js';

/**
 * Render skeleton loading state for schedule page
 * @param {HTMLElement} container - page container
 * @param {object|null} location - saved location (real card rendered immediately)
 * @param {Function} onLocationAction - callback when location card button is clicked
 */
export function renderScheduleSkeleton(container, location = null, onLocationAction = null) {
    container.innerHTML = `
        <div class="sched-bento-grid">
            <div class="sched-bento-left">
                <!-- Location Card Real (No Skeleton) -->
                ${renderLocationCard(location)}

                <!-- Top Carousel Skeleton (Countdown + Shortcuts) -->
                <div class="top-carousel-wrapper">
                    <div class="top-carousel" style="overflow: hidden; pointer-events: none;">
                        <div class="carousel-slide" style="flex: 0 0 100%;">
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
                        </div>
                    </div>
                </div>

                <!-- Schedule Card Skeleton -->
                ${renderScheduleCardSkeleton()}
            </div>
            
            <!-- Tablet/Foldable Additional Layout -->
            <div class="sched-bento-right">
                <!-- Tablet Mosque Hero Skeleton -->
                <div class="card skeleton-bento-card" style="margin-bottom: 0; min-height: 240px;">
                     <div class="skeleton skeleton--bento-mosque"></div>
                </div>
                
                <!-- Tablet Actions Skeleton (Kiblat + Org Toggle) -->
                <div class="sched-bento-hero-actions">
                    <div class="skeleton skeleton--action-btn-fixed" style="width: 56px;"></div>
                    <div class="skeleton skeleton--action-btn-fixed" style="flex: 1;"></div>
                </div>

                <!-- Tablet Share Card Skeleton -->
                <div class="sched-bento-share-card">
                    <div class="skeleton skeleton--action-btn-fixed" style="width: 100%; height: 50px; border-radius: var(--radius-pill);"></div>
                </div>

                <!-- Qibla Map Card Skeleton -->
                <div class="card qibla-map-card skeleton-bento-card skeleton-bento-card--center" style="margin-bottom: 0;">
                    <div class="skeleton skeleton--bento-map"></div>
                    <div class="skeleton skeleton--text-md skeleton--w-120px"></div>
                </div>
            </div>
        </div>
    `;

    if (onLocationAction) {
        bindLocationCardEvents(onLocationAction, container);
    }
}
