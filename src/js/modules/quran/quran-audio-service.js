/**
 * Quran Audio Service
 *
 * Manages native audio playback of downloaded Murottal files via
 * @capgo/native-audio. Supports single-ayah and sequential surah
 * playback modes (foreground only).
 *
 * Communication with UI is done via DOM CustomEvents on `document`.
 * No direct coupling to any view/component.
 *
 * @module quran-audio-service
 */

import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capgo/native-audio';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { store } from '../../core/store.js';
import { DEFAULT_RECITER_ID, getReciterUrlSegment } from '../../config/quran-audio.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const EVERYAYAH_BASE_URL = 'https://everyayah.com/data';

/** Prefix for NativeAudio asset IDs to avoid collisions. */
const ASSET_PREFIX = 'murottal';

// ─── Internal State ──────────────────────────────────────────────────────────

let _isPlaying = false;
let _isPaused = false;

/** @type {{ index: number, name: string, totalAyahs: number }|null} */
let _currentSurah = null;

/** @type {number} */
let _currentAyahNumber = 0;

/** @type {string|null} */
let _currentAssetId = null;

/** @type {'single'|'sequential'} */
let _playbackMode = 'single';

/** @type {PluginListenerHandle|null} */
let _completeListenerHandle = null;

/** @type {HTMLAudioElement|null} */
let _webAudioEl = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the active reciter ID from the Store.
 * @returns {string}
 */
function _getReciterId() {
    return store.getState('settings.quran.reciterId') || DEFAULT_RECITER_ID;
}

/**
 * Builds a local file path in Directory.Data.
 * @param {string} reciterId
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {string}
 */
function _buildLocalPath(reciterId, surahIndex, ayahNumber) {
    return `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayahNumber}.mp3`;
}

/**
 * Generates a unique asset ID for NativeAudio.
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {string}
 */
function _buildAssetId(surahIndex, ayahNumber) {
    return `${ASSET_PREFIX}_${surahIndex}_${ayahNumber}`;
}

/**
 * Zero-pads a number to 3 digits.
 * @param {number} n
 * @returns {string} e.g. 1 → '001'
 */
const pad3 = (n) => String(n).padStart(3, '0');

/**
 * Dispatches a namespaced CustomEvent on `document`.
 * @param {string} eventName
 * @param {object} detail
 */
