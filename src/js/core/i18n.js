/**
 * i18n Service — Single source of truth for internationalization.
 *
 * All components translate via t() from this module.
 * Never import i18next directly elsewhere — this facade
 * centralizes configuration, language resolution, and namespace loading.
 *
 * Language definitions live in config/languages.js (the registry).
 * This service only consumes them — never hardcodes language codes.
 */
import i18next from 'i18next';
import Backend from 'i18next-http-backend';
import { store } from './store.js';
import { FALLBACK_LANG, SUPPORTED_CODES } from '../config/languages.js';

// Public API

/**
 * Initialize i18next.
 * Must be called once in app.js AFTER store.hydrate() and BEFORE any render.
 */
export async function initI18n() {
    const savedLang = store.getState('settings.language') ?? 'auto';

    await i18next.use(Backend).init({
        lng: resolveLanguage(savedLang),
        fallbackLng: FALLBACK_LANG,
        ns: ['common'],       // Only 'common' is loaded upfront
        defaultNS: 'common',
        backend: {
            loadPath: '/multi-language/{{lng}}/{{ns}}.json',
        },
        interpolation: { escapeValue: true },
    });
}

/**
 * Translate a key.
 *
 * Usage:
 *   t('close')                                         → common namespace (default)
 *   t('components/card/location-card:header')           → specific namespace
 *   t('components/card/countdown-card:heading', { name }) → with interpolation
 *
 * @param {string} key       - Translation key, optionally namespaced with ':'
 * @param {object} [options] - Interpolation variables, e.g. { name: 'Subuh' }
 * @returns {string}
 */
export function t(key, options) {
    return i18next.t(key, options);
}

/**
 * Lazily load a namespace. Call at the top of each page/component render().
 * Safe to call multiple times — i18next caches loaded namespaces.
 *
 * @param {string} ns - e.g. 'components/card/location-card'
 */
export async function loadNS(ns) {
    if (!i18next.hasResourceBundle(i18next.language, ns)) {
        await i18next.loadNamespaces(ns);
    }
}

/**
 * Change the active language and persist the choice to the store.
 *
 * @param {'auto'|string} lang - 'auto' or any code from APP_LANGUAGES
 */
export async function changeLanguage(lang) {
    const resolved = resolveLanguage(lang);
    await i18next.changeLanguage(resolved);
    store.setState('settings.language', lang);   // persists 'auto', 'id', 'en', etc.
}

/**
 * Get the currently active resolved language code.
 * @returns {string} e.g. 'id', 'en'
 */
export function getCurrentLang() {
    return i18next.language;
}

// Internal Helpers

/**
 * Resolves 'auto' → actual language code from the device/browser locale.
 * Matches the navigator.language prefix against SUPPORTED_CODES from the registry.
 * Falls back to FALLBACK_LANG if no match is found.
 *
 * @param {string} lang
 * @returns {string} A code from SUPPORTED_CODES
 */
function resolveLanguage(lang) {
    if (lang !== 'auto') return lang;

    const deviceLang = (navigator.language || '').toLowerCase();
    const match = SUPPORTED_CODES.find(code => deviceLang.startsWith(code));

    return match || FALLBACK_LANG;
}
