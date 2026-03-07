/**
 * Storage Service
 * Capacitor Preferences wrapper with JSON serialization
 * Falls back to web implementation when running in browser
 */

import { Preferences } from '@capacitor/preferences';

const PREFIX = 'satu_ramadhan_';

/**
 * Get a value from storage
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function get(key) {
    try {
        const { value } = await Preferences.get({ key: PREFIX + key });
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

/**
 * Set a value in storage
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function set(key, value) {
    try {
        await Preferences.set({
            key: PREFIX + key,
            value: JSON.stringify(value),
        });
    } catch (e) {
        console.warn('Storage write failed:', e);
    }
}

/**
 * Remove a value from storage
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function remove(key) {
    try {
        await Preferences.remove({ key: PREFIX + key });
    } catch (e) {
        console.warn('Storage remove failed:', e);
    }
}
