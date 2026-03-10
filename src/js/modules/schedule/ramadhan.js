/**
 * Ramadhan Module
 * Handles hybrid presets: base data from JSON + user overrides/customs from Storage.
 * Provides CRUD operations and smart year-reset mechanism.
 *
 * Storage Keys (via storage.js):
 *   - 'user_presets'  → { overrides: { [id]: { startDate?, endDate? } }, customs: [...] }
 *   - 'saved_year'    → number (last known tahunHijriah)
 *   - 'selected_org'  → string (active preset ID)
 */

import { getRamadhanConfig } from '../../core/database.js';
import * as storage from '../../core/storage.js';

/* ── Storage Keys ── */

const ORG_KEY = 'selected_org';
const USER_PRESETS_KEY = 'user_presets';
const SAVED_YEAR_KEY = 'saved_year';

/* ── User Presets Storage Helpers ── */

/**
 * Get user presets data from storage.
 * @returns {Promise<{ overrides: Object, customs: Array }>}
 */
async function getUserPresetsData() {
    const data = await storage.get(USER_PRESETS_KEY);
    return {
        overrides: data?.overrides || {},
        customs: data?.customs || [],
    };
}

/**
 * Save user presets data to storage.
 * @param {{ overrides: Object, customs: Array }} data
 */
async function saveUserPresetsData(data) {
    await storage.set(USER_PRESETS_KEY, data);
}

/* ── Smart Year Reset ── */

/**
 * Compare stored year with JSON year.
 * If JSON has a newer year, clear all user overrides & customs.
 * @param {number} jsonYear - tahunHijriah from the JSON config
 */
async function checkAndResetYear(jsonYear) {
    const savedYear = await storage.get(SAVED_YEAR_KEY);

    if (savedYear !== null && jsonYear > savedYear) {
        // Year changed — clear user modifications
        await saveUserPresetsData({ overrides: {}, customs: [] });
    }

    // Always sync the year
    if (savedYear !== jsonYear) {
        await storage.set(SAVED_YEAR_KEY, jsonYear);
    }
}

/* ── Core Public API ── */

/**
 * Get all presets (base + overrides + customs merged).
 * Performs smart year-reset before merging.
 * @returns {Promise<Array<object>>} merged preset list
 */
export async function getAllPresets() {
    const config = getRamadhanConfig();
    const basePresets = config.presets || [];

    // Smart year reset
    await checkAndResetYear(config.tahunHijriah);

    const { overrides, customs } = await getUserPresetsData();

    // Merge overrides into base presets
    const merged = basePresets.map(preset => {
        const override = overrides[preset.id];
        if (!override) return { ...preset, isCustom: false, isOverridden: false };

        return {
            ...preset,
            startDate: override.startDate || preset.startDate,
            endDate: override.endDate || preset.endDate,
            isCustom: false,
            isOverridden: true,
        };
    });

    // Append user custom presets
    const customsWithFlag = customs.map(c => ({ ...c, isCustom: true, isOverridden: false }));

    return [...merged, ...customsWithFlag];
}

/**
 * Get the active preset object based on the selected org ID.
 * Falls back to the first preset (NU) if the selected ID is not found.
 * @returns {Promise<object>}
 */
export async function getActivePreset() {
    const presets = await getAllPresets();
    const selectedId = await getSelectedOrg();
    const found = presets.find(p => p.id === selectedId);

    // Fallback: if ID not found, reset to first preset
    if (!found && presets.length > 0) {
        await setSelectedOrg(presets[0].id);
        return presets[0];
    }

    return found || null;
}

/* ── Organization Selection ── */

/**
 * Get the currently selected organization ID
 * @returns {Promise<string>}
 */
export async function getSelectedOrg() {
    const config = getRamadhanConfig();
    const defaultId = config.presets?.[0]?.id || 'nu';
    return (await storage.get(ORG_KEY)) || defaultId;
}

/**
 * Set the selected organization ID
 * @param {string} orgId
 */
export async function setSelectedOrg(orgId) {
    await storage.set(ORG_KEY, orgId);
}

/**
 * Cycle to the next organization in the presets list.
 * Uses modular arithmetic: (currentIndex + 1) % length
 * @returns {Promise<string>} new selected org ID
 */
export async function toggleOrg() {
    const presets = await getAllPresets();
    if (presets.length === 0) return '';

    const currentId = await getSelectedOrg();
    const currentIndex = presets.findIndex(p => p.id === currentId);
    const nextIndex = (currentIndex + 1) % presets.length;
    const nextId = presets[nextIndex].id;

    await setSelectedOrg(nextId);
    return nextId;
}

/* ── Date Accessors ── */

/**
 * Get the start date of Ramadhan for the active (or specified) preset.
 * @param {string|null} org - preset ID, or null for active
 * @returns {Promise<Date>}
 */
export async function getRamadhanStartDate(org = null) {
    const preset = org ? await getPresetById(org) : await getActivePreset();
    return new Date(preset.startDate + 'T00:00:00');
}

