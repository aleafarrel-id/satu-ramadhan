/**
 * Adzan Sound Registry — Single Source of Truth
 *
 * This file is the ONLY place where adzan sound entries are declared.
 * Both the JavaScript layer (notification sync, preview playback) and
 * the Android native layer rely on the audioFile names defined here.
 *
 * audioFile      : Android raw resource name (no .mp3 extension)
 * audioFileSubuh : Optional subuh variant. null = fallback to audioFile.
 *
 * To add a new adzan sound:
 *   1. Copy the .mp3 file to android/app/src/main/res/raw/
 *   2. Add an entry below with the correct audioFile name.
 *   3. Add i18n label keys to public/multi-language/{lang}/components/modal/adzan-selector-modal.json
 *   Zero Java changes required.
 */

export const AVAILABLE_ADZANS = [
    {
        id: 'makkah',
        labelKey: 'components/modal/adzan-selector-modal:makkah',
        audioFile: 'adzan_makkah',
        audioFileSubuh: 'adzan_subuh_makkah',
    },
    {
        id: 'malaysia',
        labelKey: 'components/modal/adzan-selector-modal:malaysia',
        audioFile: 'adzan_malaysia',
        audioFileSubuh: null,
    },
    {
        id: 'kuwait',
        labelKey: 'components/modal/adzan-selector-modal:kuwait',
        audioFile: 'adzan_kuwait',
        audioFileSubuh: null,
    },
    {
        id: 'mesir',
        labelKey: 'components/modal/adzan-selector-modal:mesir',
        audioFile: 'adzan_mesir',
        audioFileSubuh: 'adzan_subuh_mesir',
    },
];

/** Default selection for the Normal (non-Subuh) tab */
export const DEFAULT_ADZAN = 'makkah';

/** Default selection for the Subuh tab */
export const DEFAULT_ADZAN_SUBUH = 'makkah';

/**
 * Resolve the exact Android raw resource name for a given adzan selection
 * and prayer time type. All resolution logic lives here in JS — Java
 * receives the final filename and plays it blindly.
 *
 * @param {string}  adzanId  - The user's selected adzan ID (e.g. 'makkah')
 * @param {boolean} isSubuh  - true if the prayer time is subuh
 * @returns {string} Raw resource name without extension (e.g. 'adzan_subuh_makkah')
 */
export function resolveAudioFile(adzanId, isSubuh) {
    const entry = AVAILABLE_ADZANS.find(a => a.id === adzanId);

    if (!entry) {
        // Unknown ID — fall back to the default entry's audioFile
        const fallback = AVAILABLE_ADZANS.find(a => a.id === DEFAULT_ADZAN);
        return fallback ? fallback.audioFile : 'adzan_makkah';
    }

    if (isSubuh && entry.audioFileSubuh) {
        return entry.audioFileSubuh;
    }

    return entry.audioFile;
}
