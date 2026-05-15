/**
 * Quran Audio Service
 *
 * Manages Murottal playback with platform-aware routing:
 *
 *   - **Android Native**: Delegates to MurottalPlaybackService (Java Foreground
 *     Service) via the MurottalServicePlugin Capacitor bridge. This enables
 *     background playback that survives app minimization and force-close.
 *
 *   - **Web / Fallback**: Uses HTML5 Web Audio (and @capgo/native-audio for
 *     preloaded local files on native-streaming mode). Playback stops when
 *     the browser tab loses focus — acceptable for web deployments.
 *
 * Communication with UI is done via DOM CustomEvents on `document`.
 * No direct coupling to any view/component.
 *
 * @module quran-audio-service
 */

import { NativeAudio } from '@capgo/native-audio';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { getReciterUrlSegment, buildAyahUrl, buildFallbackAyahUrl, getReciterById } from '../../config/quran-audio.js';
import { getSurahList, getGlobalAyahNumber } from './quran-api.js';
import { isAudioOfflineEnabled } from './quran-settings.js';
import { isNative } from '../system/platform.js';
import { MurottalService, buildPlaylist, getReciterId } from './murottal-native-bridge.js';
import { t, loadNS } from '../../core/i18n.js';

/** Prefix for NativeAudio asset IDs to avoid collisions. */
const ASSET_PREFIX = 'murottal';

/** Whether to use the native background service for playback. */
const USE_NATIVE_SERVICE = isNative;

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

/** Circuit breaker: when true, try fallback CDN first to avoid primary timeout. */
let _useFallbackCdn = false;

/** @type {PluginListenerHandle|null} */
let _nativeStateListenerHandle = null;

/** @type {PluginListenerHandle|null} */
let _nativeStoppedListenerHandle = null;

// getReciterId() is imported from murottal-native-bridge.js (the canonical owner).
// quran-download-manager.js keeps its own private _getReciterId() intentionally
// to avoid it depending on the murottal bridge — it predates the bridge and has no
// playback concern. Merging them would create an incorrect dependency direction.

/** @returns {string} Local filesystem path for a given ayah. */
function _buildLocalPath(reciterId, surahIndex, ayahNumber) {
    return `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayahNumber}.mp3`;
}

/** @returns {string} Unique NativeAudio asset ID for a given ayah. */
function _buildAssetId(surahIndex, ayahNumber) {
    return `${ASSET_PREFIX}_${surahIndex}_${ayahNumber}`;
}


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
 * Attempts to stream a single URL, wiring up all necessary event handlers.
 * Resolves `true` when audio actually starts playing, `false` on error or abort.
 * On success, `_webAudioEl` points to the active element.
 *
 * @param {string}   url
 * @param {AbortSignal} signal
 * @param {Function} onEnded - called when the element fires its `ended` event
 * @returns {Promise<boolean>}
 */
