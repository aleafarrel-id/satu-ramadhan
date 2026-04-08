/**
 * Storage Service
 */

// Core & Libraries
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

/**
 * Remove all keys matching a prefix pattern
 * @param {string} prefix
 * @returns {Promise<void>}
 */
export async function removeByPrefix(prefix) {
    try {
        const { keys } = await Preferences.keys();
        const fullPrefix = PREFIX + prefix;
        const promises = keys
            .filter(key => key.startsWith(fullPrefix))
            .map(key => Preferences.remove({ key }));
            
        if (promises.length > 0) {
            await Promise.all(promises);
        }
    } catch (e) {
        console.warn('Storage removeByPrefix failed:', e);
    }
}
