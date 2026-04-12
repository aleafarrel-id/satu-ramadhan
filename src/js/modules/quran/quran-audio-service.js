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
import { getSurahList } from './quran-api.js';
import { isAudioOfflineEnabled } from './quran-settings.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const EVERYAYAH_BASE_URL = 'https://everyayah.com/data';

/** Prefix for NativeAudio asset IDs to avoid collisions. */
const ASSET_PREFIX = 'murottal';

// ─── Internal State ──────────────────────────────────────────────────────────

let _isPlaying = false;
let _isPaused = false;
let _isBuffering = false;

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

/**
 * True only for the first `_gotoAyah` of a new playback session.
 */
let _isInitialGoto = false;

/** AbortController for orchestrating clean cancellation of async chains. */
let _playController = new AbortController();

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
    // Clear ALL event handlers to prevent stale callbacks on a detached element
    _webAudioEl.onended = null;
    _webAudioEl.onerror = null;
    _webAudioEl.onwaiting = null;
    _webAudioEl.onplaying = null;
    _webAudioEl.oncanplay = null;
    _webAudioEl.onstalled = null;
    _webAudioEl = null;
}

/**
 * Safely unloads the active audio asset and clears the reference.
 * Branches on `_currentAssetId === 'web'` (the sentinel set in `_playAyahFile`)
 * rather than platform, so it works correctly when a native user is in streaming mode.
 */
