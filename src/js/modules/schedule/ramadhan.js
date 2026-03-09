/**
 * Ramadhan Module
 * Handles Ramadhan schedule, Muhammadiyah/NU date differences
 */

import { getRamadhanConfig } from '../../core/database.js';
import * as storage from '../../core/storage.js';

const ORG_KEY = 'selected_org';

/**
 * Get the currently selected organization (muhammadiyah or nu)
 */
export async function getSelectedOrg() {
    return (await storage.get(ORG_KEY)) || 'muhammadiyah';
}

/**
 * Set the selected organization
 */
export async function setSelectedOrg(org) {
    await storage.set(ORG_KEY, org);
}

/**
 * Toggle between muhammadiyah and nu
 * @returns {Promise<string>} new selected org
 */
export async function toggleOrg() {
    const current = await getSelectedOrg();
    const next = current === 'muhammadiyah' ? 'nu' : 'muhammadiyah';
    await setSelectedOrg(next);
    return next;
}

/**
 * Get the start date of Ramadhan for the selected organization
 * @returns {Promise<Date>}
 */
export async function getRamadhanStartDate(org = null) {
    const config = getRamadhanConfig();
    const selected = org || (await getSelectedOrg());
    const dateStr = config.tanggalSatuRamadhan[selected];
    return new Date(dateStr + 'T00:00:00');
}

/**
 * Get the description/keterangan for the selected organization
 */
export async function getOrgDescription(org = null) {
    const config = getRamadhanConfig();
    const selected = org || (await getSelectedOrg());
    return config.keterangan[selected];
}

/**
 * Get the display name for the organization
 */
export function getOrgDisplayName(org = null) {
    // This doesn't need storage, so can stay sync if org is provided
    if (org) {
        return org === 'muhammadiyah' ? 'Muhammadiyah' : 'Nahdlatul Ulama';
    }
    // If no org provided, we can't call async getSelectedOrg() in a sync way,
    // so default to muhammadiyah as fallback
    return 'Muhammadiyah';
}

/**
 * Get display name asynchronously (when no org is provided)
 */
export async function getOrgDisplayNameAsync() {
    const selected = await getSelectedOrg();
    return selected === 'muhammadiyah' ? 'Muhammadiyah' : 'Nahdlatul Ulama';
}

/**
 * Calculate which day of Ramadhan it is today
 * @returns {Promise<number|null>} day number (1-30), or null if not Ramadhan
 */
export async function getRamadhanDay(org = null) {
    const start = await getRamadhanStartDate(org);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));

    if (diff < 0 || diff >= 30) return null;
    return diff + 1;
}
