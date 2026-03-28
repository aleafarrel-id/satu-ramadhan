/**
 * Location Card Component
 * Reusable across Home and Compass pages.
 */

/**
 * Render the full location card with "LOKASI ANDA" header
 * @param {object|null} location - saved location object { regencyName, provinceName, ... }
 * @returns {string} HTML string
 */
export function renderLocationCard(location) {
    return `
        <div class="card location-card">
            <div class="location-card__header">
                LOKASI ANDA
            </div>
            <div id="location-card-content">
                ${renderLocationCardInner(location)}
            </div>
        </div>
    `;
}

/**
 * Render location card inner content (updatable)
 * @param {object|null} location - saved location object
 * @returns {string} HTML string
 */
export function renderLocationCardInner(location) {
    if (!location) {
        return `
            <div class="location-card__row">
                <i class='bx bx-map location-card__icon location-card__icon--muted'></i>
                <div class="location-card__body">
                    <div class="location-card__name">Lokasi belum diatur</div>
                    <div class="location-card__hint">Ketuk untuk mengatur lokasi</div>
                </div>
                <button class="btn btn--accent-outline location-card__action" id="btn-change-location">
                    <i class='bx bx-current-location'></i>
                    <span>Atur</span>
                </button>
            </div>
        `;
    }

    const name = location.districtName
        ? `${location.districtName}, ${location.regencyName}`
        : location.regencyName;
    const province = location.provinceName || '';

    return `
        <div class="location-card__row">
            <i class='bx bx-map location-card__icon location-card__icon--info'></i>
            <div class="location-card__body">
                <div class="location-card__name">${name}</div>
                ${province ? `<div class="location-card__province">${province}</div>` : ''}
            </div>
            <button class="btn btn--accent-outline location-card__action" id="btn-change-location">
                <i class='bx bx-cog'></i>
                <span>Ubah</span>
            </button>
        </div>
    `;
}

/**
 * Bind click event on the change-location button
 * @param {Function} onChangeLocation - callback when button is clicked
 * @param {Element} [container=document] - scope element to query within
 */
export function bindLocationCardEvents(onChangeLocation, container = document) {
    (container.querySelector ? container : document).querySelector('#btn-change-location')?.addEventListener('click', () => {
        onChangeLocation();
    });
}
