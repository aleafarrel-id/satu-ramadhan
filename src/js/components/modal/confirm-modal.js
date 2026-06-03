/**
 * Generic Confirm Modal
 * A reusable UI component for asking user confirmation before destructive actions.
 */

// Stylesheet
import '../../../css/components/modal/confirm-modal.css';

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

let _overlayEl = null;
let _onConfirmCallback = null;
let _onCancelCallback = null;
let _releaseFocus = null;

/**
 * Shows a confirmation dialog.
 * 
 * @param {Object} config
 * @param {string} config.title - Title of the modal
 * @param {string} config.message - Description message
 * @param {string} [config.confirmText='Hapus'] - Text for the confirm button
 * @param {string} [config.cancelText='Batal'] - Text for the cancel button
 * @param {boolean} [config.isDanger=true] - If true, confirm button will be red
 * @param {Function} config.onConfirm - Callback executed when user confirms
 * @param {Function} [config.onCancel] - Optional callback executed when user cancels/dismisses
 * @param {string} [config.theme='default'] - Visual theme constraint, e.g. 'quran'
 */
export async function showConfirmModal({
    title,
    message,
    confirmText,
    cancelText,
    isDanger = true,
    theme = 'default',
    onConfirm,
    onCancel
}) {
    // Load common namespace before rendering
    await loadNS('common');

    // Use translated defaults after namespace is loaded
    if (confirmText === undefined) confirmText = t('delete');
    if (cancelText === undefined) cancelText = t('cancel');
    // If a modal is already open, remove it immediately to prevent overlap issues
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    _onConfirmCallback = onConfirm;
    _onCancelCallback = onCancel || null;

    _overlayEl = createModalDOM(title, message, confirmText, cancelText, isDanger, theme);
    document.body.appendChild(_overlayEl);

    // Register hardware back button to trigger cancel
    registerModalDismiss(handleCancel);

    // Trigger entrance animation next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    // Bind events
    bindEvents();
}

/**
 * Handle confirmation action
 */
function handleConfirm() {
    impact('medium');
    if (_onConfirmCallback) _onConfirmCallback();
    hideModal();
}

/**
 * Handle cancel action (button, overlay click, or back button)
 */
function handleCancel() {
    if (_onCancelCallback) _onCancelCallback();
    hideModal();
}

/**
 * Bind click events to the DOM
 */
function bindEvents() {
    if (!_overlayEl) return;

    // Dismiss on overlay click (outside the dialog box)
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) handleCancel();
    });

    // Buttons
    _overlayEl.querySelector('#confirm-btn-cancel')?.addEventListener('click', handleCancel);
    _overlayEl.querySelector('#confirm-btn-action')?.addEventListener('click', handleConfirm);

    addEscHandler(_overlayEl, handleCancel);
}

/**
 * Triggers the exit animation then removes the modal.
 */
function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    let isRemoved = false;
    const finalize = () => {
        if (isRemoved) return;
        isRemoved = true;
        removeModal();
    };

    const dialog = _overlayEl.querySelector('.confirm-dialog');
    if (dialog) {
        dialog.addEventListener('transitionend', finalize, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', finalize, { once: true });
    }

    // Safety fallback
    setTimeout(finalize, 350);
}

/**
 * Physically removes the element from the DOM and cleans up references.
 */
function removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    _onConfirmCallback = null;
    _onCancelCallback = null;
}

/**
 * Constructs the DOM string for the modal.
 */
function createModalDOM(title, message, confirmText, cancelText, isDanger, theme) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-base modal-overlay-base--center confirm-overlay';

    if (theme === 'quran') {
        overlay.classList.add('confirm-overlay--quran');
    }

    const confirmBtnClass = isDanger ? 'btn--danger' : 'btn--gold';

    overlay.innerHTML = `
        <div class="modal-popup-base confirm-dialog">
            <h3 class="confirm-title"></h3>
            <p class="confirm-message">${message}</p>
            <div class="confirm-actions">
                <button class="btn btn--outline confirm-btn" id="confirm-btn-cancel"></button>
                <button class="btn ${confirmBtnClass} confirm-btn" id="confirm-btn-action"></button>
            </div>
        </div>
    `;

    // Set text-only values via textContent to prevent injection
    overlay.querySelector('.confirm-title').textContent = title;
    overlay.querySelector('#confirm-btn-cancel').textContent = cancelText;
    overlay.querySelector('#confirm-btn-action').textContent = confirmText;

    return overlay;
}
