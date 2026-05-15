/**
 * Quran Audio / Reciter Configuration
 * Centralized registry of available Quran reciters (Qari).
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  To add a new Qari:                                      │
 * │  1. Add an entry to RECITERS below                        │
 * │  2. Use the everyayah.com folder name as `urlSegment`     │
 * │  3. Done — download manager adapts automatically          │
 * └──────────────────────────────────────────────────────────┘
 */

// ─── Audio CDN ────────────────────────────────────────────────────────────────

/** Base URL for the EveryAyah audio CDN (primary). */
export const EVERYAYAH_BASE_URL = 'https://everyayah.com/data';

/** Base URL for the Islamic Network audio CDN (fallback). */
export const ISLAMIC_NETWORK_BASE_URL = 'https://cdn.islamic.network/quran/audio/128';

/** Zero-pads a number to 3 digits (e.g. 7 → '007'). */
export const pad3 = (n) => String(n).padStart(3, '0');

/**
 * Builds the remote audio URL for a single ayah.
 * Single source of truth for all EveryAyah URL construction.
 * @param {string} urlSegment - e.g. 'Alafasy_128kbps'
 * @param {number} surahIndex - 1-based surah number
 * @param {number} ayahNumber - 1-based ayah number
 * @returns {string}
 */
export function buildAyahUrl(urlSegment, surahIndex, ayahNumber) {
    return `${EVERYAYAH_BASE_URL}/${urlSegment}/${pad3(surahIndex)}${pad3(ayahNumber)}.mp3`;
}

/**
 * Builds the fallback audio URL using Islamic Network CDN.
 * Requires a global ayah number (1–6236) — use getGlobalAyahNumber() from quran-api.js.
 * @param {string} islamicNetworkId - e.g. 'ar.alafasy'
 * @param {number} globalAyahNumber - sequential position across all surahs
 * @returns {string}
 */
export function buildFallbackAyahUrl(islamicNetworkId, globalAyahNumber) {
    return `${ISLAMIC_NETWORK_BASE_URL}/${islamicNetworkId}/${globalAyahNumber}.mp3`;
}

// ─── Reciters ─────────────────────────────────────────────────────────────────

export const RECITERS = [
    { id: 'alafasy', label: 'Mishary Rashid Alafasy', urlSegment: 'Alafasy_128kbps', islamicNetworkId: 'ar.alafasy' },
    { id: 'abdulbasit', label: 'Abdul Basit Abdul Samad', urlSegment: 'Abdul_Basit_Murattal_192kbps', islamicNetworkId: 'ar.abdulbasitmurattal' },
    { id: 'minshawi', label: 'Mohamed Siddiq El-Minshawi', urlSegment: 'Minshawi_Murattal_128kbps', islamicNetworkId: 'ar.minshawi' },
];

/** Default reciter used across the app. */
export const DEFAULT_RECITER_ID = 'alafasy';

/**
 * Look up a reciter entry by its ID.
 * @param {string} id - e.g. 'alafasy'
 * @returns {object|null}
 */
export function getReciterById(id) {
    return RECITERS.find(r => r.id === id) ?? null;
}

/**
 * Get the URL segment for a given reciter ID.
 * Falls back to default reciter if ID not found.
 * @param {string} id
 * @returns {string} e.g. 'Alafasy_128kbps'
 */
export function getReciterUrlSegment(id) {
    const reciter = getReciterById(id) ?? getReciterById(DEFAULT_RECITER_ID);
    return reciter.urlSegment;
}
