/**
 * Schedule Page Skeleton Loader
 */

// UI Components
import { renderScheduleCardSkeleton } from '../card/schedule-card.js';

/**
 * Render skeleton loading state for schedule page
 * @param {HTMLElement} container - page container
 */
export function renderScheduleSkeleton(container) {
    container.innerHTML = renderScheduleCardSkeleton();
}
