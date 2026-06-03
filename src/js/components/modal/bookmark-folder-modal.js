/**
 * Bookmark Folder Modal
 *
 */

import '../../../css/components/modal/bookmark-folder-modal.css';

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';

const NS = 'pages/quran-pages/bookmark-page';

let _overlayEl = null;
let _releaseFocus = null;
let _onDone = null;   // callback(result) where result is null on cancel


/**
 * Show the folder modal in 'create' mode.
 * @param {Function} onDone - Called with the new folder name (string) or null on cancel
 */
export async function showCreateFolderModal(onDone, defaultValue = '', titleOverride = null) {
    await _open('create', null, onDone, defaultValue, titleOverride);
}




async function _open(mode, folder, onDone, defaultValue = '', titleOverride = null) {
    if (_overlayEl) {
        unregisterModalDismiss(_handleDismiss);
        _removeModal();
    }

    await loadNS(NS);
    _onDone = onDone || null;

    _overlayEl = _buildCreateDOM(defaultValue, titleOverride);

    getModalRoot().appendChild(_overlayEl);
    registerModalDismiss(_handleDismiss);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl?.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);
    _bindOverlayDismiss();
    addEscHandler(_overlayEl, _handleDismiss);

    if (mode === 'create') {
        _focusInput();
    }
}

function _handleDismiss() {
    _emit(null);
    _hideModal();
}

function _emit(result) {
    if (_onDone) {
        _onDone(result);
        _onDone = null;
    }
}

function _hideModal() {
    if (!_overlayEl) return;
    unregisterModalDismiss(_handleDismiss);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.bookmark-mgr-sheet');
    const target = sheet || _overlayEl;

    let closed = false;
    const finalize = () => {
        if (closed) return;
        closed = true;
        _removeModal();
    };

    target.addEventListener('transitionend', finalize, { once: true });
    setTimeout(finalize, 450);
}

function _removeModal() {
    _releaseFocus?.();
    _releaseFocus = null;
    _overlayEl?.remove();
    _overlayEl = null;
    _onDone = null;
}

function _bindOverlayDismiss() {
    _overlayEl?.addEventListener('click', e => {
        if (e.target === _overlayEl) _handleDismiss();
    });
}

function _focusInput() {
    setTimeout(() => {
        const input = _overlayEl?.querySelector('.bookmark-mgr-input');
        if (input) {
            input.focus();
            input.select();
        }
    }, 400);
}


function _buildCreateDOM(defaultValue, titleOverride) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-base modal-overlay-base--bottom bookmark-mgr-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet-base bookmark-mgr-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'bkmgr-create-title');

    // Header
    const header = document.createElement('div');
    header.className = 'bookmark-mgr-header';
    const title = document.createElement('h3');
    title.className = 'bookmark-mgr-title';
    title.id = 'bkmgr-create-title';
    title.textContent = titleOverride || t(`${NS}:folder_create_title`);
    header.appendChild(title);

    // Input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'bookmark-mgr-input-group';

    const label = document.createElement('label');
    label.className = 'bookmark-mgr-label';
    label.setAttribute('for', 'bkmgr-folder-input');
    label.textContent = t(`${NS}:folder_name_label`);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'bkmgr-folder-input';
    input.className = 'bookmark-mgr-input';
    input.maxLength = 30;
    input.placeholder = t(`${NS}:folder_name_placeholder`);
    input.setAttribute('autocomplete', 'off');
    input.value = defaultValue;

    const hint = document.createElement('div');
    hint.className = 'bookmark-mgr-hint';
    hint.textContent = `${defaultValue.length}/30`;

    input.addEventListener('input', () => {
        hint.textContent = `${input.value.length}/30`;
    });

    input.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            _submitCreate(input.value);
        }
    });

    inputGroup.append(label, input, hint);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'bookmark-mgr-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bookmark-mgr-btn bookmark-mgr-btn--cancel';
    cancelBtn.textContent = t('common:cancel');
    cancelBtn.addEventListener('click', _handleDismiss);

    const createBtn = document.createElement('button');
    createBtn.className = 'bookmark-mgr-btn bookmark-mgr-btn--primary';
    createBtn.textContent = t(`${NS}:folder_create_btn`);
    createBtn.addEventListener('click', () => _submitCreate(input.value));

    actions.append(cancelBtn, createBtn);
    sheet.append(header, inputGroup, actions);
    overlay.appendChild(sheet);
    return overlay;
}

function _submitCreate(rawName) {
    impact('light');
    const name = rawName.trim();
    _emit(name || null);
    _hideModal();
}