/**
 * Quran Download Manager
 *
 * Orchestrates per-ayah MP3 downloads for offline Murottal playback.
 * Downloads are sequential (one file at a time) to avoid memory pressure
 * on mobile devices. State is persisted in the global Store so that
 * render-time checks never touch the native filesystem.
 *
 * Communication with UI layers is done exclusively via DOM CustomEvents
 * dispatched on `document` — no direct coupling to any view component.
 *
 * @module quran-download-manager
 */

import { Capacitor } from '@capacitor/core';
import { FileTransfer } from '@capacitor/file-transfer';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { store } from '../../core/store.js';
import { getReciterUrlSegment, DEFAULT_RECITER_ID, buildAyahUrl, buildFallbackAyahUrl, getReciterById } from '../../config/quran-audio.js';
import { getGlobalAyahNumber } from './quran-api.js';

const STORE_DOWNLOADS_PATH = 'quran.downloads';

// ─── Internal State ──────────────────────────────────────────────────────────

let _isDownloading = false;
let _isPaused = false;
let _isCancelled = false;

/** @type {{ surahIndex: number, reciterId: string, totalAyahs: number, currentIndex: number, surahName: string }|null} */
let _queue = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the active reciter ID from the Store (or default).
 * @returns {string}
 */
function _getReciterId() {
    return store.getState('settings.quran.reciterId') || DEFAULT_RECITER_ID;
}

/**
 * Builds the remote URL for a specific ayah audio file.
 * @param {string} urlSegment - e.g. 'Alafasy_128kbps'
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {string}
 */
function _buildRemoteUrl(urlSegment, surahIndex, ayahNumber) {
    return buildAyahUrl(urlSegment, surahIndex, ayahNumber);
}

/**
 * Builds the local storage path (relative to Directory.Data).
 * @param {string} reciterId
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {string}
 */
function _buildLocalPath(reciterId, surahIndex, ayahNumber) {
    return `murottal/${reciterId}/surah_${surahIndex}/ayah_${ayahNumber}.mp3`;
}

/**
 * Dispatches a namespaced CustomEvent on `document`.
 * @param {string} eventName - e.g. 'murottal:download-progress'
 * @param {object} detail
 */
