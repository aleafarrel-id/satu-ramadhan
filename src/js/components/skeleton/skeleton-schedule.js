/**
 * Schedule Page Skeleton Loader
 * Renders loading placeholder while schedule data is being fetched
 */

import { renderScheduleCardSkeleton } from '../card/schedule-card.js';

/**
 * Render skeleton loading state for schedule page
 * @param {HTMLElement} container - page container
 */
export function renderScheduleSkeleton(container) {
    container.innerHTML = renderScheduleCardSkeleton();
}
