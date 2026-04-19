/**
 * Adzan Selector Modal Component
 *
 * A modal for selecting Adzan sound preference.
 * Preview playback uses PrayerService.play() / PrayerService.stop()
 * to trigger real audio through the native Android playback service.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { AVAILABLE_ADZANS, resolveAudioFile, DEFAULT_ADZAN, DEFAULT_ADZAN_SUBUH } from '../../config/adzan-sounds.js';
import { PrayerService } from '../../modules/notification/native-notification.js';
import { isNative } from '../../modules/system/platform.js';
import * as Notif from '../../modules/notification/notification.js';

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;
let _isPreviewPlaying = false;
let _playbackStoppedHandle = null;

let _state = {
    normal: null,
    subuh: null,
    activeTab: 'normal' // 'normal' | 'subuh'
};

export async function showAdzanSelectorModal({ currentAdzan, currentAdzanSubuh, onSelect } = {}) {
    if (_overlayEl) {
        unregisterModalDismiss(_handleCancel);
        _removeModal();
    }

    await loadNS('components/modal/adzan-selector-modal');

    _onSelectCallback = onSelect;

    const validateAdzan = (val, defaultVal) => {
        if (!val || typeof val !== 'string') return defaultVal;
        const match = AVAILABLE_ADZANS.find(a => a.id === val.trim());
        return match ? match.id : defaultVal;
    };

    _state.normal = validateAdzan(currentAdzan, DEFAULT_ADZAN);
    _state.subuh = validateAdzan(currentAdzanSubuh, DEFAULT_ADZAN_SUBUH);
    _state.activeTab = 'normal';

    _overlayEl = _createModalDOM();
    document.body.appendChild(_overlayEl);

    _renderOptions();

    registerModalDismiss(_handleCancel);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);

    _bindEvents();

    // Listen for native playback stop events (notification stop button, audio completion)
    // so the preview button resets automatically without user interaction in-app.
    if (isNative) {
        _playbackStoppedHandle = PrayerService.addListener('onPlaybackStopped', () => {
            _resetAllPreviewButtons();
            _isPreviewPlaying = false;
        });
    }
}

function _handleSelect(adzanId, e) {
    if (e) e.stopPropagation();

    if (_state.activeTab === 'normal') {
        _state.normal = adzanId;
    } else {
        _state.subuh = adzanId;
    }

    // CSS-only toggle — avoids full DOM rebuild (innerHTML + rebind)
    if (_overlayEl) {
        _overlayEl.querySelectorAll('.adzan-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.id === adzanId);
        });
    }

    // Defer notification and store callback to the next frame.
    // This frees the main thread immediately so any follow-up tap
    // (e.g. "Selesai" button) is not blocked and responds instantly.
    requestAnimationFrame(() => {
        const selectedConfig = AVAILABLE_ADZANS.find(a => a.id === adzanId);
        if (selectedConfig) {
            const adzanLabel = t(selectedConfig.labelKey);
            Notif.show(t('components/modal/adzan-selector-modal:selected_feedback', { adzan: adzanLabel }), 'success');
        }

        if (_onSelectCallback) {
            _onSelectCallback({
                normal: _state.normal,
                subuh: _state.subuh
            });
        }
    });
}

async function _handlePlay(adzanId, playBtn, e) {
    if (e) e.stopPropagation();

    // Prevent interaction while a play call is in progress
    if (playBtn.classList.contains('loading')) return;

    // Reset any other playing buttons visually
    _overlayEl.querySelectorAll('.adzan-preview-btn.playing').forEach(btn => {
        if (btn !== playBtn) {
            btn.classList.remove('playing');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.remove('bx-pause-circle');
                icon.classList.add('bx-play-circle');
            }
        }
    });

    const isCurrentlyPlaying = playBtn.classList.contains('playing');

    if (!isCurrentlyPlaying) {
        // Stop any currently playing preview first
        _stopPreview();

        // Show loading spinner while native service initializes
        playBtn.classList.add('loading');
        const icon = playBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('bx-play-circle');
            icon.classList.add('bx-loader-alt', 'bx-spin');
        }

        const isSubuh = _state.activeTab === 'subuh';
        const audioFile = resolveAudioFile(adzanId, isSubuh);
        const adzanLabel = t(`components/modal/adzan-selector-modal:${adzanId}`);

        if (isNative) {
            try {
                await PrayerService.play({
                    prayerKey: isSubuh ? 'subuh' : 'dzuhur',
                    prayerName: `Preview: ${adzanLabel}`,
                    audioFile,
                    isPreview: true,
                });

                // Success — switch to pause icon
                playBtn.classList.remove('loading');
                playBtn.classList.add('playing');
                if (icon) {
                    icon.classList.remove('bx-loader-alt', 'bx-spin');
                    icon.classList.add('bx-pause-circle');
                }
                _isPreviewPlaying = true;
            } catch (err) {
                console.warn('[AdzanSelector] Preview play failed:', err);
                // Reset button on failure
                playBtn.classList.remove('loading');
                if (icon) {
                    icon.classList.remove('bx-loader-alt', 'bx-spin');
                    icon.classList.add('bx-play-circle');
                }
                Notif.show('Preview gagal dimuat', 'error');
                return;
            }
        }

        Notif.show(t('components/modal/adzan-selector-modal:preview_feedback', { adzan: adzanLabel }), 'info');
    } else {
        // Stop playback
        _stopPreview();

        playBtn.classList.remove('playing');
        const icon = playBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('bx-pause-circle');
            icon.classList.add('bx-play-circle');
        }
    }
}

/**
 * Reset all preview buttons to the play state visually.
 * Called when playback ends externally (e.g. notification stop, audio completion).
 */