function _emit(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

// ─── Store Sync ──────────────────────────────────────────────────────────────

/**
 * Returns the array of downloaded ayah numbers for a surah+reciter,
 * reading from in-memory Store (no filesystem I/O).
 * @param {string} reciterId
 * @param {number} surahIndex
 * @returns {number[]}
 */
function _getDownloadedAyahs(reciterId, surahIndex) {
    const downloads = store.getState(STORE_DOWNLOADS_PATH) || {};
    return downloads[reciterId]?.[surahIndex] || [];
}

/**
 * Marks an ayah as downloaded in the Store.
 * Uses immutable update to trigger subscriber notifications.
 * @param {string} reciterId
 * @param {number} surahIndex
 * @param {number} ayahNumber
 */
function _markAyahDownloaded(reciterId, surahIndex, ayahNumber) {
    const downloads = store.getState(STORE_DOWNLOADS_PATH) || {};

    // Deep-clone the reciter sub-tree to avoid mutation
    const reciterData = { ...(downloads[reciterId] || {}) };
    const existing = reciterData[surahIndex] ? [...reciterData[surahIndex]] : [];

    if (!existing.includes(ayahNumber)) {
        existing.push(ayahNumber);
        existing.sort((a, b) => a - b);
    }

    reciterData[surahIndex] = existing;
    store.setState(`${STORE_DOWNLOADS_PATH}.${reciterId}`, reciterData);
}

// ─── Download Loop ───────────────────────────────────────────────────────────

/**
 * Core sequential download loop. Downloads one ayah at a time,
 * skipping files that already exist (resumable).
 */
async function _downloadLoop() {
    if (!_queue) return;

    const { surahIndex, reciterId, totalAyahs } = _queue;
    const urlSegment = getReciterUrlSegment(reciterId);

    // Iterate from ayah 1 to totalAyahs (ayah 0 = bismillah, typically not recited separately)
    for (let ayah = 1; ayah <= totalAyahs; ayah++) {
        // Check cancellation
        if (_isCancelled) {
            const cancelledName = _queue.surahName;
            _cleanupState();
            _emit('murottal:download-cancelled', { surahIndex, surahName: cancelledName });
            return;
        }

        // Check pause
        if (_isPaused) {
            _queue.currentIndex = ayah;
            _emit('murottal:download-paused', {
                surahIndex,
                surahName: _queue.surahName,
                current: _getDownloadedAyahs(reciterId, surahIndex).length,
                total: totalAyahs,
            });
            return;
        }

        // Skip if already downloaded (resumable)
        if (isAyahDownloaded(surahIndex, ayah)) {
            _queue.currentIndex = ayah + 1;
            _emit('murottal:download-progress', {
                surahIndex,
                surahName: _queue.surahName,
                current: _getDownloadedAyahs(reciterId, surahIndex).length,
                total: totalAyahs,
            });
            continue;
        }

        try {
            const localPath = _buildLocalPath(reciterId, surahIndex, ayah);
            const remoteUrl = _buildRemoteUrl(urlSegment, surahIndex, ayah);

            // Ensure parent directory exists
            await _ensureDirectory(reciterId, surahIndex);

            // Resolve full native URI
            const { uri } = await Filesystem.getUri({
                directory: Directory.Data,
                path: localPath,
            });

            // Perform the download
            await FileTransfer.downloadFile({
                url: remoteUrl,
                path: uri,
                progress: false, // Per-file progress is not needed — we track per-ayah
            });

            // Mark as downloaded in Store (persisted + reactive)
            _markAyahDownloaded(reciterId, surahIndex, ayah);

            _queue.currentIndex = ayah + 1;

            _emit('murottal:download-progress', {
                surahIndex,
                surahName: _queue.surahName,
                current: _getDownloadedAyahs(reciterId, surahIndex).length,
                total: totalAyahs,
            });
        } catch (primaryError) {
            console.warn(`[DownloadManager] Primary source failed for ayah ${ayah}, trying fallback:`, primaryError);

            // Retry once with fallback CDN (Islamic Network) before auto-pause
            let downloadedViaFallback = false;
            try {
                const reciter = getReciterById(reciterId);
                if (reciter?.islamicNetworkId) {
                    const globalAyah  = await getGlobalAyahNumber(surahIndex, ayah);
                    const fallbackUrl = buildFallbackAyahUrl(reciter.islamicNetworkId, globalAyah);

                    // Re-resolve uri here — it may not be in scope if the primary error
                    // happened before Filesystem.getUri() completed.
                    const localPath = _buildLocalPath(reciterId, surahIndex, ayah);
                    await _ensureDirectory(reciterId, surahIndex);
                    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: localPath });

                    await FileTransfer.downloadFile({ url: fallbackUrl, path: uri, progress: false });
                    _markAyahDownloaded(reciterId, surahIndex, ayah);
                    _queue.currentIndex = ayah + 1;
                    _emit('murottal:download-progress', {
                        surahIndex,
                        surahName: _queue.surahName,
                        current: _getDownloadedAyahs(reciterId, surahIndex).length,
                        total: totalAyahs,
                    });
                    downloadedViaFallback = true;
                }
            } catch (fallbackError) {
                console.warn(`[DownloadManager] Fallback also failed for ayah ${ayah}:`, fallbackError);
            }

            if (!downloadedViaFallback) {
                // Both CDNs failed — auto-pause and notify UI
                _isPaused = true;
                _queue.currentIndex = ayah;
                _emit('murottal:download-error', {
                    surahIndex,
                    surahName: _queue.surahName,
                    error: primaryError?.message || 'Download failed',
                    current: _getDownloadedAyahs(reciterId, surahIndex).length,
                    total: totalAyahs,
                });
                return;
            }
        }
    }

    // All ayahs downloaded successfully
    const completedName = _queue.surahName || '';
    _isDownloading = false;
    _queue = null;

    _emit('murottal:download-complete', { surahIndex, surahName: completedName });
}

/**
 * Ensures the parent directory for a surah's audio files exists.
 * Filesystem.mkdir with `recursive: true` is idempotent.
 * @param {string} reciterId
 * @param {number} surahIndex
 */
async function _ensureDirectory(reciterId, surahIndex) {
    try {
        await Filesystem.mkdir({
            path: `murottal/${reciterId}/surah_${surahIndex}`,
            directory: Directory.Data,
            recursive: true,
        });
    } catch {
        // Directory already exists — safe to ignore
    }
}

/**
 * Resets internal state after cancel or completion.
 */
function _cleanupState() {
    _isDownloading = false;
    _isPaused = false;
    _isCancelled = false;
    _queue = null;
}

/**
 * Removes all Store records for a specific surah+reciter combination.
 * After this call, every ayah of that surah will be treated as "not downloaded"
 * so the download loop re-fetches and overwrites every file on disk.
 *
 * Intentionally does NOT delete files from disk:
 *   – FileTransfer.downloadFile overwrites existing files automatically.
 *   – Avoiding filesystem deletes keeps this operation fast and atomic.
 *
 * @param {string} reciterId
 * @param {number} surahIndex
 */
