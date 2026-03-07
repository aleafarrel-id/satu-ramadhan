/**
 * Schedule Page Skeleton Loader
 * Renders loading placeholder while schedule data is being fetched
 */

/**
 * Render skeleton loading state for schedule page
 * @param {HTMLElement} container - page container
 */
export function renderScheduleSkeleton(container) {
    const skeletonRows = Array.from({ length: 7 }, () => `
        <div class="schedule-prayer-row">
            <div class="skeleton skeleton--prayer-icon"></div>
            <div class="skeleton skeleton--text-sm" style="width: 30%"></div>
            <div class="skeleton skeleton--text-md skeleton--ml-auto" style="width: 18%"></div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="schedule-page">
            <!-- Featured card skeleton -->
            <div class="card card--inner skeleton-featured skeleton--mb-md">
                <div class="skeleton skeleton--featured-icon-sm"></div>
                <div class="skeleton-featured__body">
                    <div class="skeleton skeleton--text-md" style="width: 40%"></div>
                    <div class="skeleton skeleton--text-lg" style="width: 30%"></div>
                </div>
                <div class="skeleton skeleton--badge"></div>
            </div>

            <!-- Action buttons skeleton -->
            <div class="schedule-actions">
                <div class="skeleton skeleton--action-btn-fill"></div>
                <div class="skeleton skeleton--action-btn-fixed"></div>
            </div>

            <!-- Date nav skeleton -->
            <div class="schedule-nav" style="margin-top: var(--spacing-lg)">
                <div class="schedule-nav__info">
                    <div class="skeleton skeleton--text-lg" style="width: 55%"></div>
                    <div class="skeleton skeleton--text-xs skeleton--mt-sm" style="width: 40%"></div>
                </div>
                <div class="schedule-nav__arrows">
                    <div class="skeleton skeleton--nav-arrow"></div>
                    <div class="skeleton skeleton--nav-arrow"></div>
                </div>
            </div>

            <!-- Prayer rows skeleton -->
            <div class="schedule-prayers">
                ${skeletonRows}
            </div>
        </div>
    `;
}
