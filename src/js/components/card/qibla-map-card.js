/**
 * Qibla Map Card Component
 * Interactive Leaflet map showing geodesic route
 * from the user's location to the Ka'bah.
 */

// Core & Libraries
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { store } from '../../core/store.js';

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
const OFFLINE_TILE_URL = './assets/tiles/fallback/{z}/{x}/{y}.png';
const TILE_MAX_ZOOM = 18;
const OFFLINE_MAX_ZOOM = 3;
const MIN_ZOOM = 2;
const WORLD_BOUNDS = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));

const GEODESIC_STEPS = 80;
const FIT_BOUNDS_PADDING = [30, 30];
const INIT_DELAY_MS = 100;

let _mapInstance = null;
let _tileLayer = null;
let _userMarker = null;
let _geodesicLine = null;
let _currentUserLat = null;
let _currentUserLng = null;
let _isProgrammaticMove = false;
let _unsubStore = null;

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
    _currentUserLat = userLat;
    _currentUserLng = userLng;

    return new Promise((resolve) => {
        setTimeout(() => {
            const newContainer = document.getElementById(mapId);
            if (!newContainer) { resolve(null); return; }

            if (_mapInstance) {
                const cachedContainer = _mapInstance.getContainer();
                
                if (newContainer !== cachedContainer && newContainer.parentNode) {
                    newContainer.parentNode.replaceChild(cachedContainer, newContainer);
                }

                const card = cachedContainer.closest('.qibla-map-card');
                if (card) {
                    const loader = card.querySelector('.qibla-map-card__loader');
                    if (loader) {
                        loader.classList.add('is-hidden');
                    }

                    const resetBtn = card.querySelector('.qibla-map-card__reset');
                    if (resetBtn) {
                        resetBtn.classList.add('hidden');
                    }
                }

                // Update existing user marker location
                if (_userMarker) {
                    _userMarker.setLatLng([userLat, userLng]);
                }

                if (_geodesicLine) {
                    const path = _calcGeodesicPath(userLat, userLng, KAABA_LAT, KAABA_LNG, GEODESIC_STEPS);
                    _geodesicLine.setLatLngs(path);
                }

                _handleNetworkChange();
                _fitView(_mapInstance, userLat, userLng);
                
                _bindResetButton(card);
                
                _mapInstance.invalidateSize();
                
                resolve(_mapInstance);
                return;
            }

            // Normal initialisation
            const map = _createMap(mapId);
            const container = map.getContainer();
            const card = container.closest('.qibla-map-card');

            _addTileLayer(map, card);
            _addMarkers(map, userLat, userLng);
            _addGeodesicLine(map, userLat, userLng);
            _bindResetButton(card);
            
            _mapInstance = map;
            
            _handleNetworkChange();
            _fitView(map, userLat, userLng);

            _unsubStore = store.subscribe('network.isOffline', () => {
                _handleNetworkChange();
            });

            resolve(map);
        }, INIT_DELAY_MS);
    });
}

/**
 * Destroy the Leaflet map instance and free memory.
 * Safe to call even if no map exists.
 */
export function destroyQiblaMapCard() {
    if (_unsubStore) {
        store.unsubscribe(_unsubStore);
        _unsubStore = null;
    }

    if (_mapInstance) {
        _mapInstance.remove();
        _mapInstance = null;
        _tileLayer = null;
        _userMarker = null;
        _geodesicLine = null;
    }
}

/**
 * Create an interactive Leaflet map with zoom controls hidden
 * but touch/drag enabled for a usable experience.
 * @param {string} mapId
 * @returns {L.Map}
 */
