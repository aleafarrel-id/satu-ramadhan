/**
 * Adzan Selector Modal Component
 *
 * A modal for selecting Adzan sound preference.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { AVAILABLE_ADZANS } from '../../config/adzan-sounds.js';
import * as Notif from '../../modules/notification/notification.js';

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;

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
    
    _state.normal = currentAdzan;
    _state.subuh = currentAdzanSubuh || currentAdzan;
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
}

function _handleSelect(adzanId, e) {
    if (e) e.stopPropagation();
    impact('light');

    if (_state.activeTab === 'normal') {
        _state.normal = adzanId;
    } else {
        _state.subuh = adzanId;
    }

    _renderOptions(); // Refresh selection visually

    if (_onSelectCallback) {
        // Fire immediately upon selection as was original behavior
        _onSelectCallback({
            normal: _state.normal,
            subuh: _state.subuh
        });
    }
}

function _handlePlay(adzanId, playBtn, e) {
    if (e) e.stopPropagation();
    impact('medium');
    
    // Reset any other playing buttons
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
        playBtn.classList.add('playing');
        const icon = playBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('bx-play-circle');
            icon.classList.add('bx-pause-circle');
        }
        
        let adzanLabel = t(`components/modal/adzan-selector-modal:${adzanId}`);
        const previewType = _state.activeTab === 'subuh' ? '(Subuh)' : '(Normal)';
        Notif.show(`Memutar preview suara Adzan ${adzanLabel} ${previewType}...`, 'info');
        
        // Dummy timeout to simulate playback stop after 5 seconds
        setTimeout(() => {
            if (_overlayEl && playBtn.classList.contains('playing')) {
                playBtn.classList.remove('playing');
                if (icon) {
                    icon.classList.remove('bx-pause-circle');
                    icon.classList.add('bx-play-circle');
                }
            }
        }, 5000);
    } else {
        // Stop playback trigger
        playBtn.classList.remove('playing');
        const icon = playBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('bx-pause-circle');
            icon.classList.add('bx-play-circle');
        }
        Notif.show('Preview dihentikan.', 'info');
    }
}

function _handleCancel(e) {
    if (e) e.stopPropagation();
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
            impact('light');
            const targetTab = tab.dataset.tab;
            if (_state.activeTab !== targetTab) {
                _state.activeTab = targetTab;
                _overlayEl.querySelectorAll('.adzan-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                _renderOptions();
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

    const optionsHTML = AVAILABLE_ADZANS.map(({ id, labelKey }) => {
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

    overlay.querySelector('#adzan-btn-cancel')
        ?.addEventListener('click', _handleCancel);

    return overlay;
}
