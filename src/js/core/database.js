/**
 * Local JSON Database Loader
 * Fetches province & regency data from public/data/ asynchronously with memoization.
 * Ramadhan config is kept as a static import (tiny file, always needed).
 */

import ramadhanData from '../../data/ramadhan.json';

/* ── Memoization Cache ── */
let _provinces = null;
let _regencies = null;

/* ── Async Data Fetchers ── */

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
        console.error('[DB] Failed to load provinces:', e);
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
        console.error('[DB] Failed to load regencies:', e);
        _regencies = [];
    }

    return _regencies;
}

/* ── Ramadhan Config (static, always bundled) ── */

let _ramadhan = null;

export function getRamadhanConfig() {
    if (!_ramadhan) _ramadhan = ramadhanData;
    return _ramadhan;
}

/* ── Lookup Helpers ── */

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