function _tryStreamingUrl(url, signal, onEnded) {
    _teardownWebAudio();
    if (signal.aborted) return Promise.resolve(false);

    _webAudioEl = new Audio(url);
    _currentAssetId = 'web';
    _webAudioEl.onended   = onEnded;
    _webAudioEl.onwaiting = () => _setBuffering(true);
    _webAudioEl.onplaying = () => _setBuffering(false);
    _webAudioEl.onstalled = () => _setBuffering(true);

    return new Promise((resolve) => {
        const el = _webAudioEl;
        let timeoutId;

        const onPlaying = () => { cleanup(); resolve(true); };
        const onError   = () => { cleanup(); resolve(false); };
        const onAbort   = () => { cleanup(); resolve(false); };
        const onTimeout = () => {
            console.warn(`[AudioService] Web streaming timeout after 5000ms for ${url}`);
            cleanup();
            resolve(false);
        };

        function cleanup() {
            clearTimeout(timeoutId);
            el.removeEventListener('playing', onPlaying);
            el.removeEventListener('error',   onError);
            signal.removeEventListener('abort', onAbort);
        }

        el.addEventListener('playing', onPlaying, { once: true });
        el.addEventListener('error',   onError,   { once: true });
        signal.addEventListener('abort', onAbort,  { once: true });

        // Enforce a strict 5-second timeout matching native Android
        timeoutId = setTimeout(onTimeout, 5000);

        el.play().catch(err => {
            if (err.name === 'AbortError') { resolve(false); return; }
            onError();
        });
    });
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

// ─── Native Service Bridge ───────────────────────────────────────────────────

/**
 * Builds the i18n systemStrings payload for the native service notification.
 * Pre-translates all UI strings in the active language before sending to Java.
 * @returns {Promise<object>}
 */
async function _buildSystemStrings() {
    await loadNS('components/quran/quran-audio-dock');
    return {
        playing: t('components/quran/quran-audio-dock:play'),
        ayah: t('components/quran/quran-audio-dock:notif_ayah_label'),
        stop: t('components/quran/quran-audio-dock:stop'),
        pause: t('components/quran/quran-audio-dock:pause'),
        resume: t('components/quran/quran-audio-dock:resume'),
        next: t('components/quran/quran-audio-dock:next'),
        prev: t('components/quran/quran-audio-dock:prev'),
        channelName: t('components/quran/quran-audio-dock:notif_channel_name') || 'Murottal Playback',
        channelDesc: t('components/quran/quran-audio-dock:notif_channel_desc') || 'Murottal Al-Quran playback controls',
    };
}

/**
 * Registers listeners for native service state changes.
 * Called once when the first playback session starts on Android native.
 */
function _registerNativeListeners() {
    if (_nativeStateListenerHandle) return; // Already registered

    _nativeStateListenerHandle = MurottalService.addListener('onMurottalStateChanged', (data) => {
        // Update internal state from native service
        const prevAyah = _currentAyahNumber;
        const prevPaused = _isPaused;
        _isPlaying = data.isPlaying;
        _isPaused = data.isPaused;
        _currentAyahNumber = data.ayahNumber;
        _playbackMode = data.mode || 'sequential';

        if (_currentSurah) {
            _currentSurah.index = data.surahIndex;
            _currentSurah.name = data.surahName || _currentSurah.name;
        }

        // Emit appropriate events for UI sync.
        // Only fire pause/resume events when the pause state *changes*,
        // not every time we receive a broadcast with isPaused=true.
        if (!prevPaused && data.isPaused) {
            _emit('murottal:play-pause', {
                surahIndex: data.surahIndex,
                ayahNumber: data.ayahNumber,
            });
        } else if (prevPaused && data.isPlaying && !data.isPaused) {
            _emit('murottal:play-resume', {
                surahIndex: data.surahIndex,
                ayahNumber: data.ayahNumber,
            });
        } else if (prevAyah !== data.ayahNumber && data.isPlaying) {
            _emit('murottal:ayah-change', {
                surahIndex: data.surahIndex,
                surahName: data.surahName || _currentSurah?.name || '',
                ayahNumber: data.ayahNumber,
            });
        }
    });

    _nativeStoppedListenerHandle = MurottalService.addListener('onMurottalStopped', () => {
        const wasPlaying = _isPlaying;
        _isPlaying = false;
        _isPaused = false;
        _isBuffering = false;
        _currentSurah = null;
        _currentAyahNumber = 0;
        _playbackMode = 'single';

        if (wasPlaying) {
            _emit('murottal:play-stop', {});
        }
    });
}

/**
 * Removes native service listeners.
 */
async function _removeNativeListeners() {
    if (_nativeStateListenerHandle) {
        try { await _nativeStateListenerHandle.remove(); } catch {}
        _nativeStateListenerHandle = null;
    }
    if (_nativeStoppedListenerHandle) {
        try { await _nativeStoppedListenerHandle.remove(); } catch {}
        _nativeStoppedListenerHandle = null;
    }
}

// ─── Core Playback Logic (Web/Fallback Path) ─────────────────────────────────

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
    const reciterId = getReciterId();

    // Use isAudioOfflineEnabled() as the single routing decision:
    //   false → Streaming path (Web, or Native with streaming mode)
    //   true  → Offline path (Native with local files)
    if (!isAudioOfflineEnabled()) {
        if (signal.aborted) return false;

        const urlSegment = getReciterUrlSegment(reciterId);
        const primaryUrl = buildAyahUrl(urlSegment, surahIndex, ayahNumber);
        const onEnded    = () => _onPlaybackComplete();

        // Pre-compute fallback URL (only if reciter has an Islamic Network ID)
        let fallbackUrl = null;
        const reciter = getReciterById(reciterId);
        if (reciter?.islamicNetworkId) {
            const globalAyah = await getGlobalAyahNumber(surahIndex, ayahNumber);
            fallbackUrl = buildFallbackAyahUrl(reciter.islamicNetworkId, globalAyah);
        }

        // Circuit breaker: choose which CDN to try first
        const firstUrl  = (_useFallbackCdn && fallbackUrl) ? fallbackUrl : primaryUrl;
        const secondUrl = (_useFallbackCdn && fallbackUrl) ? primaryUrl  : fallbackUrl;
        const firstIsFallback = (_useFallbackCdn && !!fallbackUrl);

        let success = await _tryStreamingUrl(firstUrl, signal, onEnded);

        if (success) {
            _useFallbackCdn = firstIsFallback;
            return true;
        }

        // First failed — try the alternate CDN
        if (!signal.aborted && secondUrl) {
            console.warn(`[AudioService] First CDN failed, trying alternate for ayah ${ayahNumber}`);
            success = await _tryStreamingUrl(secondUrl, signal, onEnded);
            if (success) {
                _useFallbackCdn = !firstIsFallback;
                return true;
            }
        }

        if (!success && !signal.aborted) {
            console.warn(`[AudioService] Web: all sources failed for ayah ${ayahNumber}`);
            _emit('murottal:play-error', { surahIndex, ayahNumber });
        }

        return success;
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
    // Probe primary CDN at the start of each new session.
    // Within the session, _useFallbackCdn protects subsequent ayahs from repeated timeouts.
    _useFallbackCdn = false;
    await _cleanUpNativeResources();

    if (signal.aborted) return;

    _playbackMode = mode;
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs };
    _isPlaying = true;

    _emit('murottal:play-start', { surahIndex, surahName, ayahNumber: startAyah, mode });

    _isInitialGoto = true;
    await _gotoAyah(startAyah, signal);
}

