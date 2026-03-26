/**
 * Unified Location Search Service
 * Queries local database first, then Nominatim API as fallback.
 * Merges, deduplicates, and returns normalized location results.
 */

import { fetchRegencies, fetchProvinces } from './database.js';
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
 * Searches both regency names AND province names.
 * Priority order:
 *   1. Regencies whose name matches the query (direct match)
 *   2. Remaining regencies that belong to a province whose name matches the query
 * Duplicates are eliminated using a Set of regency IDs.
 *
 * @param {string} query
 * @returns {Promise<Array<object>>} Normalized local results
 */
async function searchLocalDB(query) {
    const [regencies, provinces] = await Promise.all([
        fetchRegencies(),
        fetchProvinces(),
    ]);

    const q = query.toLowerCase();

    // Build a quick province-id → province-name map
    const provinceMap = new Map(provinces.map(p => [p.id, p.name]));

    // Regencies whose name directly matches the query
    const regencyMatches = regencies.filter(r =>
        r.name.toLowerCase().includes(q)
    );

    // Provinces whose name matches the query
    const matchedProvinceIds = new Set(
        provinces
            .filter(p => p.name.toLowerCase().includes(q))
            .map(p => p.id)
    );

    // Regencies belonging to matched provinces (excluding already matched)
    const seenIds = new Set(regencyMatches.map(r => r.id));
    const provinceBasedMatches = matchedProvinceIds.size > 0
        ? regencies.filter(r => matchedProvinceIds.has(r.province_id) && !seenIds.has(r.id))
        : [];

    // Merge — regency-name matches first, then province-based matches
    const merged = [...regencyMatches, ...provinceBasedMatches];

    // Take top 10 and normalize
    const results = merged.slice(0, 10).map(reg => ({
        regencyId: reg.id,
        regencyName: reg.name,
        districtName: '',
        provinceId: reg.province_id,
        provinceName: provinceMap.get(reg.province_id) || null,
        latitude: reg.latitude,
        longitude: reg.longitude,
        source: 'local',
    }));

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
