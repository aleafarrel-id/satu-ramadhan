/**
 * Adzan Volume Modal Component
 *
 * A modal for adjusting Adzan volume relative to system alarm volume.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';
import { PrayerService } from '../../modules/notification/native-notification.js';
import { isNative } from '../../modules/system/platform.js';
import { store } from '../../core/store.js';
import { resolveAudioFile } from '../../config/adzan-sounds.js';

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;
let _currentVolume = 1.0;
let _isPreviewPlaying = false;
let _playbackStoppedHandle = null;

export async function showAdzanVolumeModal({ currentVolume, onSelect } = {}) {
    if (_overlayEl) {
        unregisterModalDismiss(_handleClose);
        _removeModal();
    }

    await loadNS('components/modal/adzan-volume-modal');

    _onSelectCallback = onSelect;
    _currentVolume = typeof currentVolume === 'number' ? currentVolume : 1.0;

    _overlayEl = _createModalDOM();
    getModalRoot().appendChild(_overlayEl);

    _updateSliderBackground();

    registerModalDismiss(_handleClose);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);
    _bindEvents();

    if (isNative) {
        _playbackStoppedHandle = PrayerService.addListener('onPlaybackStopped', () => {
            _stopPreview();
        });
    }
}

function _handleClose(e) {
    if (e) e.stopPropagation();
    _stopPreview();
    if (_onSelectCallback) {
        _onSelectCallback(_currentVolume);
    }
    _hideModal();
}

function _bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) _handleClose(e);
    });

    const slider = _overlayEl.querySelector('#adzan-volume-slider');
    const valueDisplay = _overlayEl.querySelector('#adzan-volume-value');

    if (slider && valueDisplay) {
        slider.addEventListener('input', (e) => {
            _currentVolume = parseFloat(e.target.value);
            valueDisplay.textContent = `${t('components/modal/adzan-volume-modal:volume_label', { defaultValue: 'Volume' })} : ${Math.round(_currentVolume * 100)}%`;
            _updateSliderBackground();
            
            if (isNative && PrayerService.updatePreviewVolume) {
                // updatePreviewVolume ONLY changes the volume of the active MediaPlayer in memory.
                // It does NOT save to disk, preventing flash wear and state desync if user cancels.
                PrayerService.updatePreviewVolume({ volume: _currentVolume }).catch(() => {});
            }
        });

        // Add haptic feedback when user finishes dragging
        slider.addEventListener('change', () => {
            impact('light');
        });
    }
    
    const playBtn = _overlayEl.querySelector('#adzan-volume-preview-btn');
    if (playBtn) {
        playBtn.addEventListener('click', _handlePlay);
    }

    addEscHandler(_overlayEl, _handleClose);
}

async function _handlePlay(e) {
    if (e) e.stopPropagation();
    
    const playBtn = _overlayEl.querySelector('#adzan-volume-preview-btn');
    if (playBtn.classList.contains('loading')) return;

    if (!_isPreviewPlaying) {
        _stopPreview();

        playBtn.classList.add('loading');
        const icon = playBtn.querySelector('i');
        
        if (icon) {
            icon.classList.remove('bx-play-circle');
            icon.classList.add('bx-loader-alt', 'bx-spin');
        }

        const adzanId = store.getState('settings.adzan_selected');
        const audioFile = resolveAudioFile(adzanId, false);

        if (isNative) {
            try {
                await PrayerService.play({
                    prayerKey: 'dzuhur',
                    prayerName: `Volume Preview`,
                    audioFile,
                    isPreview: true,
                });

                playBtn.classList.remove('loading');
                playBtn.classList.add('is-playing');
                if (icon) {
                    icon.classList.remove('bx-loader-alt', 'bx-spin');
                    icon.classList.add('bx-pause-circle');
                }
                _isPreviewPlaying = true;
                
                // Immediately set current volume on the newly started player without saving to disk
                PrayerService.updatePreviewVolume({ volume: _currentVolume }).catch(() => {});
            } catch (err) {
                console.warn('[AdzanVolume] Preview play failed:', err);
                playBtn.classList.remove('loading');
                if (icon) {
                    icon.classList.remove('bx-loader-alt', 'bx-spin');
                    icon.classList.add('bx-play-circle');
                }
            }
        } else {
            // Web fallback for UI testing
            playBtn.classList.remove('loading');
            playBtn.classList.add('is-playing');
            if (icon) {
                icon.classList.remove('bx-loader-alt', 'bx-spin');
                icon.classList.add('bx-pause-circle');
            }
            _isPreviewPlaying = true;
        }
    } else {
        _stopPreview();
    }
}

function _stopPreview() {
    if (_isPreviewPlaying) {
        if (isNative) {
            PrayerService.stop().catch(err => console.warn(err));
        }
        _isPreviewPlaying = false;
        
        if (_overlayEl) {
            const playBtn = _overlayEl.querySelector('#adzan-volume-preview-btn');
            if (playBtn) {
                playBtn.classList.remove('is-playing', 'loading');
                const icon = playBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('bx-pause-circle', 'bx-loader-alt', 'bx-spin');
                    icon.classList.add('bx-play-circle');
                }
            }
        }
    }
}

function _updateSliderBackground() {
    if (!_overlayEl) return;
    const slider = _overlayEl.querySelector('#adzan-volume-slider');
    if (slider) {
        const percentage = (_currentVolume - 0.1) / (1.0 - 0.1) * 100;
        slider.style.background = `linear-gradient(to right, var(--clr-primary-500) 0%, var(--clr-primary-500) ${percentage}%, var(--clr-bg-card-solid) ${percentage}%, var(--clr-bg-card-solid) 100%)`;
    }
}

function _hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(_handleClose);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.adzan-volume-sheet');
    const target = sheet || _overlayEl;
    target.addEventListener('transitionend', _removeModal, { once: true });

    setTimeout(_removeModal, 450);
}

function _removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
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

function _createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-base modal-overlay-base--bottom adzan-volume-overlay';

    overlay.innerHTML = `
        <div class="modal-sheet-base adzan-volume-sheet" role="dialog" aria-modal="true" aria-labelledby="adzan-volume-title">
            <div class="adzan-volume-header">
                <h3 class="adzan-volume-title" id="adzan-volume-title">${t('components/modal/adzan-volume-modal:title', { defaultValue: 'Volume Adzan' })}</h3>
                <button class="adzan-volume-preview-btn" id="adzan-volume-preview-btn" aria-label="${t('components/modal/adzan-volume-modal:preview_play', { defaultValue: 'Putar Pratinjau' })}">
                    <i class='bx bx-play-circle'></i>
                </button>
            </div>
            
            <div class="adzan-volume-value-display" id="adzan-volume-value">${t('components/modal/adzan-volume-modal:volume_label', { defaultValue: 'Volume' })} : ${Math.round(_currentVolume * 100)}%</div>
            
            <div class="adzan-volume-slider-wrapper">
                <div class="adzan-volume-slider-container">
                    <i class='bx bx-volume-low'></i>
                    <div class="adzan-volume-track-wrapper">
                        <input type="range" 
                               id="adzan-volume-slider" 
                               class="adzan-volume-slider styled-slider" 
                               min="0.1" max="1.0" step="0.1" 
                               value="${_currentVolume}"
                               aria-label="${t('components/modal/adzan-volume-modal:title', { defaultValue: 'Volume Adzan' })}">
                        <div class="adzan-volume-ticks">
                            <span></span><span></span><span></span><span></span><span></span>
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                    </div>
                    <i class='bx bx-volume-full'></i>
                </div>
            </div>
            
            <p class="adzan-volume-desc">
                ${t('components/modal/adzan-volume-modal:description', { defaultValue: 'Volume ini menyesuaikan persentase dari batas maksimal volume alarm sistem perangkat Anda.' })}
            </p>

            <div class="adzan-volume-footer">
                <button class="btn btn--gold w-100" id="adzan-volume-btn-done">${t('btn_confirm', { defaultValue: 'Selesai' })}</button>
            </div>
        </div>
    `;

    const doneBtn = overlay.querySelector('#adzan-volume-btn-done');
    if (doneBtn) {
        doneBtn.addEventListener('click', _handleClose);
    }

    return overlay;
}
