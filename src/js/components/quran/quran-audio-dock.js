/**
 * Quran Audio Dock Component
 *
 * Floating control bar for download progress and audio playback.
 * Injects itself above the navigation dock and reacts to murottal
 * CustomEvents dispatched by `quran-download-manager.js` and
 * `quran-audio-service.js`.
 *
 * This component is completely separate from `quran-dock.js`
 * (which handles Surah/Juz/Mushaf/Bookmark navigation).
 *
 * @module quran-audio-dock
 */

import * as DownloadManager from '../../modules/quran/quran-download-manager.js';
import * as AudioService from '../../modules/quran/quran-audio-service.js';
import { t, loadNS } from '../../core/i18n.js';

// ─── Internal State ──────────────────────────────────────────────────────────

let _container = null;
let _dockEl = null;
let _isVisible = false;
let _currentMode = null; // 'download' | 'playback'

/** @type {Array<[string, Function]>} */
let _eventHandlers = [];

// ─── DOM References ──────────────────────────────────────────────────────────

let _infoTextEl = null;
let _infoSubTextEl = null;
let _infoIconEl = null;
let _dlControlsEl = null;
let _pbControlsEl = null;
let _playPauseBtnIcon = null;
let _dlPauseResumeBtnIcon = null;
let _progressBarEl = null;

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Initializes the audio dock. Must be called once during quran-page render.
 * @param {HTMLElement} container - The slot element to inject the dock into
 */
export async function init(container) {
    if (_dockEl) return;

    await loadNS('components/quran/quran-audio-dock');

    _container = container;
    _dockEl = _buildDockElement();
    _container.insertBefore(_dockEl, _container.firstChild);

    _registerEvents();

    // Sync initial state (in case download/playback was already in progress)
    _syncInitialState();
}

/**
 * Destroys the audio dock and all its listeners.
 */
export function destroy() {
    _unregisterEvents();

    if (_dockEl && _dockEl.parentNode) {
        _dockEl.parentNode.removeChild(_dockEl);
    }

    _dockEl = null;
    _container = null;
    _infoTextEl = null;
    _infoSubTextEl = null;
    _infoIconEl = null;
    _dlControlsEl = null;
    _pbControlsEl = null;
    _playPauseBtnIcon = null;
    _dlPauseResumeBtnIcon = null;
    _progressBarEl = null;
    _isVisible = false;
    _currentMode = null;
    document.body.classList.remove('has-audio-dock');
}

// ─── DOM Construction ────────────────────────────────────────────────────────

/**
 * Builds the dock DOM element with all child elements pre-created.
 * @returns {HTMLElement}
 */
function _buildDockElement() {
    const dock = document.createElement('div');
    dock.className = 'quran-audio-dock';
    dock.id = 'quran-audio-dock';

    // ── Progress bar (bottom edge) ──
    _progressBarEl = document.createElement('div');
    _progressBarEl.className = 'quran-audio-dock-progress';
    dock.appendChild(_progressBarEl);

    // ── Info section (icon + text) ──
    const info = document.createElement('div');
    info.className = 'quran-audio-dock-info';

    _infoIconEl = document.createElement('i');
    _infoIconEl.className = 'bx bx-cloud-download';
    info.appendChild(_infoIconEl);

    const textWrap = document.createElement('div');
    textWrap.className = 'quran-audio-dock-text-wrap';

    _infoTextEl = document.createElement('span');
    _infoTextEl.className = 'quran-audio-dock-text';

    _infoSubTextEl = document.createElement('span');
    _infoSubTextEl.className = 'quran-audio-dock-subtext';

    textWrap.appendChild(_infoTextEl);
    textWrap.appendChild(_infoSubTextEl);
    info.appendChild(textWrap);

    dock.appendChild(info);

    // ── Download Controls (pause/resume + cancel) ──
    _dlControlsEl = document.createElement('div');
    _dlControlsEl.className = 'quran-audio-dock-controls dock-dl-controls';

    const dlPauseResumeBtn = _createControlBtn('dl-pause-resume', 'bx-pause',
        t('components/quran/quran-audio-dock:pause'));
    _dlPauseResumeBtnIcon = dlPauseResumeBtn.querySelector('i');
    const dlCancelBtn = _createControlBtn('dl-cancel', 'bx-x',
        t('components/quran/quran-audio-dock:cancel_download'));

    _dlControlsEl.appendChild(dlPauseResumeBtn);
    _dlControlsEl.appendChild(dlCancelBtn);
    dock.appendChild(_dlControlsEl);

    // ── Playback Controls (prev, play/pause, next, stop) ──
    _pbControlsEl = document.createElement('div');
    _pbControlsEl.className = 'quran-audio-dock-controls dock-pb-controls';

    const prevBtn = _createControlBtn('prev', 'bx-skip-previous',
        t('components/quran/quran-audio-dock:prev'));
    const playPauseBtn = _createControlBtn('play-pause', 'bx-play',
        t('components/quran/quran-audio-dock:play'));
    const nextBtn = _createControlBtn('next', 'bx-skip-next',
        t('components/quran/quran-audio-dock:next'));
    const stopBtn = _createControlBtn('stop', 'bx-stop',
        t('components/quran/quran-audio-dock:stop'));

    _playPauseBtnIcon = playPauseBtn.querySelector('i');

    _pbControlsEl.appendChild(prevBtn);
    _pbControlsEl.appendChild(playPauseBtn);
    _pbControlsEl.appendChild(nextBtn);
    _pbControlsEl.appendChild(stopBtn);
    dock.appendChild(_pbControlsEl);

    // Click delegation
    dock.addEventListener('click', _onDockClick);

    return dock;
}