// ─── Platform-Routed Public API ──────────────────────────────────────────────

/**
 * Plays an entire surah sequentially, auto-advancing through each ayah.
 * On Android native, delegates to the background foreground service.
 * On web, uses the in-process JS playback engine.
 *
 * @param {number} surahIndex
 * @param {string} surahName
 * @param {number} totalAyahs
 */
export async function playSurah(surahIndex, surahName, totalAyahs) {
    if (USE_NATIVE_SERVICE) {
        return _nativePlaySurah(surahIndex, surahName, totalAyahs);
    }
    return _initPlayback('sequential', surahIndex, surahName, totalAyahs, 1);
}

/**
 * Plays a single ayah in 'single' mode (stops automatically after the ayah ends).
 * Fetches totalAyahs from the Surah registry to enable skipNext/skipPrev while playing.
 * Aborts any in-flight playback immediately to prevent race conditions on rapid taps.
 *
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @param {string} [surahName='']
 */
export async function playAyah(surahIndex, ayahNumber, surahName = '') {
    if (USE_NATIVE_SERVICE) {
        return _nativePlayAyah(surahIndex, ayahNumber, surahName);
    }

    // Abort BEFORE any async work to prevent race conditions when the user
    // taps multiple ayahs quickly before getSurahList() resolves.
    const controller = new AbortController();
    _playController.abort();
    _playController = controller;
    const signal = controller.signal;

    let totalAyahs = 1; // Minimal safe fallback — playlist will only contain the played ayah

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
    if (USE_NATIVE_SERVICE) {
        if (!_isPlaying || _isPaused) return;
        try {
            await MurottalService.pause();
        } catch (error) {
            console.warn('[AudioService] Native pause failed:', error);
        }
        return;
    }

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
    if (USE_NATIVE_SERVICE) {
        if (!_isPlaying || !_isPaused) return;
        try {
            await MurottalService.resume();
        } catch (error) {
            console.warn('[AudioService] Native resume failed:', error);
        }
        return;
    }

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
    if (USE_NATIVE_SERVICE) {
        _playController.abort();
        const wasPlaying = _isPlaying;

        _isPlaying = false;
        _isPaused = false;
        _isBuffering = false;
        _currentSurah = null;
        _currentAyahNumber = 0;
        _playbackMode = 'single';

        try {
            await MurottalService.stop();
        } catch (error) {
            console.warn('[AudioService] Native stop failed:', error);
        }

        if (wasPlaying) _emit('murottal:play-stop', {});
        return;
    }

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
    if (USE_NATIVE_SERVICE) {
        if (!_isPlaying || !_currentSurah) return;
        try {
            await MurottalService.next();
        } catch (error) {
            console.warn('[AudioService] Native next failed:', error);
        }
        return;
    }

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
    if (USE_NATIVE_SERVICE) {
        if (!_isPlaying || !_currentSurah) return;
        try {
            await MurottalService.prev();
        } catch (error) {
            console.warn('[AudioService] Native prev failed:', error);
        }
        return;
    }

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

// ─── Native Service Playback Helpers ─────────────────────────────────────────

/**
 * Plays a full surah via the native background foreground service.
 */
async function _nativePlaySurah(surahIndex, surahName, totalAyahs) {
    // Register native listeners if not already done
    _registerNativeListeners();

    // Set JS state immediately for responsive UI
    _isPlaying = true;
    _isPaused = false;
    _playbackMode = 'sequential';
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs };
    _currentAyahNumber = 1;

    _emit('murottal:play-start', { surahIndex, surahName, ayahNumber: 1, mode: 'sequential' });
    _setBuffering(true, true);

    try {
        const { playlist, fallbackPlaylist } = await buildPlaylist(surahIndex, totalAyahs);
        const systemStrings = await _buildSystemStrings();

        await MurottalService.play({
            playlist: JSON.stringify(playlist),
            fallbackPlaylist: JSON.stringify(fallbackPlaylist),
            surahIndex,
            surahName,
            totalAyahs,
            startAyah: 1,
            mode: 'sequential',
            systemStrings,
        });

        _setBuffering(false);
    } catch (error) {
        console.warn('[AudioService] Native playSurah failed:', error);
        _setBuffering(false);
        _isPlaying = false;
        _emit('murottal:play-stop', {});
    }
}

