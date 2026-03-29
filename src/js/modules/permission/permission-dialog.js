/**
 * Permission Dialog Module
 * Reusable in-app rationale dialog shown before native OS permission prompts.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../system/back-handler.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';

let _overlayEl    = null;
let _onConfirm    = null;
let _onCancel     = null;
let _releaseFocus = null;
let _isConfirming = false;

/**
 * Show a permission rationale dialog.
 *
 * @param {object}   config
 * @param {string}   config.icon          - Boxicons class (e.g. 'bx-bell')
 * @param {string}   [config.iconColor]   - 'accent' | 'primary' | 'info'
 * @param {string}   config.title
 * @param {string}   config.description
 * @param {Array}    [config.features]    - [{icon, label}]
 * @param {string}   [config.confirmText] - Default: 'Izinkan'
 * @param {string}   [config.cancelText]  - Default: 'Lewati'
 * @param {Function} config.onConfirm
 * @param {Function} [config.onCancel]
 */
export function showPermissionDialog({
    icon        = 'bx-shield-check',
    iconColor   = 'accent',
    title,
    description,
    features    = [],
    confirmText = 'Izinkan',
    cancelText  = 'Lewati',
    onConfirm,
    onCancel,
}) {
    if (_overlayEl) removeModal();

    _onConfirm    = onConfirm;
    _onCancel     = onCancel ?? null;
    _isConfirming = false;

    _overlayEl = buildDOM({ icon, iconColor, title, description, features, confirmText, cancelText });
    document.body.appendChild(_overlayEl);

    registerModalDismiss(handleCancel);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            _overlayEl.classList.add('active');
        });
    });

    _releaseFocus = trapFocus(_overlayEl);
    bindEvents();
}

async function handleConfirm() {
    if (_isConfirming) return;
    _isConfirming = true;

    const btn = _overlayEl?.querySelector('#perm-dialog-btn-confirm');
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i><span>Memproses...</span>`;
    }

    try {
        if (typeof _onConfirm === 'function') await _onConfirm();
    } catch (e) {
        console.warn('[PermissionDialog] onConfirm error:', e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        hideModal();
    }
}

function handleCancel() {
    if (typeof _onCancel === 'function') _onCancel();
    hideModal();
}

function bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) handleCancel();
    });

    _overlayEl.querySelector('#perm-dialog-btn-confirm')
        ?.addEventListener('click', handleConfirm);

    _overlayEl.querySelector('#perm-dialog-btn-cancel')
        ?.addEventListener('click', handleCancel);

    addEscHandler(_overlayEl, handleCancel);
}

function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');
    _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    setTimeout(removeModal, 400);
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
    _onConfirm    = null;
    _onCancel     = null;
    _isConfirming = false;
}

function buildDOM({ icon, iconColor, title, description, features, confirmText, cancelText }) {
    const overlay = document.createElement('div');
    overlay.className = 'perm-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'perm-dialog-title');

    overlay.innerHTML = `
        <div class="perm-dialog__card">
            <div class="perm-dialog__icon-wrap perm-dialog__icon-wrap--${iconColor}">
                <i class="bx ${icon} perm-dialog__icon"></i>
            </div>
            <div class="perm-dialog__body">
                <h2 class="perm-dialog__title" id="perm-dialog-title">${title}</h2>
                <p class="perm-dialog__desc">${description}</p>
                ${features.length > 0 ? `
                <ul class="perm-dialog__features" role="list">
                    ${features.map(f => `
                    <li class="perm-dialog__feature-item">
                        <span class="perm-dialog__feature-icon" aria-hidden="true">
                            <i class="bx ${f.icon}"></i>
                        </span>
                        <span class="perm-dialog__feature-label">${f.label}</span>
                    </li>`).join('')}
                </ul>` : ''}
            </div>
            <div class="perm-dialog__actions">
                <button class="perm-dialog__btn--primary" id="perm-dialog-btn-confirm">
                    <i class="bx bx-check perm-dialog__btn-icon"></i>
                    <span>${confirmText}</span>
                </button>
                <button class="perm-dialog__btn--ghost" id="perm-dialog-btn-cancel">
                    ${cancelText}
                </button>
            </div>
        </div>
    `;

    return overlay;
}
