/**
 * Permission Dialog Module
 * Reusable in-app rationale dialog shown before native OS permission prompts.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../system/back-handler.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

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
 * @param {string|boolean} [config.confirmIcon] - Default: 'bx-check'. Set to false/empty to hide.
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
    confirmIcon = 'bx-check',
    cancelText  = 'Lewati',
    theme       = 'default',
    onConfirm,
    onCancel,
    onClose,
}) {
    // Safe chaining: if called while another modal is animating out, just replace it instantly
    if (_overlayEl && _overlayEl.parentNode) {
        _overlayEl.remove();
    }

    _onConfirm    = onConfirm;
    _onCancel     = onCancel ?? null;
    let localOnClose = onClose; // capture locally for this specific modal instance
    _isConfirming = false;

    _overlayEl = buildDOM({ icon, iconColor, title, description, features, confirmText, confirmIcon, cancelText, theme });
    _overlayEl._onClose = localOnClose; // attach for handleCancel to access
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

    await loadNS('modules/permission/permission-dialog');

    const currentOverlay = _overlayEl;
    const btn = currentOverlay?.querySelector('#perm-dialog-btn-confirm');
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i><span>${t('modules/permission/permission-dialog:processing')}</span>`;
    }

    try {
        if (typeof _onConfirm === 'function') {
            await _onConfirm();
        }
    } catch (e) {
        console.warn('[PermissionDialog] onConfirm error:', e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        const onCloseCb = currentOverlay ? currentOverlay._onClose : null;
        hideSpecificModal(currentOverlay, onCloseCb, true);
    }
}

function handleCancel(e) {
    const currentOverlay = _overlayEl;
    if (typeof _onCancel === 'function') _onCancel();
    // In order to get the localOnClose for cancel, we would need to capture it in bindEvents.
    // Instead of completely refactoring to class-based, we'll extract the onClose from a weakmap or pass it.
    // Actually, localOnClose is in the scope of `showPermissionDialog` but handleCancel is outside.
    // So we can attach it to the DOM element!
    const onCloseCb = currentOverlay ? currentOverlay._onClose : null;
    hideSpecificModal(currentOverlay, onCloseCb, false);
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

function hideSpecificModal(targetOverlay, onCloseCallback, resultState = false) {
    if (!targetOverlay) return;

    unregisterModalDismiss(handleCancel);
    targetOverlay.classList.remove('active');
    
    // Prevent multiple executions
    if (targetOverlay._isRemoving) return;
    targetOverlay._isRemoving = true;
    
    const removeThisModal = () => {
        if (_releaseFocus) {
            try { _releaseFocus(); } catch (e) { console.warn('releaseFocus error', e); }
            _releaseFocus = null;
        }
        try {
            if (targetOverlay.parentNode) {
                targetOverlay.remove();
            }
        } catch(e) { console.warn('remove overlay error', e); }
        if (_overlayEl === targetOverlay) {
            _overlayEl = null;
            _onConfirm = null;
            _onCancel = null;
            _isConfirming = false;
        }
        if (typeof onCloseCallback === 'function') {
            onCloseCallback(resultState);
        }
    };
    
    targetOverlay.addEventListener('transitionend', removeThisModal, { once: true });
    setTimeout(removeThisModal, 400);
}

function buildDOM({ icon, iconColor, title, description, features, confirmText, confirmIcon, cancelText, theme }) {
    const overlay = document.createElement('div');
    overlay.className = 'perm-dialog-overlay';
    
    if (theme === 'quran') {
        overlay.classList.add('perm-dialog-overlay--quran');
    }

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
                    ${confirmIcon ? `<i class="bx ${confirmIcon} perm-dialog__btn-icon"></i>` : ''}
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
