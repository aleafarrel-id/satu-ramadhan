/**
 * App Language Modal Component
 * A reusable UI component for selecting the application language.
 * Reuses the styling of language-selector-modal.css.
 */

// Core & Libraries
import { APP_LANGUAGES } from '../../config/languages.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;

/**
 * Shows the app language selection dialog.
 * 
 * @param {Object} config
 * @param {string} config.currentLang - The currently selected language code ('auto' or valid code)
 * @param {Function} config.onSelect - Callback executed when a language is selected, passed the language code
 */
export async function showAppLanguageModal({
    currentLang,
    onSelect
} = {}) {
    // Prevent overlapping modals
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    await loadNS('components/modal/app-language-modal');

    _onSelectCallback = onSelect;

    _overlayEl = createModalDOM(currentLang);
    document.body.appendChild(_overlayEl);

    // Register back handlers
    registerModalDismiss(handleCancel);

    // Entrance animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

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

    const dialog = _overlayEl.querySelector('.language-selector-dialog');
    if (dialog) {
        dialog.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    // Fallback if transition event fails
    setTimeout(removeModal, 350);
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
    overlay.className = 'confirm-overlay language-selector-overlay'; 

    // Auto option
    const isAutoSelected = currentLang === 'auto';
    const autoOptionHTML = `
        <button class="lang-option ${isAutoSelected ? 'selected' : ''}" data-code="auto">
            <i class='bx bx-devices lang-icon'></i>
            <div class="lang-info">
                <div class="lang-label">${t('components/modal/app-language-modal:auto')}</div>
                <div class="lang-desc">${t('components/modal/app-language-modal:auto_desc')}</div>
            </div>
            <!-- Selection indicator -->
            <i class='bx bx-check lang-check'></i>
        </button>
    `;

    // Explicit languages
    const langListHTML = APP_LANGUAGES.map(lang => {
        const isSelected = lang.code === currentLang;
        return `
            <button class="lang-option ${isSelected ? 'selected' : ''}" data-code="${lang.code}">
                <i class='bx bx-globe lang-icon'></i>
                <div class="lang-info">
                    <div class="lang-label">${lang.nativeLabel}</div>
                    <div class="lang-desc">${lang.label}</div>
                </div>
                <!-- Selection indicator -->
                <i class='bx bx-check lang-check'></i>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="confirm-dialog language-selector-dialog" role="dialog" aria-modal="true" aria-labelledby="app-lang-modal-title">
            <h3 class="confirm-title" id="app-lang-modal-title">${t('components/modal/app-language-modal:title')}</h3>
            <div class="lang-options-container">
                ${autoOptionHTML}
                ${langListHTML}
            </div>
            <div class="confirm-actions">
                <button class="btn btn--outline confirm-btn w-100" id="lang-btn-cancel">${t('close')}</button>
            </div>
        </div>
    `;

    // Ensure the cancel btn is wired too
    const cancelBtn = overlay.querySelector('#lang-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    return overlay;
}
