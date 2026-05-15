/**
 * Murottal Native Bridge
 *
 * Thin wrapper around the Capacitor MurottalService plugin.
 * Provides the registerPlugin binding and a helper to build
 * playlist payloads for the native foreground service.
 *
 * Follows the same pattern as native-notification.js
 * (PrayerService bridge).
 *
 * @module murottal-native-bridge
 */

import { registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { store } from '../../core/store.js';
import { DEFAULT_RECITER_ID, getReciterUrlSegment, buildAyahUrl } from '../../config/quran-audio.js';
import { isAudioOfflineEnabled } from './quran-settings.js';

// ─── Plugin Registration ─────────────────────────────────────────────────────

export const MurottalService = registerPlugin('MurottalService');

// ─── Playlist Builder ────────────────────────────────────────────────────────

/**
 * Returns the active reciter ID from settings.
 * Exported so quran-audio-service.js can reuse it (DRY).
 * @returns {string}
 */
export function getReciterId() {
    return store.getState('settings.quran.reciterId') || DEFAULT_RECITER_ID;
}

/**
 * Builds a playlist of audio URIs for a surah, suitable for the
 * native MurottalPlaybackService.
 *
 * If offline mode is enabled, resolves each ayah to a local file:// URI.
 * Otherwise, builds streaming https:// URLs from everyayah.com.
 *
 * @param {number} surahIndex - 1-based surah number
 * @param {number} totalAyahs - Total ayahs in this surah
 * @returns {Promise<string[]>} Array of URI strings
 */
export async function buildPlaylist(surahIndex, totalAyahs) {
    const reciterId = getReciterId();
    const urlSegment = getReciterUrlSegment(reciterId);
    const uris = [];

    if (isAudioOfflineEnabled()) {
        // Offline mode: resolve local file URIs
        for (let ayah = 1; ayah <= totalAyahs; ayah++) {
            try {
                const { uri } = await Filesystem.getUri({
                    directory: Directory.Data,
                    path: `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayah}.mp3`,
                });
                uris.push(uri);
            } catch {
                // File not found — fall back to streaming for this ayah
                uris.push(buildAyahUrl(urlSegment, surahIndex, ayah));
            }
        }
    } else {
        // Streaming mode: build remote URLs
        for (let ayah = 1; ayah <= totalAyahs; ayah++) {
            uris.push(buildAyahUrl(urlSegment, surahIndex, ayah));
        }
    }

    return uris;
}

/**
 * Builds a single-ayah playlist (for 'single' playback mode).
 *
 * Reserved utility — not currently called by quran-audio-service.js, which
 * instead sends a full surah playlist with `startAyah` so that next/prev
 * navigation still works from the notification controls. This function is kept
 * exported for potential future use (e.g. a dedicated "play this ayah only"
 * action that intentionally disables skip buttons).
 *
 * @param {number} surahIndex
 * @param {number} ayahNumber - 1-based ayah number
 * @returns {Promise<string[]>} Array with one URI
 */
export async function buildSingleAyahPlaylist(surahIndex, ayahNumber) {
    const reciterId = getReciterId();
    const urlSegment = getReciterUrlSegment(reciterId);

    if (isAudioOfflineEnabled()) {
        try {
            const { uri } = await Filesystem.getUri({
                directory: Directory.Data,
                path: `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayahNumber}.mp3`,
            });
            return [uri];
        } catch {
            // Fallback to streaming
        }
    }

    return [buildAyahUrl(urlSegment, surahIndex, ayahNumber)];
}
