/**
 * Global State Manager
 * Centralizes state management with pub/sub architecture and persistent storage.
 */

import * as storage from './storage.js';

const STATE_KEY = 'app_state';

const initialState = {
    location: null,
    network: {
        isOffline: false
    },
    home: {
        viewMode: 'tube',
        carouselIndex: 0
    },
    settings: {
        org: 'nu',
        language: 'auto',
        notification: true,
        adzan: true,
        quran: {
            tajweed: true,
            transliteration: true,
            translationLanguage: 'id',
            reciterId: 'alafasy',
            audioMode: 'offline'
        }
    },
    quran: {
        downloads: {}
    }
};

class Store {
    constructor() {
        this.state = this._deepClone(initialState);
        this.listeners = new Map();
        this.isHydrated = false;
        this.saveTimeout = null;
    }

    /**
     * Initializes state from persistent storage or migrates legacy data.
     * Must be called during application startup.
     */
    async hydrate() {
        if (this.isHydrated) return;

        const savedState = await storage.get(STATE_KEY);

        if (savedState) {
            this.state = this._mergeConfig(this.state, savedState);
        } else {
            await this._migrateLegacyStorage();
        }

        this.isHydrated = true;
    }

    /**
     * Retrieves value by dot-notation path.
     * @param {string} [path] - Target path (e.g., 'settings.quran.tajweed'). Omit to get full state.
     */
    getState(path) {
        if (!path) return this.state;
        return path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), this.state);
    }

    /**
     * Sets value by dot-notation path, notifies listeners, and persists to storage.
     * @param {string} path - Target path.
     * @param {*} value - New value.
     */
    setState(path, value) {
        if (!path) return;

        const keys = path.split('.');
        let current = this.state;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        if (current[lastKey] === value) return;

        current[lastKey] = value;

        this._notifySubscribers(path);
        this._persistState();
    }

    /**
     * Subscribes to changes on a specific path.
     * @param {string} path - Path to watch.
     * @param {Function} callback - Execution callback.
     * @returns {string} Subscription ID for cleanup.
     */
    subscribe(path, callback) {
        const id = typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2, 15);
        
        this.listeners.set(id, { path, callback });
        return id;
    }

    /**
     * Unsubscribes a listener by ID.
     * @param {string} id - Subscription ID.
     */
    unsubscribe(id) {
        this.listeners.delete(id);
    }

    /**
     * Notifies listeners affected by the changed path.
     * @param {string} changedPath - The path that was mutated.
     */
    _notifySubscribers(changedPath) {
        for (const { path, callback } of this.listeners.values()) {
            if (this._isPathAffected(path, changedPath)) {
                callback(this.getState(path));
            }
        }
    }

    /**
     * Determines if a subscription path intersects with a changed path.
     * @param {string} subPath 
     * @param {string} changedPath 
     */
    _isPathAffected(subPath, changedPath) {
        if (subPath === changedPath) return true;
        
        // True if changed path is a parent of subscription path (e.g., settings -> settings.adzan)
        // or if subscription path is a parent of changed path (e.g., settings.adzan -> settings)
        return subPath.startsWith(changedPath + '.') || changedPath.startsWith(subPath + '.');
    }

    /**
     * Debounces state persistence to minimize I/O.
     */
    _persistState() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            storage.set(STATE_KEY, this.state);
        }, 500);
    }

    /**
     * Safely deep merges source object into target object.
     * Uses Object.keys() and a forbidden-key guard to prevent prototype pollution.
     */
    _mergeConfig(target, source) {
        const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
        const result = { ...target };

        for (const key of Object.keys(source)) {
            if (FORBIDDEN_KEYS.has(key)) continue;

            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._mergeConfig(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    /**
     * Creates a deep clone of a serializable object.
     */
    _deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Performs one-time migration of legacy storage keys to the new unified state.
     */
    async _migrateLegacyStorage() {
        // storage.js legacy keys
        const userLocation = await storage.get('user_location');
        if (userLocation) this.setState('location', userLocation);

        const orgId = await storage.get('selected_org');
        if (orgId) this.setState('settings.org', orgId);

        // localStorage legacy keys
        const viewMode = localStorage.getItem('home_view_mode') || localStorage.getItem('satu_ramadhan_view_mode');
        if (viewMode) this.setState('home.viewMode', viewMode);

        const notifMenu = localStorage.getItem('satu_ramadhan_notif');
        if (notifMenu !== null) this.setState('settings.notification', notifMenu !== 'false');

        const adzanMenu = localStorage.getItem('satu_ramadhan_adzan');
        if (adzanMenu !== null) this.setState('settings.adzan', adzanMenu !== 'false');

        const tajweed = localStorage.getItem('satu_ramadhan_tajweed');
        if (tajweed !== null) this.setState('settings.quran.tajweed', tajweed !== 'false');

        const transliteration = localStorage.getItem('satu_ramadhan_transliteration');
        if (transliteration !== null) this.setState('settings.quran.transliteration', transliteration !== 'false');

        const quranLang = localStorage.getItem('satu_ramadhan_quran_lang');
        if (quranLang) this.setState('settings.quran.translationLanguage', quranLang);

        const appLang = localStorage.getItem('satu_ramadhan_language');
        if (appLang) this.setState('settings.language', appLang);

        // Cleanup
        await storage.remove('user_location');
        await storage.remove('selected_org');
        
        const legacyLocalKeys = [
            'home_view_mode', 
            'satu_ramadhan_view_mode', 
            'satu_ramadhan_notif', 
            'satu_ramadhan_adzan', 
            'satu_ramadhan_tajweed', 
            'satu_ramadhan_transliteration', 
            'satu_ramadhan_quran_lang',
            'satu_ramadhan_language'
        ];
        legacyLocalKeys.forEach(k => localStorage.removeItem(k));

        // Ensure state is persisted immediately after entire migration finishes
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        await storage.set(STATE_KEY, this.state);
    }
}

export const store = new Store();
