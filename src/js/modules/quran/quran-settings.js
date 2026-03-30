/**
 * Quran Settings Module
 * 
 * Centralized read/write for Quran-related user preferences.
 * All state is managed via the Global Store (store.js).
 * 
 * Consumer modules (quran-reader.js, quran-api.js, mushaf-api.js)
 * call these getter functions at render-time — no event subscription needed.
 */

import { store } from '../../core/store.js';
import { DEFAULT_LANGUAGE } from '../../config/quran-languages.js';

/**
 * Returns whether Tajweed highlighting is enabled.
 * @returns {boolean} True if tajweed is enabled (defaults to true)
 */
export function getTajweedEnabled() {
   const val = store.getState('settings.quran.tajweed');
   return val !== undefined ? val : true;
}

/**
 * Sets tajweed preference.
 * @param {boolean} enabled 
 */
export function setTajweedEnabled(enabled) {
   store.setState('settings.quran.tajweed', Boolean(enabled));
}

/**
 * Returns whether Latin transliteration is enabled.
 * @returns {boolean} True if transliteration is enabled (defaults to true)
 */
export function getTransliterationEnabled() {
   const val = store.getState('settings.quran.transliteration');
   return val !== undefined ? val : true;
}

/**
 * Sets transliteration preference.
 * @param {boolean} enabled 
 */
export function setTransliterationEnabled(enabled) {
   store.setState('settings.quran.transliteration', Boolean(enabled));
}

/**
 * Gets currently selected translation language code.
 * @returns {string} Language code (e.g. 'id', 'en')
 */
export function getTranslationLanguage() {
   return store.getState('settings.quran.translationLanguage') || DEFAULT_LANGUAGE;
}

/**
 * Sets translation language.
 * @param {string} langCode 
 */
export function setTranslationLanguage(langCode) {
   if (!langCode || typeof langCode !== 'string') return;
   store.setState('settings.quran.translationLanguage', langCode);
}