/**
 * Creates a control button with icon and aria-label.
 * @param {string} action - data-action value
 * @param {string} iconClass - Boxicon class
 * @param {string} ariaLabel
 * @returns {HTMLButtonElement}
 */
function _createControlBtn(action, iconClass, ariaLabel) {
    const btn = document.createElement('button');
    btn.className = 'quran-audio-dock-btn';
    btn.dataset.action = action;
    btn.setAttribute('aria-label', ariaLabel);

    const icon = document.createElement('i');
    icon.className = `bx ${iconClass}`;
    btn.appendChild(icon);

    return btn;
}

// ─── Show / Hide ─────────────────────────────────────────────────────────────

/**
 * Shows the dock in the specified mode.
 * @param {'download'|'playback'} mode
 */
function _show(mode) {
    if (!_dockEl) return;

    _currentMode = mode;
    _dockEl.classList.remove('download-mode', 'playback-mode');
    _dockEl.classList.add(`${mode}-mode`);

    // Toggle control visibility
    _dlControlsEl.style.display = mode === 'download' ? '' : 'none';
    _pbControlsEl.style.display = mode === 'playback' ? '' : 'none';

    // Show/hide progress bar
    _progressBarEl.style.display = mode === 'download' ? '' : 'none';

    if (!_isVisible) {
        _isVisible = true;
        requestAnimationFrame(() => {
            _dockEl.classList.add('show');
            document.body.classList.add('has-audio-dock');
        });
    }
}

/**
 * Hides the dock with animation.
 */
function _hide() {
    if (!_dockEl || !_isVisible) return;

    _isVisible = false;
    _currentMode = null;
    _dockEl.classList.remove('show');
    document.body.classList.remove('has-audio-dock');
}

// ─── State Updates ───────────────────────────────────────────────────────────

/**
 * Updates the dock for download progress.
 * @param {string} surahName
 * @param {number} current
 * @param {number} total
 * @param {boolean} isPaused
 */
function _updateDownloadProgress(surahName, current, total, isPaused = false) {
    if (!_dockEl) return;

    _show('download');
    _infoIconEl.className = isPaused ? 'bx bx-pause-circle' : 'bx bx-cloud-download';

    // Main text: surah name or generic "Downloading..."
    _infoTextEl.textContent = surahName
        ? `${t('components/quran/quran-audio-dock:downloading_surah')} ${surahName}`
        : t('components/quran/quran-audio-dock:downloading_surah');

    // Sub text: progress
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    _infoSubTextEl.textContent = isPaused
        ? `${t('components/quran/quran-audio-dock:download_paused')} · ${current}/${total} (${percentage}%)`
        : `${t('components/quran/quran-audio-dock:progress_ayat', { current, total })} · ${percentage}%`;
    _infoSubTextEl.style.display = 'block';

    // Progress bar via CSS custom property
    const progress = total > 0 ? (current / total) * 100 : 0;
    _progressBarEl.style.setProperty('--dock-progress', `${progress}%`);

    // Update dl pause/resume icon
    if (_dlPauseResumeBtnIcon) {
        _dlPauseResumeBtnIcon.className = isPaused ? 'bx bx-play' : 'bx bx-pause';
    }

    // Add/remove paused class on dock
    _dockEl.classList.toggle('download-paused', isPaused);
}

/**
 * Updates the dock for playback mode.
 * @param {string} surahName
 * @param {number} ayahNumber
 * @param {boolean} isPlaying - true if actively playing, false if paused
 */
