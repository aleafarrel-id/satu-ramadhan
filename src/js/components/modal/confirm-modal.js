/**
 * Generic Confirm Modal
 * A reusable UI component for asking user confirmation before destructive actions.
 * Follows SoC: purely UI, no storage logic.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';

let _overlayEl = null;
let _onConfirmCallback = null;
let _onCancelCallback = null;

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
 */
export function showConfirmModal({
    title,
    message,
    confirmText = 'Hapus',
    cancelText = 'Batal',
    isDanger = true,
    onConfirm,
    onCancel
}) {
    // If a modal is already open, remove it immediately to prevent overlap issues
    if (_overlayEl) removeModal();

    _onConfirmCallback = onConfirm;
    _onCancelCallback = onCancel || null;

    _overlayEl = createModalDOM(title, message, confirmText, cancelText, isDanger);
    document.body.appendChild(_overlayEl);

    // Register hardware back button to trigger cancel
    registerModalDismiss(handleCancel);

    // Trigger entrance animation next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

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
}

/**
 * Triggers the exit animation then removes the modal.
 */
function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    const dialog = _overlayEl.querySelector('.confirm-dialog');
    if (dialog) {
        dialog.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    // Safety fallback
    setTimeout(removeModal, 350);
}

/**
 * Physically removes the element from the DOM and cleans up references.
 */
function removeModal() {
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
function createModalDOM(title, message, confirmText, cancelText, isDanger) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const confirmBtnClass = isDanger ? 'btn--danger' : 'btn--gold';

    overlay.innerHTML = `
        <div class="confirm-dialog">
            <h3 class="confirm-title">${title}</h3>
            <p class="confirm-message">${message}</p>
            <div class="confirm-actions">
                <button class="btn btn--outline confirm-btn" id="confirm-btn-cancel">${cancelText}</button>
                <button class="btn ${confirmBtnClass} confirm-btn" id="confirm-btn-action">${confirmText}</button>
            </div>
        </div>
    `;

    return overlay;
}
