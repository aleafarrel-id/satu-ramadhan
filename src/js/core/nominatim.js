/**
 * Nominatim API Service
 * Searches OpenStreetMap's Nominatim geocoding service with timeout handling.
 * Results are normalized to the app's standard location shape.
 */

/* ── Configuration ── */
import { CONFIG } from '../config.js';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = `${CONFIG.appName.toLowerCase().replace(/\s+/g, '-')}-app/${CONFIG.version}`;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULTS = 5;

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
            signal: controller.signal,
            headers: { 'User-Agent': USER_AGENT },
        });

        if (!response.ok) {
            throw new Error(`Nominatim HTTP ${response.status}`);
        }

        const results = await response.json();
        return results.map(normalizeResult);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('[Nominatim] Request timed out');
        } else {
            console.warn('[Nominatim] Search failed:', error.message);
        }
        throw error; // Propagate for location-search.js to handle
    } finally {
        clearTimeout(timer);
    }
}

/* ── Data Normalization ── */

/**
 * Convert a single Nominatim result to the app's standard location shape.
 * @param {object} result - Raw Nominatim result
 * @returns {object} Normalized location object
 */
function normalizeResult(result) {
    const addr = result.address || {};

    return {
        regencyId: `nominatim_${result.place_id}`,
        regencyName: addr.city || addr.town || addr.village || addr.county || result.name || 'Lokasi Tidak Diketahui',
        provinceId: null,
        provinceName: addr.state || addr.country || '',
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        source: 'nominatim',
    };
}
