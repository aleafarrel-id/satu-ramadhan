/**
 * Quran Settings Module
 * Centralized state management for Quran-related user preferences.
 * Handles reading from and writing to localStorage, and provides default values.
 * Emits events when settings change to allow reactive updates.
 */

import { DEFAULT_LANGUAGE } from '../../config/quran-languages.js';

const KEY_TAJWEED = 'satu_ramadhan_tajweed';
const KEY_LANG = 'satu_ramadhan_quran_lang';

export const EVENTS = {
   SETTINGS_CHANGED: 'quran-settings-changed'
};

/**
 * Ensures boolean casting from localStorage
 * @returns {boolean} True if tajweed is enabled
 */
export function getTajweedEnabled() {
   const saved = localStorage.getItem(KEY_TAJWEED);
   // Default to true if not set
   return saved !== null ? saved === 'true' : true;
}

/**
 * Sets tajweed preference and emits change event
 * @param {boolean} enabled 
 */
export function setTajweedEnabled(enabled) {
   const isEnabled = Boolean(enabled);
   localStorage.setItem(KEY_TAJWEED, isEnabled);
   _emitChange();
}

/**
 * Gets currently selected translation language code
 * @returns {string} Language code (e.g. 'id', 'en')
 */
export function getTranslationLanguage() {
   return localStorage.getItem(KEY_LANG) || DEFAULT_LANGUAGE;
}

/**
 * Sets translation language and emits change event
 * @param {string} langCode 
 */
export function setTranslationLanguage(langCode) {
   if (!langCode || typeof langCode !== 'string') return;
   localStorage.setItem(KEY_LANG, langCode);
   _emitChange();
}

/**
 * Helper to emit a custom event when settings change
 */
function _emitChange() {
   window.dispatchEvent(new CustomEvent(EVENTS.SETTINGS_CHANGED, {
      detail: {
         tajweed: getTajweedEnabled(),
         language: getTranslationLanguage()
      }
   }));
}