async function _unloadCurrentAsset() {
    if (!_currentAssetId) return;

    if (_currentAssetId === 'web') {
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
 * For web: waits for the `playing` event (not just `play()` resolve) to confirm
 * audio is truly outputting before returning. This ensures `ayah-change` is
 * only emitted — and the screen only scrolls — when the user actually hears sound.
 *
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @param {AbortSignal} signal
 * @returns {Promise<boolean>} Resolves `true` if playback started successfully.
 */
async function _playAyahFile(surahIndex, ayahNumber, signal) {
    const reciterId = _getReciterId();

    // Use isAudioOfflineEnabled() as the single routing decision:
    //   false → Streaming path (Web, or Native with streaming mode)
    //   true  → Offline path (Native with local files)
    if (!isAudioOfflineEnabled()) {
        _teardownWebAudio();

        if (signal.aborted) return false;

        const urlSegment = getReciterUrlSegment(reciterId);
        const remoteUrl = `${EVERYAYAH_BASE_URL}/${urlSegment}/${pad3(surahIndex)}${pad3(ayahNumber)}.mp3`;

        _webAudioEl = new Audio(remoteUrl);
        _currentAssetId = 'web';

        _webAudioEl.onended = () => _onPlaybackComplete();

        // Keep buffering events on the element — they fire throughout playback
        // (e.g. `waiting` fires mid-playback on slow connections too).
        _webAudioEl.onwaiting = () => _setBuffering(true);
        _webAudioEl.onplaying = () => _setBuffering(false);
        _webAudioEl.onstalled = () => _setBuffering(true);

        return new Promise((resolve) => {
            const el = _webAudioEl;

            // `playing` fires when audio actually starts outputting sound.
            // We resolve here instead of after `play()` to guarantee the
            // user hears audio before we scroll the ayah card into view.
            const onPlaying = () => {
                cleanup();
                resolve(true);
            };

            const onError = () => {
                cleanup();
                console.warn(`[AudioService] Web: failed to play ayah ${ayahNumber}`);
                _emit('murottal:play-error', { surahIndex, ayahNumber });
                resolve(false);
            };

            // If the signal is already aborted (rapid tap), resolve immediately.
            const onAbort = () => {
                cleanup();
                resolve(false);
            };

            function cleanup() {
                el.removeEventListener('playing', onPlaying);
                el.removeEventListener('error', onError);
                signal.removeEventListener('abort', onAbort);
            }

            el.addEventListener('playing', onPlaying, { once: true });
            el.addEventListener('error', onError, { once: true });
            signal.addEventListener('abort', onAbort, { once: true });

            // `play()` initiates loading/buffering. The Promise above resolves
            // only when the `playing` event fires, not when `play()` settles.
            el.play().catch((err) => {
                if (err.name === 'AbortError') {
                    resolve(false);
                    return;
                }
                console.warn(`[AudioService] Web: play() rejected for ayah ${ayahNumber}:`, err);
                onError();
            });
        });
    }

    // ── Native Path ──────────────────────────────────────────────────────────
    const assetId = _buildAssetId(surahIndex, ayahNumber);

    try {
        const { uri } = await Filesystem.getUri({
            directory: Directory.Data,
            path: _buildLocalPath(reciterId, surahIndex, ayahNumber),
        });

        await _unloadCurrentAsset();
        await _removeCompleteListener();

        await NativeAudio.preload({ assetId, assetPath: uri, audioChannelNum: 1, isUrl: true });

        // Gatekeeper check: gracefully unload if aborted during FS/Preload IO
        if (signal.aborted) {
            NativeAudio.unload({ assetId }).catch(() => { });
            return false;
        }

        _currentAssetId = assetId;

        _completeListenerHandle = await NativeAudio.addListener('complete', (event) => {
            if (event.assetId === _currentAssetId) _onPlaybackComplete();
        });

        await NativeAudio.play({ assetId });
        // Native audio starts immediately after play() resolves — no need to
        // wait for a separate event. Buffering ends here.
        return true;
    } catch (error) {
        console.warn(`[AudioService] Native: failed to play ayah ${ayahNumber}:`, error);
        _emit('murottal:play-error', { surahIndex, ayahNumber });
        return false;
    }
}

/** Updates buffering state and emits events.
 * @param {boolean} isBuffering
 * @param {boolean} [isInitial=false] - True only on first-play of a new session.
 */
function _setBuffering(isBuffering, isInitial = false) {
    if (_isBuffering === isBuffering) return;
    _isBuffering = isBuffering;
    _emit(isBuffering ? 'murottal:buffering-start' : 'murottal:buffering-end', {
        surahIndex: _currentSurah?.index,
        ayahNumber: _currentAyahNumber,
        isInitial,
    });
}

/**
 * Central transition handler — the single point of control for all ayah changes.
 * Emits `murottal:ayah-change`, manages the transitioning lock, and plays the file.
 * All public skip/advance operations delegate here to eliminate duplication.
 *
 * @param {number} ayahNumber - The target ayah to transition to.
 * @returns {Promise<void>}
 */
async function _gotoAyah(ayahNumber, signal = _playController.signal) {
    if (signal.aborted) return;

    // Capture and immediately consume the initial-goto flag so that only the
    // very first ayah of a session carries `isInitial: true` in buffering events.
    const isInitial = _isInitialGoto;
    _isInitialGoto = false;

    _currentAyahNumber = ayahNumber;
    _isPaused = false;

    _isTransitioning = true;
    _setBuffering(true, isInitial);

    const success = await _playAyahFile(_currentSurah.index, ayahNumber, signal);

    if (signal.aborted) {
        // A newer playback request aborted us — don't touch state.
        return;
    }

    _isTransitioning = false;
    // _playAyahFile is now the single authority on ending buffering for both
    // web (via `playing` event) and native (after play() resolves).
    _setBuffering(false);

    if (success) {
        // Emit AFTER buffering ends — guarantees UI scrolls only when audio plays.
        _emit('murottal:ayah-change', {
            surahIndex: _currentSurah.index,
            surahName: _currentSurah.name,
            ayahNumber,
        });
    } else {
        stop();
    }
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

    _gotoAyah(nextAyah, _playController.signal);
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function _cleanUpNativeResources() {
    try {
        if (_currentAssetId) {
            // Use _currentAssetId === 'web' so this works correctly when a
            // native user is in streaming mode (no NativeAudio asset to stop).
            if (_currentAssetId === 'web') {
                if (_webAudioEl) _webAudioEl.currentTime = 0;
            } else {
                await NativeAudio.stop({ assetId: _currentAssetId });
            }
        }
    } catch {
        // Safe to ignore
    }

    await _unloadCurrentAsset();
    await _removeCompleteListener();

    _isTransitioning = false;
    _currentSurah = null;
    _currentAyahNumber = 0;
    _playbackMode = 'single';
}

/**
 * @param {AbortController} [existingController] - Pre-created controller (from playAyah)
 *   to reuse instead of creating a new one. This prevents a double-abort when playAyah
 *   has already aborted the previous controller and captured a fresh signal.
 */
async function _initPlayback(mode, surahIndex, surahName, totalAyahs, startAyah, existingController) {
    let controller;
    if (existingController) {
        // playAyah already created + swapped in this controller — reuse it as-is.
        controller = existingController;
    } else {
        controller = new AbortController();
        _playController.abort();
        _playController = controller;
    }
    const signal = controller.signal;

    _isPlaying = false;
    _isPaused = false;
    await _cleanUpNativeResources();

    if (signal.aborted) return;

    _playbackMode = mode;
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs };
    _isPlaying = true;

    _emit('murottal:play-start', { surahIndex, surahName, ayahNumber: startAyah, mode });

    _isInitialGoto = true;
    await _gotoAyah(startAyah, signal);
}

/**
 * Plays an entire surah sequentially, auto-advancing through each ayah.
 * @param {number} surahIndex
 * @param {string} surahName
 * @param {number} totalAyahs
 */
export function playSurah(surahIndex, surahName, totalAyahs) {
    return _initPlayback('sequential', surahIndex, surahName, totalAyahs, 1);
}

/**
 * Plays a single ayah in 'single' mode (stops automatically after the ayah ends).
 * Fetches totalAyahs from the Surah registry to enable skipNext/skipPrev while playing.
 * Aborts any in-flight playback immediately to prevent race conditions on rapid taps.
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @param {string} [surahName='']
 */
export async function playAyah(surahIndex, ayahNumber, surahName = '') {
    // Abort BEFORE any async work to prevent race conditions when the user
    // taps multiple ayahs quickly before getSurahList() resolves.
    const controller = new AbortController();
    _playController.abort();
    _playController = controller;
    const signal = controller.signal;

    let totalAyahs = ayahNumber; // Safe baseline fallback

    try {
        const surahList = await getSurahList();
        if (signal.aborted) return; // A newer tap cancelled us — bail out cleanly

        const surahInfo = surahList.find(s => parseInt(s.index, 10) === parseInt(surahIndex, 10));
        if (surahInfo) {
            const count = surahInfo.count || surahInfo.numberOfAyahs;
            if (count) totalAyahs = parseInt(count, 10);
        }
    } catch (err) {
        console.warn(`[AudioService] playAyah: failed to lookup totalAyahs for surah ${surahIndex}`, err);
        if (signal.aborted) return;
    }

    // Re-use the already-created controller instead of creating a new one inside _initPlayback
    return _initPlayback('single', surahIndex, surahName, totalAyahs, ayahNumber, controller);
}

/**
 * Pauses the current playback.
 */
export async function pause() {
    if (!_isPlaying || _isPaused || !_currentAssetId) return;

    try {
        // Branch on the active asset type, not the platform.
        // A native user in streaming mode uses _webAudioEl.
        if (_currentAssetId === 'web') {
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
        // Branch on the active asset type, not the platform.
        // A native user in streaming mode uses _webAudioEl.
        if (_currentAssetId === 'web') {
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
    _playController.abort();

    if (!_isPlaying && !_currentAssetId && !_isTransitioning) return;

    const wasPlaying = _isPlaying;

    _isPlaying = false;
    _isPaused = false;
    _isBuffering = false;

    await _cleanUpNativeResources();

    if (wasPlaying) _emit('murottal:play-stop', {});
}

/**
 * Skips to the next ayah instantly, aborting any active transition.
 */
export async function skipNext() {
    if (!_isPlaying || !_currentSurah) return;

    const nextAyah = _currentAyahNumber + 1;
    if (nextAyah > _currentSurah.totalAyahs) { stop(); return; }

    // Instant abort and jump, preserving current mode
    await _initPlayback(_playbackMode, _currentSurah.index, _currentSurah.name, _currentSurah.totalAyahs, nextAyah);
}

/**
 * Skips to the previous ayah instantly, aborting any active transition.
 */
export async function skipPrev() {
    if (!_isPlaying || !_currentSurah) return;

    const prevAyah = Math.max(1, _currentAyahNumber - 1);

    // Instant abort and jump, preserving current mode
    await _initPlayback(_playbackMode, _currentSurah.index, _currentSurah.name, _currentSurah.totalAyahs, prevAyah);
}

/**
 * Returns a snapshot of the current playback state.
 * @returns {{ isPlaying: boolean, isPaused: boolean, isBuffering: boolean, surahIndex: number|null, surahName: string, ayahNumber: number, mode: string }}
 */
export function getPlaybackState() {
    return {
        isPlaying: _isPlaying,
        isPaused: _isPaused,
        isBuffering: _isBuffering,
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