function _clearSurahRecord(reciterId, surahIndex) {
    const downloads = store.getState(STORE_DOWNLOADS_PATH) || {};
    const reciterData = { ...(downloads[reciterId] || {}) };
    delete reciterData[surahIndex];
    store.setState(`${STORE_DOWNLOADS_PATH}.${reciterId}`, reciterData);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Starts downloading all ayahs for a surah.
 * If a download for the same surah was paused, it resumes from where it left off.
 * @param {number} surahIndex
 * @param {number} totalAyahs - Total number of ayahs in this surah (excluding bismillah)
 * @param {string} [surahName=''] - Display name of the surah
 */
export function startSurahDownload(surahIndex, totalAyahs, surahName = '') {
    if (!Capacitor.isNativePlatform()) {
        _emit('murottal:download-complete', { surahIndex, surahName: surahName || '' });
        return;
    }

    if (_isDownloading && !_isPaused) return;

    const reciterId = _getReciterId();

    _isDownloading = true;
    _isPaused = false;
    _isCancelled = false;

    // If resuming same surah, keep the existing queue position
    if (_queue?.surahIndex === surahIndex && _queue?.reciterId === reciterId) {
        _downloadLoop();
        return;
    }

    _queue = {
        surahIndex,
        reciterId,
        totalAyahs,
        currentIndex: 1,
        surahName,
    };

    _emit('murottal:download-progress', {
        surahIndex,
        surahName,
        current: _getDownloadedAyahs(reciterId, surahIndex).length,
        total: totalAyahs,
    });

    _downloadLoop();
}

/**
 * Pauses the current download. Can be resumed later.
 */
export function pauseDownload() {
    if (!_isDownloading || _isPaused) return;
    _isPaused = true;
    // The download loop checks _isPaused at the top of each iteration
}

/**
 * Resumes a previously paused download.
 */
export function resumeDownload() {
    if (!_isDownloading || !_isPaused) return;
    _isPaused = false;
    _downloadLoop();
}

/**
 * Cancels the current download entirely.
 */
export function cancelDownload() {
    if (!_isDownloading) return;
    _isCancelled = true;

    // If paused, the loop isn't running — trigger cleanup directly
    if (_isPaused) {
        const surahIndex = _queue?.surahIndex;
        _cleanupState();
        _emit('murottal:download-cancelled', { surahIndex });
    }
    // Otherwise, the running loop will pick up _isCancelled on next iteration
}

/**
 * Clears the download record for a surah and starts a full re-download.
 *
 * Use when files are suspected to be corrupt or incomplete.
 * All ayahs will be re-fetched from the remote server and existing
 * files on disk will be overwritten (not deleted first).
 *
 * Guards:
 *   – Silently ignored on web (no native filesystem).
 *   – Silently ignored if another surah is currently downloading.
 *   – If the same surah is paused, cancels it first before re-queuing.
 *
 * @param {number} surahIndex
 * @param {number} totalAyahs
 * @param {string} [surahName='']
 */
export function redownloadSurah(surahIndex, totalAyahs, surahName = '') {
    if (!Capacitor.isNativePlatform()) return;

    // A different surah is actively downloading — don't interrupt it
    if (_isDownloading && !_isPaused && _queue?.surahIndex !== surahIndex) return;

    // Cancel any in-progress or paused download for this (or any) surah
    if (_isDownloading) {
        _isCancelled = true;
        _cleanupState();
    }

    const reciterId = _getReciterId();

    // Wipe the store record so every ayah is treated as missing
    _clearSurahRecord(reciterId, surahIndex);

    // Now kick off a clean download from ayah 1
    startSurahDownload(surahIndex, totalAyahs, surahName);
}

/**
 * Checks whether a specific ayah is downloaded (from RAM — no I/O).
 * @param {number} surahIndex
 * @param {number} ayahNumber
 * @returns {boolean}
 */
export function isAyahDownloaded(surahIndex, ayahNumber) {
    if (!Capacitor.isNativePlatform()) return true;
    const reciterId = _getReciterId();
    return _getDownloadedAyahs(reciterId, surahIndex).includes(ayahNumber);
}

/**
 * Checks whether an entire surah is fully downloaded.
 * @param {number} surahIndex
 * @param {number} totalAyahs
 * @returns {boolean}
 */
export function isSurahFullyDownloaded(surahIndex, totalAyahs) {
    if (!Capacitor.isNativePlatform()) return true;
    const reciterId = _getReciterId();
    const downloaded = _getDownloadedAyahs(reciterId, surahIndex);
    return downloaded.length >= totalAyahs;
}

/**
 * Returns the count of downloaded ayahs for a surah.
 * @param {number} surahIndex
 * @returns {number}
 */
export function getDownloadedCount(surahIndex) {
    if (!Capacitor.isNativePlatform()) return 999;
    const reciterId = _getReciterId();
    return _getDownloadedAyahs(reciterId, surahIndex).length;
}

/**
 * Returns a snapshot of the current download state.
 * @returns {{ isDownloading: boolean, isPaused: boolean, surahIndex: number|null, current: number, total: number }}
 */
export function getDownloadState() {
    if (!_queue) {
        return { isDownloading: false, isPaused: false, surahIndex: null, surahName: '', current: 0, total: 0 };
    }

    const reciterId = _getReciterId();
    return {
        isDownloading: _isDownloading,
        isPaused: _isPaused,
        surahIndex: _queue.surahIndex,
        surahName: _queue.surahName || '',
        current: _getDownloadedAyahs(reciterId, _queue.surahIndex).length,
        total: _queue.totalAyahs,
    };
}

/**
 * Cleans up all state. Call when the Quran page is destroyed.
 */
export function destroy() {
    if (_isDownloading) {
        _isCancelled = true;
    }
    _cleanupState();
}
