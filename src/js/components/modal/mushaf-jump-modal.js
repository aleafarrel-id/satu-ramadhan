/**
 * Mushaf Jump Page Modal Component
 * A bottom sheet modal for jumping to a specific Mushaf page.
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { getTotalPages, clampPage } from '../../modules/quran/mushaf/mushaf-api.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';

let _overlayEl = null;
let _onJumpCallback = null;
let _releaseFocus = null;

export async function showMushafJumpModal({ current = 1, onJump } = {}) {
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    await loadNS('components/modal/mushaf-jump-modal');

    _onJumpCallback = onJump;

    _overlayEl = createModalDOM(current);
    getModalRoot().appendChild(_overlayEl);

    registerModalDismiss(handleCancel);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);

    bindEvents();
    
    // Auto-focus input on open
    const input = _overlayEl.querySelector('.mushaf-jump-input');
    if (input) {
        setTimeout(() => input.focus(), 100);
    }
}

function handleJump(e) {
    if (e) e.preventDefault();
    
    const input = _overlayEl.querySelector('.mushaf-jump-input');
    const errorMsg = _overlayEl.querySelector('.mushaf-jump-error');
    
    const val = parseInt(input.value, 10);
    const total = getTotalPages();
    
    if (isNaN(val) || val < 1 || val > total) {
        errorMsg.classList.add('visible');
        impact('error');
        return;
    }
    
    errorMsg.classList.remove('visible');
    impact('light');
    
    if (_onJumpCallback) {
        _onJumpCallback(clampPage(val));
    }
    
    hideModal();
}

function handleCancel(e) {
    if (e) e.preventDefault();
    hideModal();
}

function bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) handleCancel(e);
    });

    const form = _overlayEl.querySelector('.mushaf-jump-form');
    if (form) form.addEventListener('submit', handleJump);

    const cancelBtn = _overlayEl.querySelector('#mushaf-jump-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    
    const input = _overlayEl.querySelector('.mushaf-jump-input');
    const errorMsg = _overlayEl.querySelector('.mushaf-jump-error');
    if (input) {
        input.addEventListener('input', () => {
            errorMsg.classList.remove('visible');
        });
    }

    addEscHandler(_overlayEl, handleCancel);
}

function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.mushaf-jump-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

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
    _onJumpCallback = null;
}

function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-base modal-overlay-base--bottom mushaf-jump-overlay';

    const ns = 'components/modal/mushaf-jump-modal';
    const total = getTotalPages();

    overlay.innerHTML = `
        <div class="modal-sheet-base mushaf-jump-sheet" role="dialog" aria-modal="true" aria-labelledby="mushaf-jump-title">
            <div class="mushaf-jump-header">
                <h3 class="mushaf-jump-title" id="mushaf-jump-title">${t(`${ns}:title`)}</h3>
            </div>
            
            <form class="mushaf-jump-form" novalidate>
                <div class="mushaf-jump-input-group">
                    <input type="number" 
                           class="mushaf-jump-input" 
                           min="1" 
                           max="${total}" 
                           placeholder="${t(`${ns}:placeholder`)}" 
                           inputmode="numeric" 
                           pattern="[0-9]*" 
                           data-focus-item />
                    <div class="mushaf-jump-error">${t(`${ns}:error_range`)}</div>
                </div>
                
                <div class="mushaf-jump-footer">
                    <button type="button" class="mushaf-jump-btn mushaf-jump-btn--cancel" id="mushaf-jump-cancel">${t(`${ns}:cancel`)}</button>
                    <button type="submit" class="mushaf-jump-btn mushaf-jump-btn--submit">${t(`${ns}:jump`)}</button>
                </div>
            </form>
        </div>
    `;

    return overlay;
}
