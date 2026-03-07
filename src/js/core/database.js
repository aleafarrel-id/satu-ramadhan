/**
 * Local JSON Database Loader
 * Loads province, regency, and ramadhan config from local JSON files
 */

import provinceData from '../../data/province.json';
import regencyData from '../../data/regency.json';
import ramadhanData from '../../data/ramadhan.json';

let _provinces = null;
let _regencies = null;
let _ramadhan = null;

export function getProvinces() {
    if (!_provinces) _provinces = provinceData;
    return _provinces;
}

export function getRegencies() {
    if (!_regencies) _regencies = regencyData;
    return _regencies;
}

export function getRamadhanConfig() {
    if (!_ramadhan) _ramadhan = ramadhanData;
    return _ramadhan;
}

/**
 * Find province by ID
 */
export function getProvinceById(id) {
    return getProvinces().find(p => p.id === id) || null;
}

/**
 * Find regency by ID
 */
export function getRegencyById(id) {
    return getRegencies().find(r => r.id === id) || null;
}

/**
 * Get all regencies for a province
 */
export function getRegenciesByProvinceId(provinceId) {
    return getRegencies().filter(r => r.province_id === provinceId);
}