function _resetAllPreviewButtons() {
    if (!_overlayEl) return;
    _overlayEl.querySelectorAll('.adzan-preview-btn.playing, .adzan-preview-btn.loading').forEach(btn => {
        btn.classList.remove('playing', 'loading');
        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.remove('bx-pause-circle', 'bx-loader-alt', 'bx-spin');
            icon.classList.add('bx-play-circle');
        }
    });
}

/**
 * Stop any currently playing preview via native service.
 */
function _stopPreview() {
    if (_isPreviewPlaying && isNative) {
        PrayerService.stop().catch(err => {
            console.warn('[AdzanSelector] Preview stop failed:', err);
        });
        _isPreviewPlaying = false;
    }
}

function _handleCancel(e) {
    if (e) e.stopPropagation();
    _stopPreview(); // Ensure preview is stopped when modal closes
    _hideModal();
}

function _bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) _handleCancel(e);
    });

    const tabs = _overlayEl.querySelectorAll('.adzan-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (e) e.stopPropagation();
            const targetTab = tab.dataset.tab;
            if (_state.activeTab !== targetTab) {
                _stopPreview(); // Stop preview when switching tabs
                _state.activeTab = targetTab;
                _overlayEl.querySelectorAll('.adzan-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const container = _overlayEl.querySelector('.adzan-options-container');
                if (container) {
                    container.style.opacity = '0';
                    container.style.transform = 'translateY(6px)';

                    setTimeout(() => {
                        _renderOptions();
                        container.style.opacity = '1';
                        container.style.transform = 'translateY(0)';
                    }, 200);
                } else {
                    _renderOptions();
                }
            }
        });
    });

    _bindOptionEvents();

    addEscHandler(_overlayEl, _handleCancel);
}

function _bindOptionEvents() {
    _overlayEl.querySelectorAll('.adzan-option').forEach(option => {
        const id = option.dataset.id;

        const selectArea = option.querySelector('.adzan-select-area');
        if (selectArea) {
            selectArea.addEventListener('click', (e) => {
                _handleSelect(id, e);
            });
        }

        const playBtn = option.querySelector('.adzan-preview-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                _handlePlay(id, playBtn, e);
            });
        }
    });
}

function _hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(_handleCancel);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.adzan-selector-sheet');
    const target = sheet || _overlayEl;
    target.addEventListener('transitionend', _removeModal, { once: true });

    setTimeout(_removeModal, 450);
}

function _removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
    // Clean up the native playback-stopped listener to prevent leaks
    if (_playbackStoppedHandle) {
        _playbackStoppedHandle.remove();
        _playbackStoppedHandle = null;
    }
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    _onSelectCallback = null;
}

function _renderOptions() {
    if (!_overlayEl) return;

    const container = _overlayEl.querySelector('.adzan-options-container');
    if (!container) return;

    const currentAdzan = _state.activeTab === 'normal' ? _state.normal : _state.subuh;

    // Subuh tab: only show entries that have a dedicated subuh audio file
    const adzansToShow = _state.activeTab === 'subuh'
        ? AVAILABLE_ADZANS.filter(a => a.audioFileSubuh !== null)
        : AVAILABLE_ADZANS;

    const optionsHTML = adzansToShow.map(({ id, labelKey }) => {
        const isSelected = id === currentAdzan;
        return `
            <div class="adzan-option ${isSelected ? 'selected' : ''}" data-id="${id}">
                <button class="adzan-select-area" aria-label="Pilih Adzan ${t(labelKey)}">
                    <i class='bx bx-headphone adzan-icon'></i>
                    <div class="adzan-info">
                        <span class="adzan-label">${t(labelKey)}</span>
                    </div>
                </button>
                <div class="adzan-actions">
                    <button class="adzan-preview-btn" aria-label="Putar Preview Adzan ${t(labelKey)}">
                        <i class='bx bx-play-circle'></i>
                    </button>
                    <i class='bx bx-check adzan-check'></i>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = optionsHTML;

    // Re-bind option events since DOM was cleared
    _bindOptionEvents();
}

function _createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'adzan-selector-overlay';

    overlay.innerHTML = `
        <div class="adzan-selector-sheet" role="dialog" aria-modal="true" aria-labelledby="adzan-modal-title">
            <div class="adzan-selector-header">
                <h3 class="adzan-selector-title" id="adzan-modal-title">${t('components/modal/adzan-selector-modal:title')}</h3>
            </div>
            
            <div class="adzan-selector-tabs">
                <button class="adzan-tab active" data-tab="normal">${t('components/modal/adzan-selector-modal:tab_normal', { defaultValue: 'Waktu Normal' })}</button>
                <button class="adzan-tab" data-tab="subuh">${t('components/modal/adzan-selector-modal:tab_subuh', { defaultValue: 'Waktu Subuh' })}</button>
            </div>

            <div class="adzan-options-container">
            </div>
            <div class="adzan-selector-footer">
                <button class="btn btn--gold w-100" id="adzan-btn-cancel">${t('btn_confirm', { defaultValue: 'Selesai' })}</button>
            </div>
        </div>
    `;

    const cancelBtn = overlay.querySelector('#adzan-btn-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            impact('light');
            _handleCancel(e);
        });
    }

    return overlay;
}
