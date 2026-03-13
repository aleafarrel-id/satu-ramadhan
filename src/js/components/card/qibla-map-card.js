/**
 * Qibla Map Card Component
 * Interactive Leaflet map showing geodesic route
 * from the user's location to the Ka'bah.
 *
 * Exports:
 *   renderQiblaMapCard(mapId)  — returns HTML string
 *   initQiblaMapCard(mapId, lat, lng) — initializes Leaflet after DOM ready
 *   destroyQiblaMapCard()     — cleanup to prevent memory leaks
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ── Constants ── */

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
const TILE_MAX_ZOOM = 18;
const MIN_ZOOM = 2;
const WORLD_BOUNDS = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));

const GEODESIC_STEPS = 80;
const FIT_BOUNDS_PADDING = [30, 30];
const INIT_DELAY_MS = 100;

/* ── Module State ── */

let _mapInstance = null;
let _userMarker = null;
let _geodesicLine = null;

/* ── Public API ── */

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

/**
 * Initialise the Leaflet map inside the rendered container.
 * Call this after the HTML from renderQiblaMapCard() is in the DOM.
 * Uses a small delay to avoid jank during page transitions.
 *
 * @param {string} mapId — must match the id passed to renderQiblaMapCard()
 * @param {number} userLat — user's latitude
 * @param {number} userLng — user's longitude
 * @returns {Promise<L.Map|null>}
 */
export function initQiblaMapCard(mapId, userLat, userLng) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const newContainer = document.getElementById(mapId);
            if (!newContainer) { resolve(null); return; }

            // If map instance already exists, reuse it and update the markers/view.
            if (_mapInstance) {
                const cachedContainer = _mapInstance.getContainer();
                
                // If the DOM was re-rendered, swap the newly created empty container
                // with our fully intact cached Leaflet container.
                if (newContainer !== cachedContainer && newContainer.parentNode) {
                    newContainer.parentNode.replaceChild(cachedContainer, newContainer);
                }

                // Hide loader in case it was re-rendered in the parent markup
                const loader = document.getElementById(`${mapId}-loader`);
                if (loader) {
                    loader.classList.add('is-hidden');
                }

                // Update existing user marker location
                if (_userMarker) {
                    _userMarker.setLatLng([userLat, userLng]);
                }

                // Update geodesic path
                if (_geodesicLine) {
                    const path = _calcGeodesicPath(userLat, userLng, KAABA_LAT, KAABA_LNG, GEODESIC_STEPS);
                    _geodesicLine.setLatLngs(path);
                }

                _fitView(_mapInstance, userLat, userLng);
                
                // Ensure map recalculates its size after being placed in the DOM
                _mapInstance.invalidateSize();
                
                resolve(_mapInstance);
                return;
            }

            // Normal initialisation
            const map = _createMap(mapId);
            _addTileLayer(map, mapId);
            _addMarkers(map, userLat, userLng);
            _addGeodesicLine(map, userLat, userLng);
            _fitView(map, userLat, userLng);

            _mapInstance = map;
            resolve(map);
        }, INIT_DELAY_MS);
    });
}

/**
 * Destroy the Leaflet map instance and free memory.
 * Safe to call even if no map exists.
 */
export function destroyQiblaMapCard() {
    if (_mapInstance) {
        _mapInstance.remove();
        _mapInstance = null;
        _userMarker = null;
        _geodesicLine = null;
    }
}

/* ── Private Helpers ── */

/**
 * Create an interactive Leaflet map with zoom controls hidden
 * but touch/drag enabled for a usable experience.
 * @param {string} mapId
 * @returns {L.Map}
 */
function _createMap(mapId) {
    return L.map(mapId, {
        zoomControl: false,
        minZoom: MIN_ZOOM,
        maxBounds: WORLD_BOUNDS,
        maxBoundsViscosity: 1.0,
        dragging: true,
        scrollWheelZoom: true,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: false,
        keyboard: false,
        tap: true,
        attributionControl: false,
    });
}

/**
 * Add CartoDB Voyager (no labels) tile layer for a clean premium look.
 * @param {L.Map} map
 * @param {string} mapId
 */
