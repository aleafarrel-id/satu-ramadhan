/**
 * Magnetic Declination Service
 * Converts Magnetic North → True North using World Magnetic Model (WMM).
 */

import geomagnetism from 'geomagnetism';

/** @type {Map<string, number>} coordinate key → declination degrees */
const _cache = new Map();

/**
 * Get magnetic declination for coordinates.
 * Positive = magnetic north east of true north.
 * True Heading = Magnetic Heading + Declination.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {number} declination in degrees (cached per location)
 */
export function getMagneticDeclination(latitude, longitude) {
    const key = `${latitude.toFixed(2)}_${longitude.toFixed(2)}`;

    if (_cache.has(key)) {
        return _cache.get(key);
    }

    try {
        const model = geomagnetism.model(new Date());
        const info = model.point([latitude, longitude]);
        const declination = info.decl ?? 0;

        _cache.set(key, declination);
        console.log(`[Compass] Declination (${latitude.toFixed(2)}, ${longitude.toFixed(2)}): ${declination.toFixed(2)}°`);

        return declination;
    } catch (err) {
        console.warn('[Compass] Declination calculation failed:', err);
        return 0;
    }
}
