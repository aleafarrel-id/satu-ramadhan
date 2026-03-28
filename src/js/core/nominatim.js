/**
 * Nominatim API Service
 */

import { CONFIG } from '../config/version-config.js';

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = `${CONFIG.appName.toLowerCase().replace(/\s+/g, '-')}-app/${CONFIG.version}`;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULTS = 5;

/**
 * Fetch JSON from Nominatim with timeout + abort handling.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function nominatimFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': USER_AGENT },
        });

        if (!response.ok) {
            throw new Error(`Nominatim HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('[Nominatim] Request timed out');
        } else {
            console.warn('[Nominatim] Request failed:', error.message);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Search Nominatim for a location query.
 * Returns normalized results matching the app's location shape.
 *
 * @param {string} query - Search query (city name, address, etc.)
 * @returns {Promise<Array<object>>} Array of normalized location objects
 */
export async function searchNominatim(query) {
    if (!query || query.trim().length < 2) return [];

    const params = new URLSearchParams({
        q: query.trim(),
        format: 'json',
        addressdetails: '1',
        limit: String(MAX_RESULTS),
        'accept-language': 'id,en-US'
    });

    const results = await nominatimFetch(`${NOMINATIM_SEARCH}?${params}`);
    return results.map(normalizeResult);
}

/**
 * Reverse-geocode GPS coordinates via Nominatim.
 * Returns a normalized location object with districtName (kecamatan/suburb/village).
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<object>} Normalized location object
 */
export async function reverseGeocodeNominatim(lat, lon) {
    const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        format: 'json',
        addressdetails: '1',
        zoom: '14', // suburb/village level detail
        'accept-language': 'id,en-US'
    });

    const result = await nominatimFetch(`${NOMINATIM_REVERSE}?${params}`);
    return normalizeResult(result);
}

/**
 * Resolve the district name (kecamatan/village/suburb) from Nominatim address.
 * Nominatim may place kecamatan in various fields depending on the area.
 * @param {object} addr - Nominatim address object
 * @returns {string}
 */
function resolveDistrictName(addr) {
    // Priority: suburb → village → town (when city exists) → municipality
    // "suburb" often maps to Kecamatan / Kelurahan in Indonesian OSM data
    return addr.suburb || addr.village || addr.neighbourhood || '';
}

/**
 * Resolve the regency/city name (Kabupaten/Kota) from Nominatim address.
 * @param {object} addr - Nominatim address object
 * @param {string} fallbackName - Fallback from result.name
 * @returns {string}
 */
function resolveRegencyName(addr, fallbackName) {
    // "city" = Kota, "county" = Kabupaten in Indonesian OSM data
    // "town" is sometimes used for smaller kota
    return addr.city || addr.county || addr.town || fallbackName || 'Lokasi Tidak Diketahui';
}

/**
 * Convert a single Nominatim result to the app's standard location shape.
 * Now includes districtName for granular kecamatan-level display.
 * @param {object} result - Raw Nominatim result
 * @returns {object} Normalized location object
 */
function normalizeResult(result) {
    const addr = result.address || {};

    const regencyName = resolveRegencyName(addr, result.name);
    const districtName = resolveDistrictName(addr);

    return {
        regencyId: `nominatim_${result.place_id}`,
        regencyName,
        districtName,
        provinceId: null,
        provinceName: addr.state || addr.country || '',
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        source: 'nominatim',
    };
}
