/**
 * Empty State / Error State Component
 * Reusable across pages for no-location, offline, and error scenarios.
 *
 * Buttons use `id` attributes instead of inline onclick handlers,
 * allowing callers to bind events via addEventListener after rendering.
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
 * @param {string} [options.action.id] - button id for post-render event binding
 * @param {boolean} [options.compact] - use compact variant (no card wrapper)
 * @param {object} [options.secondaryAction] - optional secondary action button
 * @param {string} [options.secondaryAction.label] - secondary button text
 * @param {string} [options.secondaryAction.icon] - secondary button icon class
 * @param {string} [options.secondaryAction.id] - secondary button id for post-render event binding
 * @returns {string} HTML string
 */
export function renderEmptyState({ icon, title, description, iconVariant, action, secondaryAction, compact = false }) {
    const iconClass = iconVariant === 'warning' ? ' empty-state__icon--warning' : '';
    const compactClass = compact ? ' empty-state--compact' : '';

    const actionHtml = action ? `
        <button class="btn btn--outline empty-state__btn"${action.id ? ` id="${action.id}"` : ''}>
            ${action.icon ? `<i class='bx ${action.icon} empty-state__btn-icon'></i>` : ''}
            <span class="empty-state__btn-label">${action.label}</span>
        </button>
    ` : '';
    
    const secondaryActionHtml = secondaryAction ? `
        <button class="btn btn--ghost empty-state__btn empty-state__btn--secondary"${secondaryAction.id ? ` id="${secondaryAction.id}"` : ''}>
            ${secondaryAction.icon ? `<i class='bx ${secondaryAction.icon} empty-state__btn-icon'></i>` : ''}
            <span class="empty-state__btn-label">${secondaryAction.label}</span>
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
                <div class="empty-state__actions">
                    ${actionHtml}
                    ${secondaryActionHtml}
                </div>
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
                <div class="empty-state__actions">
                    ${actionHtml}
                    ${secondaryActionHtml}
                </div>
            </div>
        </div>
    `;
}
