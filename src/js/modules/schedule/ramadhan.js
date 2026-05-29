/**
 * Ramadhan Module
 */

import { getRamadhanConfig } from '../../core/database.js';
import * as storage from '../../core/storage.js';
import { store } from '../../core/store.js';
import { isIndonesiaMode, getActiveMethodShortName } from '../../core/calculation-resolver.js';
import { t } from '../../core/i18n.js';
import { generateOfflineHijri } from '../../core/local-calculator.js';
import { clearFastingCache } from './fasting-engine.js';

const USER_PRESETS_KEY = 'user_presets';
const SAVED_YEAR_KEY = 'saved_year';

/**
 * Sync the Hijri offset to the store based on the active preset.
 * Calculates the difference between the preset's 1 Ramadhan and the offline 
 * astronomical Hijri date for that same day.
 */
export async function syncHijriOffset() {
    const preset = await getActivePreset();
    if (!preset) return;

    const startDate = new Date(preset.startDate + 'T00:00:00');
    
    // Get the offline astronomical hijri date for the preset start date
    const offlineHijri = generateOfflineHijri(startDate);
    
    if (!offlineHijri || !offlineHijri.month) return;
    
    const apiHijriDay = offlineHijri.day;
    const apiHijriMonth = offlineHijri.month.number;
    
    let offset = 0;
    if (apiHijriMonth === 9) {
        // Same month (Ramadhan) — direct comparison
        offset = 1 - apiHijriDay;
    } else if (apiHijriMonth === 8) {
        // Still in Sha'ban
        const apiMonthDays = offlineHijri.month.days || 29;
        offset = apiMonthDays - apiHijriDay + 1;
    }
    
    const currentOffset = store.getState('settings.hijriOffset');
    if (currentOffset !== offset) {
        store.setState('settings.hijriOffset', offset);
        clearFastingCache();
    }
}

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

/**
 * Compare stored year with JSON year.
 * If JSON has a newer year, clear all user overrides & customs.
 * @param {number} jsonYear - tahunHijriah from the JSON config
 * @param {Array} basePresets - array of base presets from config
 */
async function checkAndResetYear(jsonYear, basePresets) {
    const savedYear = await storage.get(SAVED_YEAR_KEY);

    if (savedYear !== null && jsonYear > savedYear) {
        // Year changed — clear user modifications
        const { customs } = await getUserPresetsData();
        await saveUserPresetsData({ overrides: {}, customs: [] });

        // Clear legacy offset cache that was used in older versions
        await storage.removeByPrefix('hijri_offset_');
    }

    // Always sync the year
    if (savedYear !== jsonYear) {
        await storage.set(SAVED_YEAR_KEY, jsonYear);
    }
}

/**
 * Get all presets (base + overrides + customs merged).
 * Performs smart year-reset before merging.
 * @returns {Promise<Array<object>>} merged preset list
 */
export async function getAllPresets() {
    const config = await getRamadhanConfig();
    const basePresets = config.presets || [];

    // Smart year reset
    await checkAndResetYear(config.tahunHijriah, basePresets);

    const { overrides, customs } = await getUserPresetsData();

    // INTERCEPT: Non-Indonesian Mode
    if (!isIndonesiaMode()) {
        const globalId = 'global_ramadan';
        const override = overrides[globalId];
        
        const defaultGlobal = {
            id: globalId,
            name: 'Ramadan',
            startDate: basePresets[0]?.startDate || '2026-02-18',
            endDate: basePresets[0]?.endDate || '2026-03-19',
            description: t('components/settings/settings-preset-card:global_desc', { defaultValue: 'Based on global astronomical observation.' }),
            isCustom: false,
            isOverridden: !!override
        };
        
        if (override) {
            defaultGlobal.startDate = override.startDate || defaultGlobal.startDate;
            defaultGlobal.endDate = override.endDate || defaultGlobal.endDate;
        }
        
        return [defaultGlobal];
    }

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

export async function getSelectedOrg() {
    const org = store.getState('settings.org');
    if (org) return org;

    // Fallback to default JSON on failure
    const config = await getRamadhanConfig();
    return config.presets?.[0]?.id || 'nu';
}

/**
 * Set the selected organization ID. Store acts as broker to save to database.
 * @param {string} orgId
 */
export async function setSelectedOrg(orgId) {
    store.setState('settings.org', orgId);
    await syncHijriOffset();
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

/**
 * Get display name synchronously (when preset object is provided)
 * @param {string|null} orgId - preset ID
 * @returns {string}
 */
export async function getOrgDisplayName(orgId = null) {
    if (!isIndonesiaMode()) return getActiveMethodShortName();

    const config = await getRamadhanConfig();
    if (!orgId) return config.presets?.[0]?.name || 'Nahdlatul Ulama (NU)';

    const preset = config.presets?.find(p => p.id === orgId);
    return preset?.name || orgId;
}

/**
 * Get display name asynchronously (resolves selected org from storage)
 * @returns {Promise<string>}
 */
export async function getOrgDisplayNameAsync() {
    if (!isIndonesiaMode()) return getActiveMethodShortName();

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

/**
 * Update (override) a base preset's startDate/endDate.
 * @param {string} id - preset ID
 * @param {{ startDate?: string, endDate?: string }} newData
 */
export async function updatePreset(id, newData) {
    const data = await getUserPresetsData();
    const config = await getRamadhanConfig();
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
        const config = await getRamadhanConfig();
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
