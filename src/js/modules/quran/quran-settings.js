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
import { QURAN_LANGUAGES, DEFAULT_LANGUAGE } from '../../config/quran-languages.js';
import { resolveLanguage } from '../../core/i18n.js';
import { Capacitor } from '@capacitor/core';

/** @typedef {'offline'|'streaming'} AudioMode */

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
 * Returns whether translation is enabled.
 * @returns {boolean} True if translation is enabled (defaults to true)
 */
export function getTranslationEnabled() {
   const val = store.getState('settings.quran.translationEnabled');
   return val !== undefined ? val : true;
}

/**
 * Sets translation preference.
 * @param {boolean} enabled 
 */
export function setTranslationEnabled(enabled) {
   store.setState('settings.quran.translationEnabled', Boolean(enabled));
}

/**
 * Gets currently selected translation language code.
 * @returns {string} Language code (e.g. 'id', 'en')
 */
export function getTranslationLanguage() {
   return store.getState('settings.quran.translationLanguage') || DEFAULT_LANGUAGE;
}

/**
 * Sets translation language (internal / programmatic use).
 * Does NOT affect the autoSync flag.
 * @param {string} langCode
 */
export function setTranslationLanguage(langCode) {
   if (!langCode || typeof langCode !== 'string') return;
   store.setState('settings.quran.translationLanguage', langCode);
}

/**
 * Sets translation language from a manual user action via the Settings panel.
 * Marks autoSync = false so this choice persists until the next UI language change.
 * @param {string} langCode
 */
export function setTranslationLanguageManual(langCode) {
   if (!langCode || typeof langCode !== 'string') return;
   store.setState('settings.quran.translationLanguage', langCode);
   store.setState('settings.quran.translationAutoSync', false);
}

/**
 * Returns whether translation language is currently auto-synced to the UI language.
 * @returns {boolean}
 */
export function getTranslationAutoSync() {
   const val = store.getState('settings.quran.translationAutoSync');
   // Default true — new installs start in auto-sync mode
   return val !== undefined ? val : true;
}

/**
 * Initializes the Smart Auto-Sync Translation system.
 *
 * Behavior:
 *   - On Startup: If autoSync is true, translation follows the saved UI language.
 *     If autoSync is false (user customized it previously), the custom choice is preserved.
 *   - On UI language change: The custom override is ALWAYS cleared, and the
 *     translation immediately syncs to the new UI language (if supported).
 *
 * Must be called once after store.hydrate() and initI18n().
 */
export function initTranslationSync() {
   const syncTranslation = (rawUiLang, isFromEvent = false) => {
      if (!isFromEvent && !getTranslationAutoSync()) return;

      const resolvedLang = resolveLanguage(rawUiLang);

      const isSupportedTranslation = QURAN_LANGUAGES.some(l => l.code === resolvedLang);

      if (isSupportedTranslation) {
         store.setState('settings.quran.translationLanguage', resolvedLang);
      }
   };
   syncTranslation(store.getState('settings.language') ?? 'auto', false);

   store.subscribe('settings.language', (newRawLang) => {
      store.setState('settings.quran.translationAutoSync', true);
      syncTranslation(newRawLang, true);
   });
}


// Audio Mode

/**
 * Returns the currently selected audio playback mode.
 * Always returns 'streaming' on web (platform override).
 * @returns {AudioMode}
 */
export function getAudioMode() {
   if (!Capacitor.isNativePlatform()) return 'streaming';
   return store.getState('settings.quran.audioMode') || 'offline';
}

/**
 * Persists the audio mode preference.
 * Only effective on Native. Web is always forced to streaming.
 * @param {AudioMode} mode
 */
export function setAudioMode(mode) {
   if (mode !== 'offline' && mode !== 'streaming') return;
   store.setState('settings.quran.audioMode', mode);
}

/**
 * Single gating function consumed by AudioService.
 * Returns `true` if local files should be used for playback.
 *
 * Rules:
 *   - Web: always false (streaming only, no filesystem access)
 *   - Native + mode 'offline': true
 *   - Native + mode 'streaming': false
 *
 * Note: Switching to streaming does NOT delete downloaded files.
 * They remain available if the user switches back to offline mode.
 *
 * @returns {boolean}
 */
export function isAudioOfflineEnabled() {
   return getAudioMode() === 'offline';
}