function _addTileLayer(map, mapId) {
    const layer = L.tileLayer(TILE_URL, {
        maxZoom: TILE_MAX_ZOOM,
        noWrap: true,
        bounds: WORLD_BOUNDS,
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    // Remove the loader overlay once the tile layer is fully loaded
    layer.on('load', () => {
        const loader = document.getElementById(`${mapId}-loader`);
        if (loader) {
            loader.classList.add('is-hidden');
        }
    });
}

/**
 * Place Ka'bah icon (with decorative ring) and user pulse-dot markers.
 * Uses divIcon for both to avoid default Leaflet marker images
 * which would conflict with Capacitor app UX.
 *
 * @param {L.Map} map
 * @param {number} userLat
 * @param {number} userLng
 */
function _addMarkers(map, userLat, userLng) {
    // Ka'bah marker — small image with a glowing ring, using divIcon
    const kaabaIcon = L.divIcon({
        className: 'kaaba-marker',
        html: `
            <div class="kaaba-marker__ring">
                <img src="./assets/icon/kaaba.webp" alt="Ka'bah" class="kaaba-marker__img" />
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });

    // User marker — pulse dot, using divIcon
    const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="pulse-dot"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });

    L.marker([KAABA_LAT, KAABA_LNG], { icon: kaabaIcon, interactive: false, keyboard: false }).addTo(map);
    _userMarker = L.marker([userLat, userLng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
}

/**
 * Draw a dashed geodesic (great-circle) polyline between user and Ka'bah.
 * @param {L.Map} map
 * @param {number} userLat
 * @param {number} userLng
 */
function _addGeodesicLine(map, userLat, userLng) {
    const path = _calcGeodesicPath(userLat, userLng, KAABA_LAT, KAABA_LNG, GEODESIC_STEPS);

    _geodesicLine = L.polyline(path, {
        color: getComputedStyle(document.documentElement)
            .getPropertyValue('--clr-map-route').trim() || '#2d9e9e',
        weight: 2,
        dashArray: '6, 10',
        lineCap: 'round',
        opacity: 0.8,
        interactive: false,
    }).addTo(map);
}

/**
 * Fit the map view to show both the user and Ka'bah markers.
 * @param {L.Map} map
 * @param {number} userLat
 * @param {number} userLng
 */
function _fitView(map, userLat, userLng) {
    const bounds = L.latLngBounds(
        [userLat, userLng],
        [KAABA_LAT, KAABA_LNG],
    );
    map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING });
}

/**
 * Calculate interpolated points along the great-circle arc
 * using Spherical Linear Interpolation (SLERP).
 *
 * This produces a visually accurate curved line without any
 * additional library dependency.
 *
 * @param {number} lat1 — start latitude (degrees)
 * @param {number} lon1 — start longitude (degrees)
 * @param {number} lat2 — end latitude (degrees)
 * @param {number} lon2 — end longitude (degrees)
 * @param {number} [steps=80] — number of interpolation segments
 * @returns {Array<[number, number]>} array of [lat, lng] pairs
 */
function _calcGeodesicPath(lat1, lon1, lat2, lon2, steps = GEODESIC_STEPS) {
    const toRad = (deg) => deg * (Math.PI / 180);
    const toDeg = (rad) => rad * (180 / Math.PI);

    const φ1 = toRad(lat1);
    const λ1 = toRad(lon1);
    const φ2 = toRad(lat2);
    const λ2 = toRad(lon2);

    // Central angle via Vincenty formula (numerically stable)
    const Δλ = λ2 - λ1;
    const d = Math.atan2(
        Math.sqrt(
            (Math.cos(φ2) * Math.sin(Δλ)) ** 2 +
            (Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)) ** 2
        ),
        Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ),
    );

    const points = [];

    for (let i = 0; i <= steps; i++) {
        const f = i / steps;

        // SLERP coefficients
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);

        // Cartesian interpolation on the unit sphere
        const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
        const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
        const z = A * Math.sin(φ1) + B * Math.sin(φ2);

        const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
        const lon = toDeg(Math.atan2(y, x));

        points.push([lat, lon]);
    }

    return points;
}
