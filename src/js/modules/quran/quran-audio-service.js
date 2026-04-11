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

/** Prevents overlapping async transitions (e.g. double completion callbacks). */
let _isTransitioning = false;

/** @type {PluginListenerHandle|null} */
let _completeListenerHandle = null;

/** @type {HTMLAudioElement|null} */
let _webAudioEl = null;

// ─── Private Helpers ─────────────────────────────────────────────────────────

/** @returns {string} Active reciter ID from settings store. */
function _getReciterId() {
    return store.getState('settings.quran.reciterId') || DEFAULT_RECITER_ID;
}

/** @returns {string} Local filesystem path for a given ayah. */
function _buildLocalPath(reciterId, surahIndex, ayahNumber) {
    return `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayahNumber}.mp3`;
}

/** @returns {string} Unique NativeAudio asset ID for a given ayah. */
function _buildAssetId(surahIndex, ayahNumber) {
    return `${ASSET_PREFIX}_${surahIndex}_${ayahNumber}`;
}

/** @returns {string} Zero-padded 3-digit string (e.g. 7 → '007'). */
const pad3 = (n) => String(n).padStart(3, '0');

/** Dispatches a namespaced CustomEvent on `document`. */
function _emit(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/** Tears down the current Web Audio element cleanly. */
function _teardownWebAudio() {
    if (!_webAudioEl) return;
    _webAudioEl.pause();
    _webAudioEl.src = '';
    _webAudioEl.removeAttribute('src');
    _webAudioEl.onended = null;
    _webAudioEl.onerror = null;
    _webAudioEl = null;
}

/** Safely unloads the current asset from NativeAudio and clears the reference. */
async function _unloadCurrentAsset() {
    if (!_currentAssetId) return;

    if (!Capacitor.isNativePlatform()) {
        _teardownWebAudio();
    } else {
        try {
            await NativeAudio.unload({ assetId: _currentAssetId });
        } catch {
            // Asset may not be loaded — safe to ignore
        }
    }

    _currentAssetId = null;
}

/** Removes the NativeAudio completion listener if one is registered. */
async function _removeCompleteListener() {
    if (!_completeListenerHandle) return;
    try {
        await _completeListenerHandle.remove();
    } catch {
        // Safe to ignore
    }
    _completeListenerHandle = null;
}

// ─── Core Playback Logic ─────────────────────────────────────────────────────

/**
 * Loads and plays the audio file for a specific ayah.
 * Handles both the web (streaming) and native (preloaded file) environments.
 *
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {Promise<boolean>} Resolves `true` if playback started successfully.
 */
async function _playAyahFile(surahIndex, ayahNumber) {
    const reciterId = _getReciterId();

    if (!Capacitor.isNativePlatform()) {
        _teardownWebAudio();

        const urlSegment = getReciterUrlSegment(reciterId);
        const remoteUrl = `${EVERYAYAH_BASE_URL}/${urlSegment}/${pad3(surahIndex)}${pad3(ayahNumber)}.mp3`;

        _webAudioEl = new Audio(remoteUrl);
        _webAudioEl.onended = () => _onPlaybackComplete();
        _currentAssetId = 'web';

        try {
            await _webAudioEl.play();
            return true;
        } catch (error) {
            console.warn(`[AudioService] Web: failed to play ayah ${ayahNumber}:`, error);
            return false;
        }
    }

    const assetId = _buildAssetId(surahIndex, ayahNumber);

    try {
        const { uri } = await Filesystem.getUri({
            directory: Directory.Data,
            path: _buildLocalPath(reciterId, surahIndex, ayahNumber),
        });

        await _unloadCurrentAsset();
        await _removeCompleteListener();

        await NativeAudio.preload({ assetId, assetPath: uri, audioChannelNum: 1, isUrl: true });

        _currentAssetId = assetId;

        _completeListenerHandle = await NativeAudio.addListener('complete', (event) => {
            if (event.assetId === _currentAssetId) _onPlaybackComplete();
        });

        await NativeAudio.play({ assetId });
        return true;
    } catch (error) {
        console.warn(`[AudioService] Native: failed to play ayah ${ayahNumber}:`, error);
        return false;
    }
}

/**
 * Central transition handler — the single point of control for all ayah changes.
 * Emits `murottal:ayah-change`, manages the transitioning lock, and plays the file.
 * All public skip/advance operations delegate here to eliminate duplication.
 *
 * @param {number} ayahNumber - The target ayah to transition to.
 * @returns {Promise<void>}
 */
async function _gotoAyah(ayahNumber) {
    _currentAyahNumber = ayahNumber;
    _isPaused = false;

    _emit('murottal:ayah-change', {
        surahIndex: _currentSurah.index,
        surahName: _currentSurah.name,
        ayahNumber,
    });

    _isTransitioning = true;
    const success = await _playAyahFile(_currentSurah.index, ayahNumber);
    _isTransitioning = false;

    if (!success) stop();
}

/**
 * Called when the currently playing ayah finishes.
 * In sequential mode, auto-advances to the next ayah (or stops at the end).
 */
function _onPlaybackComplete() {
    if (!_isPlaying || !_currentSurah || _isTransitioning) return;

    if (_playbackMode !== 'sequential') {
        stop();
        return;
    }

    const nextAyah = _currentAyahNumber + 1;

    if (nextAyah > _currentSurah.totalAyahs) {
        stop();
        return;
    }

    _gotoAyah(nextAyah);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Plays an entire surah sequentially, auto-advancing through each ayah.
 * @param {number} surahIndex
 * @param {string} surahName
 * @param {number} totalAyahs
 */
export async function playSurah(surahIndex, surahName, totalAyahs) {
    await stop();

    _playbackMode = 'sequential';
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs };
    _isPlaying = true;

    _emit('murottal:play-start', { surahIndex, surahName, ayahNumber: 1, mode: 'sequential' });

    await _gotoAyah(1);
}

/**
 * Plays a single ayah and stops after it finishes.
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @param {string} [surahName='']
 */
export async function playAyah(surahIndex, ayahNumber, surahName = '') {
    await stop();

    _playbackMode = 'single';
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs: ayahNumber };
    _isPlaying = true;

    _emit('murottal:play-start', { surahIndex, surahName, ayahNumber, mode: 'single' });

    await _gotoAyah(ayahNumber);
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
        _emit('murottal:play-pause', { surahIndex: _currentSurah?.index, ayahNumber: _currentAyahNumber });
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
        _emit('murottal:play-resume', { surahIndex: _currentSurah?.index, ayahNumber: _currentAyahNumber });
    } catch (error) {
        console.warn('[AudioService] Resume failed:', error);
    }
}

/**
 * Stops playback entirely and resets all internal state.
 */
export async function stop() {
    if (!_isPlaying && !_currentAssetId) return;

    try {
        if (_currentAssetId) {
            if (!Capacitor.isNativePlatform()) {
                if (_webAudioEl) _webAudioEl.currentTime = 0;
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
    _isTransitioning = false;
    _currentSurah = null;
    _currentAyahNumber = 0;
    _playbackMode = 'single';

    if (wasPlaying) _emit('murottal:play-stop', {});
}

/**
 * Skips to the next ayah in sequential mode.
 */
export async function skipNext() {
    if (!_isPlaying || !_currentSurah || _playbackMode !== 'sequential' || _isTransitioning) return;

    const nextAyah = _currentAyahNumber + 1;
    if (nextAyah > _currentSurah.totalAyahs) { stop(); return; }

    await _gotoAyah(nextAyah);
}

/**
 * Skips to the previous ayah in sequential mode.
 */
export async function skipPrev() {
    if (!_isPlaying || !_currentSurah || _playbackMode !== 'sequential' || _isTransitioning) return;

    await _gotoAyah(Math.max(1, _currentAyahNumber - 1));
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
