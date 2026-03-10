/**
 * Unified Location Search Service
 * Queries local database first, then Nominatim API as fallback.
 * Merges, deduplicates, and returns normalized location results.
 */

import { fetchRegencies, getProvinceById } from './database.js';
import { searchNominatim } from './nominatim.js';

/* ── Configuration ── */
const DEDUP_DISTANCE_KM = 30; // Consider locations within 30km as duplicates

/* ── Haversine (lightweight copy for dedup) ── */

/**
 * Quick Haversine distance (km) for deduplication checks
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
function haversineQuick(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => d * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Local Search ── */

/**
 * Search the local regency database by name (case-insensitive).
 * @param {string} query
 * @returns {Promise<Array<object>>} Normalized local results
 */
async function searchLocalDB(query) {
    const regencies = await fetchRegencies();
    const q = query.toLowerCase();

    const matches = regencies.filter(r =>
        r.name.toLowerCase().includes(q)
    );

    // Normalize to standard location shape and resolve province names
    const results = await Promise.all(
        matches.slice(0, 10).map(async (reg) => {
            const province = await getProvinceById(reg.province_id);
            return {
                regencyId: reg.id,
                regencyName: reg.name,
                provinceId: reg.province_id,
                provinceName: province?.name || null,
                latitude: reg.latitude,
                longitude: reg.longitude,
                source: 'local',
            };
        })
    );

    return results;
}

/* ── Deduplication ── */

/**
 * Check if a Nominatim result is a duplicate of any local result.
 * A result is considered duplicate if name is similar AND coordinates are close.
 *
 * @param {object} nomResult - Nominatim normalized result
 * @param {Array<object>} localResults - Array of local results
 * @returns {boolean}
 */
function isDuplicate(nomResult, localResults) {
    const nomName = nomResult.regencyName.toLowerCase();

    return localResults.some(local => {
        const localName = local.regencyName.toLowerCase();
        const nameMatch = localName.includes(nomName) || nomName.includes(localName);

        if (!nameMatch) return false;

        return haversineQuick(
            nomResult.latitude, nomResult.longitude,
            local.latitude, local.longitude
        ) < DEDUP_DISTANCE_KM;
    });
}

/* ── Public API ── */

/**
 * Search for locations using local database first, then Nominatim fallback.
 * Returns merged and deduplicated results with local results prioritized.
 *
 * @param {string} query - Search query string
 * @returns {Promise<Array<object>>} Normalized location results
 */
export async function searchLocation(query) {
    if (!query || query.trim().length < 2) return [];

    const trimmed = query.trim();

    // Step 1: Always search local DB (instant, offline)
    const localResults = await searchLocalDB(trimmed);

    // Step 2: Search Nominatim concurrently for broader coverage
    let nominatimResults = [];
    let apiError = null;

    try {
        nominatimResults = await searchNominatim(trimmed);
    } catch (err) {
        apiError = err;
    }

    // If both local and API fail (or API fails while offline), throw the error
    // so the UI can show a network error instead of an empty state.
    if (localResults.length === 0 && apiError) {
        throw apiError;
    }

    // Step 3: Deduplicate — remove Nominatim results that match local ones
    const uniqueNominatim = nominatimResults.filter(
        nom => !isDuplicate(nom, localResults)
    );

    // Step 4: Merge — local results first, then unique Nominatim results
    return [...localResults, ...uniqueNominatim];
}
