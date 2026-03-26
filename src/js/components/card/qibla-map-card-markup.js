/**
 * Qibla Map Card Markup
 * Lightweight HTML string generator for the map container.
 * Separated from the Leaflet logic to allow code splitting and lazy loading.
 */

/**
 * Renders the HTML container for the Leaflet map card.
 * Must be inserted into the DOM before calling initQiblaMapCard().
 *
 * @param {string} [mapId='qibla-map'] — unique DOM id for the Leaflet container
 * @returns {string} HTML string
 */
export function renderQiblaMapCard(mapId = 'qibla-map') {
    return `
        <div class="card qibla-map-card">
            <div class="qibla-map-card__label">
                <i class='bx bx-map-alt'></i>
                <span>Peta Kiblat</span>
            </div>
            <div id="${mapId}" class="qibla-map-card__container"></div>
            <div id="${mapId}-loader" class="qibla-map-card__loader">
                <i class='bx bx-loader-alt bx-spin'></i>
            </div>
        </div>
    `;
}
