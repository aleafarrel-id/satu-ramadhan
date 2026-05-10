/**
 * Local JSON Database Loader
 */

import { logError } from '../utils/error-boundary.js';
import { getCachedRemoteConfig } from '../modules/network/remote-config.js';

let _provinces = null;
let _regencies = null;
let _ramadhan = null;

/**
 * Fetch and cache the province list.
 * @returns {Promise<Array>}
 */
export async function fetchProvinces() {
    if (_provinces) return _provinces;

    try {
        const res = await fetch('./data/province.json');
        _provinces = await res.json();
    } catch (e) {
        logError('[DB]', e);
        _provinces = [];
    }

    return _provinces;
}

/**
 * Fetch and cache the regency list.
 * @returns {Promise<Array>}
 */
export async function fetchRegencies() {
    if (_regencies) return _regencies;

    try {
        const res = await fetch('./data/regency.json');
        _regencies = await res.json();
    } catch (e) {
        logError('[DB]', e);
        _regencies = [];
    }

    return _regencies;
}

/**
 * Get the Ramadhan config, preferring the remote-cached version if it has
 * a newer Hijri year than the local bundled file.
 *
 * Priority: remote cache (storage) > local public file
 *
 * @returns {Promise<object>}
 */
export async function getRamadhanConfig() {
    if (_ramadhan) return _ramadhan;

    // Load local file from public/data/ (always available, served as static asset)
    let localData = null;
    try {
        const res = await fetch('./data/ramadhan.json');
        localData = await res.json();
    } catch (e) {
        logError('[DB] Failed to load local ramadhan.json', e);
    }

    // Load remote-cached config persisted by remote-config.js
    const remoteData = await getCachedRemoteConfig();

    // Use remote data only if it's strictly newer than the local file
    const localYear = localData?.tahunHijriah ?? 0;
    const remoteYear = remoteData?.tahunHijriah ?? 0;

    _ramadhan = (remoteYear > localYear ? remoteData : localData) ?? { presets: [] };
    return _ramadhan;
}

/**
 * Find province by ID
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getProvinceById(id) {
    const provinces = await fetchProvinces();
    return provinces.find(p => p.id === id) || null;
}

/**
 * Find regency by ID
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getRegencyById(id) {
    const regencies = await fetchRegencies();
    return regencies.find(r => r.id === id) || null;
}

/**
 * Get all regencies for a province
 * @param {string} provinceId
 * @returns {Promise<Array>}
 */
export async function getRegenciesByProvinceId(provinceId) {
    const regencies = await fetchRegencies();
    return regencies.filter(r => r.province_id === provinceId);
}
