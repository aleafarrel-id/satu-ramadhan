/**
 * Settings Page Skeleton Loader
 */

/**
 * Render skeleton loading state for settings page
 * @param {HTMLElement} container - page container
 */
export function renderSettingsSkeleton(container) {
    // Generate a single list item skeleton matching `.settings-item` structure
    const renderItem = () => `
        <div class="settings-item skeleton-pointer-none">
            <div class="settings-item-info skeleton-flex-1">
                <div class="skeleton skeleton--icon-md skeleton--mr-md"></div>
                <div class="skeleton-col skeleton-flex-1 skeleton-align-start skeleton-justify-center">
                     <div class="skeleton skeleton--text-md skeleton--w-65 skeleton--mb-xs"></div>
                     <div class="skeleton skeleton--text-xs skeleton--w-45"></div>
                </div>
            </div>
            <div class="skeleton skeleton--text-sm skeleton--w-30"></div>
        </div>
    `;

    // Generate a complete settings card skeleton with N items
    const renderCard = (numItems) => {
        let itemsHtml = '';
        for (let i = 0; i < numItems; i++) {
            itemsHtml += renderItem();
            if (i < numItems - 1) {
                itemsHtml += `<div class="settings-divider"></div>`;
            }
        }
        return `
            <div class="card settings-card settings-card-spacing">
                <div class="settings-card-header skeleton--mb-sm">
                    <div class="skeleton skeleton--text-lg skeleton--w-45"></div>
                </div>
                ${itemsHtml}
            </div>
        `;
    };

    container.innerHTML = `
        <div class="settings-page">
            <h2 class="settings-title">
                <div class="skeleton skeleton--text-xl skeleton--w-30"></div>
            </h2>
            <div class="settings-desktop-grid">
                <div class="settings-desktop-left">
                    ${renderCard(1)} <!-- Location -->
                    ${renderCard(1)} <!-- Calculation -->
                    ${renderCard(1)} <!-- Preset -->
                    ${renderCard(2)} <!-- Quran -->
                    ${renderCard(1)} <!-- About -->
                </div>
                <div class="settings-desktop-right">
                    ${renderCard(2)} <!-- Display -->
                    ${renderCard(4)} <!-- General / Panel -->
                </div>
            </div>
            <div class="skeleton-col skeleton--mt-xl skeleton--mb-xl">
                <div class="skeleton skeleton--text-xs skeleton--w-120px"></div>
            </div>
        </div>
    `;
}

