/**
 * Audio Mode Selector Modal Component
 *
 * A modal for selecting the Murottal audio playback mode on native platforms.
 * Follows the exact pattern of `language-selector-modal.js` for consistency.
 *
 * Modes:
 *   - 'offline'   : Use locally downloaded files (saves data, needs storage)
 *   - 'streaming' : Stream from internet (saves space, requires connection)
 *
 * Only rendered on Native. Web is always forced to streaming.
 *
 * @module audio-mode-selector-modal
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

// ─── Internal State ───────────────────────────────────────────────────────────

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;

// ─── Mode Definitions ─────────────────────────────────────────────────────────

/** @returns {Array<{value: string, icon: string, labelKey: string, descKey: string}>} */
function _getModes() {
    return [
        {
            value: 'offline',
            icon: 'bx-cloud-download',
            labelKey: 'components/modal/audio-mode-selector-modal:mode_offline_label',
            descKey: 'components/modal/audio-mode-selector-modal:mode_offline_desc',
        },
        {
            value: 'streaming',
            icon: 'bx-wifi',
            labelKey: 'components/modal/audio-mode-selector-modal:mode_streaming_label',
            descKey: 'components/modal/audio-mode-selector-modal:mode_streaming_desc',
        },
    ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Shows the audio mode selection dialog.
 *
 * @param {Object} config
 * @param {'offline'|'streaming'} config.currentMode - Currently active mode
 * @param {Function} config.onSelect - Callback with the selected mode value
 */
export async function showAudioModeSelectorModal({ currentMode, onSelect } = {}) {
    // Prevent overlapping instances
    if (_overlayEl) {
        unregisterModalDismiss(_handleCancel);
        _removeModal();
    }

    await loadNS('components/modal/audio-mode-selector-modal');

    _onSelectCallback = onSelect;

    _overlayEl = _createModalDOM(currentMode);
    document.body.appendChild(_overlayEl);

    registerModalDismiss(_handleCancel);

    // Entrance animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Accessibility
    _releaseFocus = trapFocus(_overlayEl);

    _bindEvents();
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

function _handleSelect(modeValue, e) {
    if (e) e.stopPropagation();
    impact('light');

    // Visual feedback before closing
    const selectedItem = _overlayEl?.querySelector(`.audio-mode-option[data-value="${modeValue}"]`);
    if (selectedItem) {
        _overlayEl.querySelectorAll('.audio-mode-option').forEach(el => el.classList.remove('selected'));
        selectedItem.classList.add('selected');
    }

    if (_onSelectCallback) {
        _onSelectCallback(modeValue);
    }

    _hideModal();
}

function _handleCancel(e) {
    if (e) e.stopPropagation();
    _hideModal();
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

function _bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) _handleCancel(e);
    });

    _overlayEl.querySelectorAll('.audio-mode-option').forEach(option => {
        option.addEventListener('click', (e) => {
            _handleSelect(option.dataset.value, e);
        });
    });

    addEscHandler(_overlayEl, _handleCancel);
}

function _hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(_handleCancel);
    _overlayEl.classList.remove('active');

    const dialog = _overlayEl.querySelector('.audio-mode-selector-dialog');
    const target = dialog || _overlayEl;
    target.addEventListener('transitionend', _removeModal, { once: true });

    // Fallback if transition event fails to fire
    setTimeout(_removeModal, 350);
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

function _createModalDOM(currentMode) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay language-selector-overlay';

    const modesHTML = _getModes().map(({ value, icon, labelKey, descKey }) => {
        const isSelected = value === currentMode;
        return `
            <button class="audio-mode-option ${isSelected ? 'selected' : ''}" data-value="${value}">
                <i class='bx ${icon} audio-mode-icon'></i>
                <div class="audio-mode-info">
                    <div class="audio-mode-label">${t(labelKey)}</div>
                    <div class="audio-mode-desc">${t(descKey)}</div>
                </div>
                <i class='bx bx-check audio-mode-check'></i>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="confirm-dialog audio-mode-selector-dialog" role="dialog" aria-modal="true" aria-labelledby="audio-mode-modal-title">
            <h3 class="confirm-title" id="audio-mode-modal-title">${t('components/modal/audio-mode-selector-modal:title')}</h3>
            <div class="audio-mode-options-container">
                ${modesHTML}
            </div>
            <div class="confirm-actions">
                <button class="btn btn--outline confirm-btn w-100" id="audio-mode-btn-cancel">${t('close')}</button>
            </div>
        </div>
    `;

    overlay.querySelector('#audio-mode-btn-cancel')
        ?.addEventListener('click', _handleCancel);

    return overlay;
}
