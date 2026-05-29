/**
 * App Language Registry
 * Single source of truth for all supported UI languages.
 *
 * │  To add a new language:                                 │
 * │  1. Add an entry to APP_LANGUAGES below                 │
 * │  2. Create  public/multi-language/<code>/common.json    │
 * │  3. Done — i18n service & UI picker adapt automatically │
 */

export const APP_LANGUAGES = [
    { code: 'id', label: 'Indonesia', nativeLabel: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'ms', label: 'Melayu', nativeLabel: 'Bahasa Melayu', flag: '🇲🇾' },
    { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
];

/** Fallback when 'auto' can't match the device locale to any supported code. */
export const FALLBACK_LANG = 'en';

/** Derived set of valid language codes — never duplicate manually. */
export const SUPPORTED_CODES = APP_LANGUAGES.map(l => l.code);

/**
 * Look up a language entry by its code.
 * @param {string} code - e.g. 'id', 'en'
 * @returns {object|null}
 */
export function getLanguageByCode(code) {
    return APP_LANGUAGES.find(l => l.code === code) ?? null;
}

/**
 * Get the user-facing display label for a language setting value.
 * Handles 'auto' gracefully so callers don't need to special-case it.
 *
 * @param {string} setting - 'auto', 'id', 'en', etc.
 * @returns {string} e.g. 'Auto', 'Indonesia', 'English'
 */
export function getLanguageLabel(setting) {
    if (setting === 'auto') return 'Auto';
    return getLanguageByCode(setting)?.label ?? setting;
}
