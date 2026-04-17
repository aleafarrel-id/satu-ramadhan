/**
 * Language Selector Modal Component
 * A reusable UI component for selecting the Quran translation language.
 */

// Core & Libraries
import { QURAN_LANGUAGES } from '../../config/quran-languages.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;

/**
 * Shows the language selection dialog.
 * 
 * @param {Object} config
 * @param {string} config.currentLang - The currently selected language code
 * @param {Function} config.onSelect - Callback executed when a language is selected, passed the language code
 */
export async function showLanguageSelectorModal({
    currentLang,
    onSelect
} = {}) {
    // Prevent overlapping modals
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    await loadNS('components/modal/language-selector-modal');

    _onSelectCallback = onSelect;

    _overlayEl = createModalDOM(currentLang);
    document.body.appendChild(_overlayEl);

    // Register back handlers
    registerModalDismiss(handleCancel);

    // Entrance animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    // Accessibility
    _releaseFocus = trapFocus(_overlayEl);

    bindEvents();
}

/**
 * Select action handler
 */
function handleSelect(langCode, e) {
    if (e) e.stopPropagation();
    impact('light');

    // Animate selection visual feedback before hiding
    const selectedItem = _overlayEl.querySelector(`.lang-option[data-code="${langCode}"]`);
    if (selectedItem) {
        _overlayEl.querySelectorAll('.lang-option').forEach(el => el.classList.remove('selected'));
        selectedItem.classList.add('selected');
    }

    if (_onSelectCallback) {
        _onSelectCallback(langCode);
    }

    hideModal();
}

/**
 * Cancel handler (back button, click outside, escape)
 */
function handleCancel(e) {
    if (e) e.stopPropagation();
    hideModal();
}

function bindEvents() {
    if (!_overlayEl) return;

    // Dismiss on background click
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) handleCancel(e);
    });

    // Language options
    const options = _overlayEl.querySelectorAll('.lang-option');
    options.forEach(option => {
        option.addEventListener('click', (e) => {
            const code = option.getAttribute('data-code');
            handleSelect(code, e);
        });
    });

    addEscHandler(_overlayEl, handleCancel);
}

function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.language-selector-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    // Fallback if transition event fails
    setTimeout(removeModal, 450);
}

function removeModal() {
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

function createModalDOM(currentLang) {
    const overlay = document.createElement('div');
    overlay.className = 'language-selector-overlay';

    // Build the language list based on config array
    const langListHTML = QURAN_LANGUAGES.map(lang => {
        const isSelected = lang.code === currentLang;
        return `
            <button class="lang-option ${isSelected ? 'selected' : ''}" data-code="${lang.code}" data-focus-item>
                <i class='bx ${lang.icon || 'bx-globe'} lang-icon'></i>
                <div class="lang-info">
                    <div class="lang-label">${lang.label}</div>
                    ${lang.desc ? `<div class="lang-desc">${lang.desc}</div>` : ''}
                </div>
                <!-- Selection indicator -->
                <i class='bx bx-check lang-check'></i>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="language-selector-sheet" role="dialog" aria-modal="true" aria-labelledby="lang-modal-title">
            <div class="language-selector-header">
                <h3 class="language-selector-title" id="lang-modal-title">${t('components/modal/language-selector-modal:title')}</h3>
            </div>
            <div class="lang-options-container" data-focus-group="lang-options" data-focus-direction="vertical">
                ${langListHTML}
            </div>
            <div class="language-selector-footer">
                <button class="btn btn--outline w-100" id="lang-btn-cancel">${t('close')}</button>
            </div>
        </div>
    `;

    // Ensure the cancel btn is wired too
    const cancelBtn = overlay.querySelector('#lang-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    return overlay;
}
