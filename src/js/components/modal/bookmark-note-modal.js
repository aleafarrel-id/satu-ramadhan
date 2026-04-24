/**
 * Bookmark Note Modal Component
 * Slider Modal UI for editing custom notes on bookmarks.
 */

import '../../../css/components/modal/bookmark-note-modal.css';

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

let _overlayEl = null;
let _releaseFocus = null;
let _onSaveCallback = null;

export async function showBookmarkNoteModal(initialNote, onSave) {
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    await loadNS('pages/quran-pages/bookmark-page');
    _onSaveCallback = onSave;

    _overlayEl = createModalDOM(initialNote || '');
    document.body.appendChild(_overlayEl);

    registerModalDismiss(handleCancel);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);
    bindEvents();

    // Auto focus the input if possible
    setTimeout(() => {
        const input = _overlayEl.querySelector('.bookmark-note-input');
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }, 400);
}

function handleSave() {
    impact('medium');
    const input = _overlayEl.querySelector('.bookmark-note-input');
    const note = input ? input.value.trim() : '';
    
    if (_onSaveCallback) {
        _onSaveCallback(note);
    }
    
    hideModal();
}

function handleCancel(e) {
    if (e) e.stopPropagation();
    hideModal();
}

function bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) handleCancel(e);
    });

    const saveBtn = _overlayEl.querySelector('#note-btn-save');
    if (saveBtn) saveBtn.addEventListener('click', handleSave);

    const input = _overlayEl.querySelector('.bookmark-note-input');
    const hint = _overlayEl.querySelector('.bookmark-note-hint');
    
    if (input && hint) {
        input.addEventListener('input', () => {
            hint.textContent = `${input.value.length}/40`;
        });
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            }
        });
    }

    addEscHandler(_overlayEl, handleCancel);
}

function hideModal(onClosed) {
    if (!_overlayEl) {
        if (onClosed) onClosed();
        return;
    }

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    let isClosed = false;
    const finalize = () => {
        if (isClosed) return;
        isClosed = true;
        removeModal();
        if (onClosed) onClosed();
    };

    const sheet = _overlayEl.querySelector('.mushaf-jump-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', finalize, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', finalize, { once: true });
    }

    setTimeout(finalize, 450);
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
    _onSaveCallback = null;
}

function createModalDOM(initialNote) {
    const overlay = document.createElement('div');
    overlay.className = 'mushaf-jump-overlay';

    overlay.innerHTML = `
        <div class="mushaf-jump-sheet" role="dialog" aria-modal="true" aria-labelledby="bookmark-note-modal-title">
            <div class="mushaf-jump-header">
                <h3 class="mushaf-jump-title" id="bookmark-note-modal-title">${t('pages/quran-pages/bookmark-page:edit_note')}</h3>
            </div>
            
            <div class="bookmark-note-body">
                <input type="text" class="bookmark-note-input" maxlength="40" placeholder="${t('pages/quran-pages/bookmark-page:note_placeholder')}">
                <div class="bookmark-note-hint">${initialNote.length}/40</div>
            </div>

            <div class="mushaf-jump-footer">
                <button class="mushaf-jump-btn mushaf-jump-btn--cancel" id="note-btn-cancel">${t('common:cancel')}</button>
                <button class="mushaf-jump-btn mushaf-jump-btn--submit" id="note-btn-save">${t('pages/quran-pages/bookmark-page:save_note')}</button>
            </div>
        </div>
    `;

    const input = overlay.querySelector('.bookmark-note-input');
    if (input) {
        input.value = initialNote;
    }

    const cancelBtn = overlay.querySelector('#note-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    return overlay;
}
