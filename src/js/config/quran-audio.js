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

export const RECITERS = [
    { id: 'alafasy',    label: 'Mishary Rashid Alafasy',     urlSegment: 'Alafasy_128kbps' },
    { id: 'abdulbasit', label: 'Abdul Basit Abdul Samad',    urlSegment: 'Abdul_Basit_Murattal_192kbps' },
    { id: 'minshawi',   label: 'Mohamed Siddiq El-Minshawi', urlSegment: 'Minshawi_Murattal_128kbps' },
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
