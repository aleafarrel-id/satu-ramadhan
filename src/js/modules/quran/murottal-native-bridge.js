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
import { DEFAULT_RECITER_ID, getReciterUrlSegment, buildAyahUrl, buildFallbackAyahUrl, getReciterById } from '../../config/quran-audio.js';
import { isAudioOfflineEnabled } from './quran-settings.js';
import { getGlobalAyahNumber } from './quran-api.js';

// Plugin Registration 

export const MurottalService = registerPlugin('MurottalService');

// Playlist Builder 

/**
 * Returns the active reciter ID from settings.
 * Exported so quran-audio-service.js can reuse it (DRY).
 * @returns {string}
 */
export function getReciterId() {
    return store.getState('settings.quran.reciterId') || DEFAULT_RECITER_ID;
}

/**
 * Builds primary and fallback playlists of audio URIs for a surah,
 * suitable for the native MurottalPlaybackService.
 *
 * - Offline mode: resolves each ayah to a local file:// URI (no fallback needed).
 * - Streaming mode: primary = EveryAyah CDN, fallback = Islamic Network CDN.
 *
 * @param {number} surahIndex - 1-based surah number
 * @param {number} totalAyahs - Total ayahs in this surah
 * @returns {Promise<{ playlist: string[], fallbackPlaylist: Array<string|null> }>}
 */
export async function buildPlaylist(surahIndex, totalAyahs) {
    const reciterId   = getReciterId();
    const urlSegment  = getReciterUrlSegment(reciterId);
    const reciter     = getReciterById(reciterId);
    const playlist         = [];
    const fallbackPlaylist = [];

    for (let ayah = 1; ayah <= totalAyahs; ayah++) {
        let primaryUrl;
        let isLocalUri = false;

        if (isAudioOfflineEnabled()) {
            try {
                const { uri } = await Filesystem.getUri({
                    directory: Directory.Data,
                    path: `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayah}.mp3`,
                });
                primaryUrl = uri;
                isLocalUri = true;
            } catch {
                // File not downloaded — fall back to streaming for this ayah
                primaryUrl = buildAyahUrl(urlSegment, surahIndex, ayah);
            }
        } else {
            primaryUrl = buildAyahUrl(urlSegment, surahIndex, ayah);
        }

        playlist.push(primaryUrl);

        // Build fallback URL only for remote (streaming) URLs.
        // Local file:// URIs do not need a CDN fallback.
        if (!isLocalUri && reciter?.islamicNetworkId) {
            const globalAyah = await getGlobalAyahNumber(surahIndex, ayah);
            fallbackPlaylist.push(buildFallbackAyahUrl(reciter.islamicNetworkId, globalAyah));
        } else {
            fallbackPlaylist.push(null); // null = no CDN fallback for this ayah
        }
    }

    return { playlist, fallbackPlaylist };
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
 * @returns {Promise<{ playlist: string[], fallbackPlaylist: Array<string|null> }>}
 */
export async function buildSingleAyahPlaylist(surahIndex, ayahNumber) {
    const reciterId = getReciterId();
    const urlSegment = getReciterUrlSegment(reciterId);
    const reciter    = getReciterById(reciterId);

    if (isAudioOfflineEnabled()) {
        try {
            const { uri } = await Filesystem.getUri({
                directory: Directory.Data,
                path: `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayahNumber}.mp3`,
            });
            return { playlist: [uri], fallbackPlaylist: [null] };
        } catch {
            // Fallback to streaming
        }
    }

    const primaryUrl = buildAyahUrl(urlSegment, surahIndex, ayahNumber);
    let fallbackUrl  = null;
    if (reciter?.islamicNetworkId) {
        const globalAyah = await getGlobalAyahNumber(surahIndex, ayahNumber);
        fallbackUrl = buildFallbackAyahUrl(reciter.islamicNetworkId, globalAyah);
    }
    return { playlist: [primaryUrl], fallbackPlaylist: [fallbackUrl] };
}
