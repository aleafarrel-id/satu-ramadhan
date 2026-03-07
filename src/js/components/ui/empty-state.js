/**
 * Empty State / Error State Component
 * Reusable across pages for no-location, offline, and error scenarios
 */

/**
 * Render an empty/error state
 * @param {object} options
 * @param {string} options.icon - Boxicons class (e.g. 'bx-map-pin', 'bx-wifi-off')
 * @param {string} options.title - heading text
 * @param {string} options.description - body text
 * @param {string} [options.iconVariant] - 'warning' for accent color icon
 * @param {object} [options.action] - optional action button
 * @param {string} [options.action.label] - button text
 * @param {string} [options.action.icon] - button icon class
 * @param {string} [options.action.onclick] - inline onclick handler
 * @param {boolean} [options.compact] - use compact variant (no card wrapper)
 * @returns {string} HTML string
 */
export function renderEmptyState({ icon, title, description, iconVariant, action, compact = false }) {
    const iconClass = iconVariant === 'warning' ? ' empty-state__icon--warning' : '';
    const compactClass = compact ? ' empty-state--compact' : '';

    const actionHtml = action ? `
        <button class="btn btn--outline empty-state__btn"${action.onclick ? ` onclick="${action.onclick}"` : ''}>
            ${action.icon ? `<i class='bx ${action.icon} empty-state__btn-icon'></i>` : ''}
            <span class="empty-state__btn-label">${action.label}</span>
        </button>
    ` : '';

    if (compact) {
        return `
            <div class="card empty-state${compactClass}">
                <div class="empty-state__icon${iconClass}">
                    <i class='bx ${icon}'></i>
                </div>
                <h3 class="empty-state__title">${title}</h3>
                <p class="empty-state__desc">${description}</p>
                ${actionHtml}
            </div>
        `;
    }

    return `
        <div class="empty-state">
            <div class="empty-state__card">
                <div class="empty-state__icon${iconClass}">
                    <i class='bx ${icon}'></i>
                </div>
                <h3 class="empty-state__title">${title}</h3>
                <p class="empty-state__desc">${description}</p>
                ${actionHtml}
            </div>
        </div>
    `;
}