/**
 * Plays a single ayah via the native background foreground service.
 */
async function _nativePlayAyah(surahIndex, ayahNumber, surahName) {
    // Register native listeners if not already done
    _registerNativeListeners();

    let totalAyahs = ayahNumber;

    try {
        const surahList = await getSurahList();
        const surahInfo = surahList.find(s => parseInt(s.index, 10) === parseInt(surahIndex, 10));
        if (surahInfo) {
            const count = surahInfo.count || surahInfo.numberOfAyahs;
            if (count) totalAyahs = parseInt(count, 10);
        }
    } catch (err) {
        console.warn(`[AudioService] _nativePlayAyah: failed to lookup totalAyahs for surah ${surahIndex}`, err);
    }

    // Set JS state immediately for responsive UI
    _isPlaying = true;
    _isPaused = false;
    _playbackMode = 'single';
    _currentSurah = { index: surahIndex, name: surahName, totalAyahs };
    _currentAyahNumber = ayahNumber;

    _emit('murottal:play-start', { surahIndex, surahName, ayahNumber, mode: 'single' });
    _setBuffering(true, true);

    try {
        // Build a full playlist from ayah 1 to totalAyahs so next/prev can work
        const { playlist, fallbackPlaylist } = await buildPlaylist(surahIndex, totalAyahs);
        const systemStrings = await _buildSystemStrings();

        await MurottalService.play({
            playlist: JSON.stringify(playlist),
            fallbackPlaylist: JSON.stringify(fallbackPlaylist),
            surahIndex,
            surahName,
            totalAyahs,
            startAyah: ayahNumber,
            mode: 'single',
            systemStrings,
        });

        _setBuffering(false);
    } catch (error) {
        console.warn('[AudioService] Native playAyah failed:', error);
        _setBuffering(false);
        _isPlaying = false;
        _emit('murottal:play-stop', {});
    }
}

// ─── Rehydration (Background → Foreground Sync) ─────────────────────────────

/**
 * Syncs JS state with the native background service.
 * Called when the app resumes from background on Android native.
 *
 * If the service is still playing, updates JS state and emits events
 * so the UI (dock, reader, header pill) reflects the current position.
 */
export async function rehydrateFromNative() {
    if (!USE_NATIVE_SERVICE) return;

    try {
        const state = await MurottalService.getState();

        if (state.isPlaying) {
            // Register listeners if not already done
            _registerNativeListeners();

            _isPlaying = true;
            _isPaused = state.isPaused;
            _currentAyahNumber = state.ayahNumber;
            _playbackMode = state.mode || 'sequential';
            _currentSurah = {
                index: state.surahIndex,
                name: state.surahName || '',
                totalAyahs: state.totalAyahs || 0,
            };

            // Emit events to wake up all UI components
            _emit('murottal:play-start', {
                surahIndex: state.surahIndex,
                surahName: state.surahName || '',
                ayahNumber: state.ayahNumber,
                mode: state.mode,
            });

            _emit('murottal:ayah-change', {
                surahIndex: state.surahIndex,
                surahName: state.surahName || '',
                ayahNumber: state.ayahNumber,
            });

            if (state.isPaused) {
                _emit('murottal:play-pause', {
                    surahIndex: state.surahIndex,
                    ayahNumber: state.ayahNumber,
                });
            }

            console.log(`[AudioService] Rehydrated from native: surah=${state.surahIndex} ayah=${state.ayahNumber} paused=${state.isPaused}`);
        } else {
            // Native is not playing — ensure JS state is clean
            if (_isPlaying) {
                _isPlaying = false;
                _isPaused = false;
                _currentSurah = null;
                _currentAyahNumber = 0;
                _emit('murottal:play-stop', {});
            }
        }
    } catch (error) {
        console.warn('[AudioService] Rehydration failed:', error);
    }
}