function _updatePlayback(surahName, ayahNumber, isPlaying) {
    if (!_dockEl) return;

    _show('playback');
    _infoIconEl.className = isPlaying ? 'bx bx-volume-full' : 'bx bx-volume-mute';

    // Main text: surah name
    _infoTextEl.textContent = surahName || '';

    // Sub text: ayah info
    _infoSubTextEl.textContent = t('components/quran/quran-audio-dock:now_playing_ayah', { ayahNumber });
    _infoSubTextEl.style.display = 'block';

    // Toggle play/pause icon
    if (_playPauseBtnIcon) {
        _playPauseBtnIcon.className = isPlaying ? 'bx bx-pause' : 'bx bx-play';
    }
}

/**
 * Checks current state of download/playback managers and syncs the dock.
 * Called on init to handle mid-session dock creation.
 */
function _syncInitialState() {
    const dlState = DownloadManager.getDownloadState();
    const pbState = AudioService.getPlaybackState();

    if (pbState.isPlaying) {
        _updatePlayback(pbState.surahName, pbState.ayahNumber, !pbState.isPaused);
    } else if (dlState.isDownloading) {
        _updateDownloadProgress(dlState.surahName, dlState.current, dlState.total, dlState.isPaused);
    }
}

// ─── Click Handling ──────────────────────────────────────────────────────────

/**
 * Delegated click handler on the dock element.
 * @param {Event} e
 */
function _onDockClick(e) {
    const btn = e.target.closest('.quran-audio-dock-btn');
    if (!btn) return;

    e.stopPropagation();
    const action = btn.dataset.action;

    switch (action) {
        // ── Download controls ──
        case 'dl-pause-resume': {
            const dlState = DownloadManager.getDownloadState();
            if (dlState.isPaused) {
                DownloadManager.resumeDownload();
            } else {
                DownloadManager.pauseDownload();
            }
            break;
        }
        case 'dl-cancel':
            DownloadManager.cancelDownload();
            _hide();
            break;

        // ── Playback controls ──
        case 'play-pause': {
            const state = AudioService.getPlaybackState();
            if (state.isPaused) {
                AudioService.resume();
            } else {
                AudioService.pause();
            }
            break;
        }
        case 'prev':
            AudioService.skipPrev();
            break;
        case 'next':
            AudioService.skipNext();
            break;
        case 'stop':
            AudioService.stop();
            _hide();
            break;
    }
}

// ─── Event System ────────────────────────────────────────────────────────────

/**
 * Registers document-level listeners for murottal events.
 */
function _registerEvents() {
    _unregisterEvents();

    const handlers = [
        ['murottal:download-progress', _onDownloadProgress],
        ['murottal:download-paused', _onDownloadPaused],
        ['murottal:download-complete', _onDownloadComplete],
        ['murottal:download-error', _onDownloadError],
        ['murottal:download-cancelled', _onDownloadCancelled],
        ['murottal:play-start', _onPlayStart],
        ['murottal:play-pause', _onPlayPause],
        ['murottal:play-resume', _onPlayResume],
        ['murottal:play-stop', _onPlayStop],
        ['murottal:ayah-change', _onAyahChange],
    ];

    handlers.forEach(([event, handler]) => {
        document.addEventListener(event, handler);
    });

    _eventHandlers = handlers;
}

/**
 * Unregisters all event listeners.
 */
function _unregisterEvents() {
    _eventHandlers.forEach(([event, handler]) => {
        document.removeEventListener(event, handler);
    });
    _eventHandlers = [];
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

function _onDownloadProgress(e) {
    _updateDownloadProgress(
        e.detail.surahName || '',
        e.detail.current,
        e.detail.total,
        false,
    );
}

function _onDownloadPaused(e) {
    _updateDownloadProgress(
        e.detail.surahName || '',
        e.detail.current,
        e.detail.total,
        true,
    );
}

function _onDownloadComplete() {
    _hide();
}

function _onDownloadError(e) {
    // Keep showing progress with current state (auto-paused)
    _updateDownloadProgress(
        e.detail.surahName || '',
        e.detail.current,
        e.detail.total,
        true,
    );
}

function _onDownloadCancelled() {
    _hide();
}

function _onPlayStart(e) {
    _updatePlayback(e.detail.surahName, e.detail.ayahNumber, true);
}

function _onPlayPause() {
    if (_playPauseBtnIcon) {
        _playPauseBtnIcon.className = 'bx bx-play';
    }
    if (_infoIconEl) {
        _infoIconEl.className = 'bx bx-volume-mute';
    }
}

function _onPlayResume() {
    if (_playPauseBtnIcon) {
        _playPauseBtnIcon.className = 'bx bx-pause';
    }
    if (_infoIconEl) {
        _infoIconEl.className = 'bx bx-volume-full';
    }
}

function _onPlayStop() {
    _hide();
}

function _onAyahChange(e) {
    const state = AudioService.getPlaybackState();
    _updatePlayback(e.detail.surahName, e.detail.ayahNumber, !state.isPaused);
}
