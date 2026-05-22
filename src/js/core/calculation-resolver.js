import methodsData from '../../data/calculation-methods.json';
import countryMapData from '../../data/country-method-map.json';
import { store } from './store.js';

const KEMENAG_ID = 20;
const MWL_ID = 3;

/**
 * Get full config object for the currently active calculation method.
 * Priority: store > Kemenag (fallback)
 * @returns {object}
 */
export function getActiveMethodConfig() {
    const methodId = store.getState('settings.calculation.method');
    const targetId = methodId !== null ? methodId : KEMENAG_ID;
    const method = methodsData.methods.find(m => m.id === targetId);
    
    // Ultimate fallback if ID somehow doesn't exist in JSON
    return method || methodsData.methods.find(m => m.id === KEMENAG_ID) || methodsData.methods[0];
}

/**
 * Detect best method ID for a given ISO 3166-1 alpha-2 country code.
 * Falls back to MWL (3) if not found in map.
 * @param {string} countryCode 
 * @returns {number}
 */
export function detectMethodByCountryCode(countryCode) {
    if (!countryCode) return MWL_ID; // default global
    const code = countryCode.toUpperCase();
    return countryMapData.map[code] ?? countryMapData.default;
}

/**
 * Get the shortName label to display on org-toggle for non-Indonesia.
 * @returns {string}
 */
export function getActiveMethodShortName() {
    const config = getActiveMethodConfig();
    return config.shortName;
}

/**
 * Returns true if current location is Indonesia.
 * Used to gate preset-based features (NU/Muhammadiyah, Hijri offset).
 * @returns {boolean}
 */
export function isIndonesiaMode() {
    const loc = store.getState('location');
    const methodId = store.getState('settings.calculation.method');
    
    if (loc?.countryCode === 'ID') return true;
    if (methodId === KEMENAG_ID) return true;
    if (methodId === null && loc?.countryCode == null) return true; // Default state
    
    return false;
}

/**
 * Apply auto-detected method from country code to store.
 * Only writes if method changed or if it was previously not auto.
 * @param {string} countryCode
 */
export function applyAutoDetectedMethod(countryCode, forceReset = false) {
    const detectedId = detectMethodByCountryCode(countryCode);
    const currentMethod = store.getState('settings.calculation.method');
    let isAuto = store.getState('settings.calculation.isAutoDetected');
    
    // Fix invalid legacy state: if method is null, it MUST be auto
    if (currentMethod === null && isAuto === false) {
        isAuto = true;
    }
    
    // If user has manually overridden, don't auto-override back unless forced
    if (!forceReset && currentMethod !== null && !isAuto) {
        return;
    }
    
    if (forceReset || currentMethod !== detectedId || isAuto === false) {
        store.setState('settings.calculation.method', detectedId);
        store.setState('settings.calculation.isAutoDetected', true);
    }
}

/**
 * Manually override the calculation method.
 * Marks as isAutoDetected=false.
 * @param {number} methodId
 */
export function setManualMethod(methodId) {
    store.setState('settings.calculation.method', methodId);
    store.setState('settings.calculation.isAutoDetected', false);
}

/**
 * Reset to auto-detected method based on current country code.
 */
export function resetToAutoMethod() {
    const loc = store.getState('location');
    const countryCode = loc?.countryCode;
    
    const detectedId = detectMethodByCountryCode(countryCode);
    store.setState('settings.calculation.method', detectedId);
    store.setState('settings.calculation.isAutoDetected', true);
}