function _createMap(mapId) {
    const map = L.map(mapId, {
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

    map.on('dragstart', _showResetButton);
    map.on('zoomstart', _showResetButton);

    return map;
}

/**
 * Add CartoDB Voyager (no labels) tile layer for a clean premium look.
 * @param {L.Map} map
 * @param {HTMLElement|null} card
 */
function _addTileLayer(map, card) {
    const isOnline = navigator.onLine;
    const url = isOnline ? TILE_URL : OFFLINE_TILE_URL;

    _tileLayer = L.tileLayer(url, {
        maxZoom: TILE_MAX_ZOOM,
        noWrap: true,
        bounds: WORLD_BOUNDS,
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        updateWhenIdle: false,
        keepBuffer: 6,
    }).addTo(map);

    // Safeguard: If the tile layer fails to load (e.g. fake online), trigger global offline state
    _tileLayer.on('tileerror', () => {
        const isOffline = store.getState('network.isOffline');
        if (!isOffline) {
            console.warn('[Map] Tile error detected while onLine. Forcing global offline mode.');
            store.setState('network.isOffline', true);
        }
    });

    // Remove the loader overlay once the tile layer is fully loaded
    _tileLayer.on('load', () => {
        if (card) {
            const loader = card.querySelector('.qibla-map-card__loader');
            if (loader) {
                loader.classList.add('is-hidden');
            }
        }
    });
}

/**
 * Place Ka'bah icon (with decorative ring) and user pulse-dot markers.
 *
 * @param {L.Map} map
 * @param {number} userLat
 * @param {number} userLng
 */
function _addMarkers(map, userLat, userLng) {
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
    _isProgrammaticMove = true;
    const userPoint = L.latLng(userLat, userLng);
    const kaabaPoint = L.latLng(KAABA_LAT, KAABA_LNG);
    const bounds = L.latLngBounds(userPoint, kaabaPoint);
    
    const isOffline = store.getState('network.isOffline');
    const maxZoomOpt = isOffline ? OFFLINE_MAX_ZOOM : null;

    // Calculate distance to determine if fitting both points is viable UX-wise
    const distanceKm = userPoint.distanceTo(kaabaPoint) / 1000;
    const targetZoom = map.getBoundsZoom(bounds, false, FIT_BOUNDS_PADDING) || 0;
    
    // If the user is very far from the Kaaba (e.g. > 3000km) or the resulting zoom is too low (< 4),
    // mapping both will often center on vast empty spaces (like oceans).
    // Instead, prioritize showing the user's local context to make the Qibla direction useful.
    if (targetZoom < 4 || distanceKm > 3000) {
        // When online, zoom 6 provides a good balance between local context and the direction of the line.
        // When offline, we respect the limit by falling back to OFFLINE_MAX_ZOOM.
        const focusZoom = isOffline ? OFFLINE_MAX_ZOOM : 6;
        map.setView(userPoint, focusZoom, { animate: true });
    } else {
        map.fitBounds(bounds, { 
            padding: FIT_BOUNDS_PADDING,
            maxZoom: maxZoomOpt
        });
    }
    
    map.once('moveend', () => {
        setTimeout(() => {
            _isProgrammaticMove = false;
        }, 50);
    });
}

/**
 * Show the reset button if user interacted with the map.
 */
function _showResetButton() {
    if (_isProgrammaticMove) return;
    if (!_mapInstance) return;
    const container = _mapInstance.getContainer();
    const card = container.closest('.qibla-map-card');
    if (card) {
        const btn = card.querySelector('.qibla-map-card__reset');
        if (btn) btn.classList.remove('hidden');
    }
}

/**
 * Handle network availability to toggle between offline and online map rendering smoothly.
 */
function _handleNetworkChange() {
    if (!_mapInstance || !_tileLayer) return;

    const isOffline = store.getState('network.isOffline');

    if (!isOffline) {
        _tileLayer.setUrl(TILE_URL);
        _mapInstance.setMaxZoom(TILE_MAX_ZOOM);
        
        _mapInstance.touchZoom.enable();
        _mapInstance.doubleClickZoom.enable();
        _mapInstance.scrollWheelZoom.enable();
    } else {
        _tileLayer.setUrl(OFFLINE_TILE_URL);
        _mapInstance.setMaxZoom(OFFLINE_MAX_ZOOM);
        
        if (_mapInstance.getZoom() > OFFLINE_MAX_ZOOM) {
            _mapInstance.setZoom(OFFLINE_MAX_ZOOM);
        }

        _mapInstance.touchZoom.disable();
        _mapInstance.doubleClickZoom.disable();
        _mapInstance.scrollWheelZoom.disable();
    }
}

/**
 * Bind the reset button event listener.
 * @param {HTMLElement|null} card 
 */
function _bindResetButton(card) {
    if (!card) return;
    const btn = card.querySelector('.qibla-map-card__reset');
    if (!btn) return;

    btn.removeEventListener('click', _handleResetClick);
    btn.addEventListener('click', _handleResetClick);
}

/**
 * Handle reset button click.
 */
function _handleResetClick() {
    if (!_mapInstance) return;
    const container = _mapInstance.getContainer();
    const card = container.closest('.qibla-map-card');
    if (card) {
        const btn = card.querySelector('.qibla-map-card__reset');
        if (btn) btn.classList.add('hidden');
    }
    _fitView(_mapInstance, _currentUserLat, _currentUserLng);
}

/**
 * Calculate interpolated points along the great-circle arc.
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