function _emit(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Safely unloads the current asset from NativeAudio.
 */
async function _unloadCurrentAsset() {
    if (!_currentAssetId) return;

    if (!Capacitor.isNativePlatform()) {
        if (_webAudioEl) {
            _webAudioEl.pause();
            _webAudioEl.src = '';
            _webAudioEl.removeAttribute('src');
            _webAudioEl.onended = null;
            _webAudioEl.onerror = null;
            _webAudioEl = null;
        }
    } else {
        try {
            await NativeAudio.unload({ assetId: _currentAssetId });
        } catch {
            // Asset may not be loaded — safe to ignore
        }
    }

    _currentAssetId = null;
}

/**
 * Removes the completion listener if active.
 */
async function _removeCompleteListener() {
    if (_completeListenerHandle) {
        try {
            await _completeListenerHandle.remove();
        } catch {
            // Safe to ignore
        }
        _completeListenerHandle = null;
    }
}

// ─── Core Playback Logic ─────────────────────────────────────────────────────

/**
 * Plays a specific ayah audio file.
 * Resolves the local file URI, preloads it into NativeAudio, and plays it.
 *
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {Promise<boolean>} true if playback started successfully
 */
async function _playAyahFile(surahIndex, ayahNumber) {
    const reciterId = _getReciterId();
    const isWeb = !Capacitor.isNativePlatform();

    if (isWeb) {
        if (_webAudioEl) {
            _webAudioEl.pause();
            _webAudioEl.src = '';
            _webAudioEl.removeAttribute('src');
            _webAudioEl.onended = null;
            _webAudioEl.onerror = null;
        }

        const urlSegment = getReciterUrlSegment(reciterId);
        const remoteUrl = `${EVERYAYAH_BASE_URL}/${urlSegment}/${pad3(surahIndex)}${pad3(ayahNumber)}.mp3`;

        _webAudioEl = new Audio(remoteUrl);
        _webAudioEl.onended = () => _onPlaybackComplete();
        _currentAssetId = 'web';

        try {
            await _webAudioEl.play();
            return true;
        } catch (error) {
            console.warn(`[AudioService Web] Failed to play ayah ${ayahNumber}:`, error);
            return false;
        }
    }

    const localPath = _buildLocalPath(reciterId, surahIndex, ayahNumber);
    const assetId = _buildAssetId(surahIndex, ayahNumber);

    try {
        // Resolve the full native URI
        const { uri } = await Filesystem.getUri({
            directory: Directory.Data,
            path: localPath,
        });

        // Unload previous asset to free memory
        await _unloadCurrentAsset();
        await _removeCompleteListener();

        // Preload the new audio file
        await NativeAudio.preload({
            assetId,
            assetPath: uri,
            audioChannelNum: 1,
            isUrl: true,
        });

        _currentAssetId = assetId;

        // Register completion listener (for auto-advance in sequential mode)
        _completeListenerHandle = await NativeAudio.addListener(
            'complete',
            (event) => {
                if (event.assetId === _currentAssetId) {
                    _onPlaybackComplete();
                }
            }
        );

        // Start playback
        await NativeAudio.play({ assetId });

        return true;
    } catch (error) {
        console.warn(`[AudioService] Failed to play ayah ${ayahNumber}:`, error);
        return false;
    }
}

/**
 * Handles playback completion of a single ayah.
 * In sequential mode, advances to the next ayah automatically.
 */
function _onPlaybackComplete() {
    if (!_isPlaying || !_currentSurah) return;

    if (_playbackMode === 'sequential') {
        const nextAyah = _currentAyahNumber + 1;

        if (nextAyah > _currentSurah.totalAyahs) {
            // Reached the end of the surah
            stop();
            return;
        }

        // Auto-advance to next ayah
        _currentAyahNumber = nextAyah;

        _emit('murottal:ayah-change', {
            surahIndex: _currentSurah.index,
            surahName: _currentSurah.name,
            ayahNumber: nextAyah,
        });

        _playAyahFile(_currentSurah.index, nextAyah).then(success => {
            if (!success) {
                // Failed to play next — stop entirely
                stop();
            }
        });
    } else {
        // Single mode — stop after one ayah
        stop();
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Plays an entire surah in sequential mode (auto-advance per ayah).
 * @param {number} surahIndex
 * @param {string} surahName
 * @param {number} totalAyahs
 */
export async function playSurah(surahIndex, surahName, totalAyahs) {
    // Stop any existing playback first
    await stop();

    _playbackMode = 'sequential';
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs };
    _currentAyahNumber = 1;
    _isPlaying = true;
    _isPaused = false;

    _emit('murottal:play-start', {
        surahIndex,
        surahName,
        ayahNumber: 1,
        mode: 'sequential',
    });

    _emit('murottal:ayah-change', {
        surahIndex,
        surahName,
        ayahNumber: 1,
    });

    const success = await _playAyahFile(surahIndex, 1);
    if (!success) {
        stop();
    }
}

/**
 * Plays a single ayah (stops after it finishes).
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @param {string} [surahName='']
 */
export async function playAyah(surahIndex, ayahNumber, surahName = '') {
    await stop();

    _playbackMode = 'single';
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs: ayahNumber };
    _currentAyahNumber = ayahNumber;
    _isPlaying = true;
    _isPaused = false;

    _emit('murottal:play-start', {
        surahIndex,
        surahName,
        ayahNumber,
        mode: 'single',
    });

    _emit('murottal:ayah-change', {
        surahIndex,
        surahName,
        ayahNumber,
    });

    const success = await _playAyahFile(surahIndex, ayahNumber);
    if (!success) {
        stop();
    }
}

/**
 * Pauses the current playback.
 */
export async function pause() {
    if (!_isPlaying || _isPaused || !_currentAssetId) return;

    try {
        if (!Capacitor.isNativePlatform()) {
            if (_webAudioEl) _webAudioEl.pause();
        } else {
            await NativeAudio.pause({ assetId: _currentAssetId });
        }
        _isPaused = true;

        _emit('murottal:play-pause', {
            surahIndex: _currentSurah?.index,
            ayahNumber: _currentAyahNumber,
        });
    } catch (error) {
        console.warn('[AudioService] Pause failed:', error);
    }
}

/**
 * Resumes paused playback.
 */
export async function resume() {
    if (!_isPlaying || !_isPaused || !_currentAssetId) return;

    try {
        if (!Capacitor.isNativePlatform()) {
            if (_webAudioEl) await _webAudioEl.play();
        } else {
            await NativeAudio.resume({ assetId: _currentAssetId });
        }
        _isPaused = false;

        _emit('murottal:play-resume', {
            surahIndex: _currentSurah?.index,
            ayahNumber: _currentAyahNumber,
        });
    } catch (error) {
        console.warn('[AudioService] Resume failed:', error);
    }
}

/**
 * Stops playback entirely and resets all state.
 */
export async function stop() {
    if (!_isPlaying && !_currentAssetId) return;

    try {
        if (_currentAssetId) {
            if (!Capacitor.isNativePlatform()) {
                if (_webAudioEl) {
                    _webAudioEl.pause();
                    _webAudioEl.currentTime = 0;
                }
            } else {
                await NativeAudio.stop({ assetId: _currentAssetId });
            }
        }
    } catch {
        // May fail if already stopped — safe to ignore
    }

    await _unloadCurrentAsset();
    await _removeCompleteListener();

    const wasPlaying = _isPlaying;

    _isPlaying = false;
    _isPaused = false;
    _currentSurah = null;
    _currentAyahNumber = 0;
    _playbackMode = 'single';

    if (wasPlaying) {
        _emit('murottal:play-stop', {});
    }
}

/**
 * Skips to the next ayah (sequential mode only).
 */
export async function skipNext() {
    if (!_isPlaying || !_currentSurah || _playbackMode !== 'sequential') return;

    const nextAyah = _currentAyahNumber + 1;
    if (nextAyah > _currentSurah.totalAyahs) {
        stop();
        return;
    }

    _currentAyahNumber = nextAyah;

    _emit('murottal:ayah-change', {
        surahIndex: _currentSurah.index,
        surahName: _currentSurah.name,
        ayahNumber: nextAyah,
    });

    // Reset pause state on skip
    _isPaused = false;

    const success = await _playAyahFile(_currentSurah.index, nextAyah);
    if (!success) {
        stop();
    }
}

/**
 * Skips to the previous ayah (sequential mode only).
 */
export async function skipPrev() {
    if (!_isPlaying || !_currentSurah || _playbackMode !== 'sequential') return;

    const prevAyah = Math.max(1, _currentAyahNumber - 1);
    _currentAyahNumber = prevAyah;

    _emit('murottal:ayah-change', {
        surahIndex: _currentSurah.index,
        surahName: _currentSurah.name,
        ayahNumber: prevAyah,
    });

    _isPaused = false;

    const success = await _playAyahFile(_currentSurah.index, prevAyah);
    if (!success) {
        stop();
    }
}

/**
 * Returns a snapshot of the current playback state.
 * @returns {{ isPlaying: boolean, isPaused: boolean, surahIndex: number|null, surahName: string, ayahNumber: number, mode: string }}
 */
export function getPlaybackState() {
    return {
        isPlaying: _isPlaying,
        isPaused: _isPaused,
        surahIndex: _currentSurah?.index ?? null,
        surahName: _currentSurah?.name ?? '',
        ayahNumber: _currentAyahNumber,
        mode: _playbackMode,
    };
}

/**
 * Returns whether audio is currently playing.
 * @returns {boolean}
 */
export function isPlaying() {
    return _isPlaying;
}

/**
 * Cleans up all state and native resources.
 * Call when the Quran page is destroyed.
 */
export async function destroy() {
    await stop();
}