/**
 * Get the end date of Ramadhan for the active (or specified) preset.
 * @param {string|null} org - preset ID, or null for active
 * @returns {Promise<Date>}
 */
export async function getRamadhanEndDate(org = null) {
    const preset = org ? await getPresetById(org) : await getActivePreset();
    return new Date(preset.endDate + 'T00:00:00');
}

/**
 * Calculate which day of Ramadhan it is today.
 * Uses dynamic duration from startDate/endDate (not hardcoded 30).
 * @param {string|null} org - preset ID, or null for active
 * @returns {Promise<number|null>} day number (1-based), or null if not Ramadhan
 */
export async function getRamadhanDay(org = null) {
    const preset = org ? await getPresetById(org) : await getActivePreset();
    if (!preset) return null;

    const start = new Date(preset.startDate + 'T00:00:00');
    const end = new Date(preset.endDate + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (diff < 0 || diff >= totalDays) return null;
    return diff + 1;
}

/**
 * Get the total number of Ramadhan days for a preset.
 * @param {string|null} org - preset ID, or null for active
 * @returns {Promise<number>}
 */
export async function getRamadhanTotalDays(org = null) {
    const preset = org ? await getPresetById(org) : await getActivePreset();
    if (!preset) return 30; // safe fallback

    const start = new Date(preset.startDate + 'T00:00:00');
    const end = new Date(preset.endDate + 'T00:00:00');
    return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

/* ── Display Name Helpers ── */

/**
 * Get display name synchronously (when preset object is provided)
 * @param {string|null} orgId - preset ID
 * @returns {string}
 */
export function getOrgDisplayName(orgId = null) {
    if (!orgId) return getRamadhanConfig().presets?.[0]?.name || 'Nahdlatul Ulama (NU)';

    const config = getRamadhanConfig();
    const preset = config.presets?.find(p => p.id === orgId);
    return preset?.name || orgId;
}

/**
 * Get display name asynchronously (resolves selected org from storage)
 * @returns {Promise<string>}
 */
export async function getOrgDisplayNameAsync() {
    const preset = await getActivePreset();
    return preset?.name || 'Nahdlatul Ulama (NU)';
}

/**
 * Get the description for the active (or specified) preset.
 * @param {string|null} org - preset ID, or null for active
 * @returns {Promise<string>}
 */
export async function getOrgDescription(org = null) {
    const preset = org ? await getPresetById(org) : await getActivePreset();
    return preset?.description || '';
}

/* ── CRUD Operations ── */

/**
 * Update (override) a base preset's startDate/endDate.
 * @param {string} id - preset ID
 * @param {{ startDate?: string, endDate?: string }} newData
 */
export async function updatePreset(id, newData) {
    const data = await getUserPresetsData();
    const config = getRamadhanConfig();
    const isBase = config.presets?.some(p => p.id === id);

    if (isBase) {
        // Override a base preset
        data.overrides[id] = {
            ...(data.overrides[id] || {}),
            ...newData,
        };
    } else {
        // Update an existing custom preset
        const idx = data.customs.findIndex(c => c.id === id);
        if (idx !== -1) {
            Object.assign(data.customs[idx], newData);
        }
    }

    await saveUserPresetsData(data);
}

/**
 * Add a new custom preset.
 * @param {{ name: string, startDate: string, endDate: string, description?: string }} presetData
 * @returns {Promise<string>} generated ID
 */
export async function addCustomPreset(presetData) {
    const data = await getUserPresetsData();
    const id = `custom_${Date.now()}`;

    data.customs.push({
        id,
        name: presetData.name,
        startDate: presetData.startDate,
        endDate: presetData.endDate,
        description: presetData.description || '',
    });

    await saveUserPresetsData(data);
    return id;
}

/**
 * Delete a custom preset. Only works on user-created presets.
 * If the deleted preset was selected, fall back to first preset.
 * @param {string} id - custom preset ID
 */
export async function deleteCustomPreset(id) {
    const data = await getUserPresetsData();
    data.customs = data.customs.filter(c => c.id !== id);
    await saveUserPresetsData(data);

    // Fallback if deleted preset was the active one
    const selectedId = await getSelectedOrg();
    if (selectedId === id) {
        const config = getRamadhanConfig();
        const fallbackId = config.presets?.[0]?.id || 'nu';
        await setSelectedOrg(fallbackId);
    }
}

/**
 * Reset a base preset's override back to JSON defaults.
 * @param {string} id - base preset ID
 */
export async function resetBasePreset(id) {
    const data = await getUserPresetsData();
    delete data.overrides[id];
    await saveUserPresetsData(data);
}

/* ── Internal Helpers ── */

/**
 * Get a single preset by ID from the merged list.
 * Falls back to first preset if not found.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getPresetById(id) {
    const presets = await getAllPresets();
    return presets.find(p => p.id === id) || presets[0] || null;
}
