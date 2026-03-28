/**
 * Share Schedule Modal
 * Preview modal for the share schedule feature.
 * Orchestrates the builder and exporter to display a PNG preview.
 *
 * @module share-schedule-modal
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { buildShareScheduleElement, destroyShareScheduleElement } from '../../modules/share/share-schedule-builder.js';
import { captureScheduleImage } from '../../modules/share/share-schedule-exporter.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';

let _overlayEl = null;
let _canvas = null;
let _hiddenEl = null;
let _releaseFocus = null;
let _onShareCb = null;
let _onDownloadCb = null;
let _onCancelCb = null;

/**
 * Show the share schedule preview modal.
 * Builds the hidden template, captures it as a PNG, and displays a preview.
 *
 * @param {Object}   config
 * @param {Object}   config.payload    - ShareSchedulePayload for the builder
 * @param {Function} config.onShare    - Async callback when user confirms share (receives canvas)
 * @param {Function} config.onDownload - Async callback when user confirms download (receives canvas)
 * @param {Function} [config.onCancel] - Optional callback when modal is dismissed
 */
export async function showShareScheduleModal({ payload, onShare, onDownload, onCancel }) {
    // Prevent duplicate modals
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    _onShareCb = onShare;
    _onDownloadCb = onDownload;
    _onCancelCb = onCancel || null;

    // Create and mount the modal DOM (initially shows loading spinner)
    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register hardware back button dismiss
    registerModalDismiss(handleCancel);

    // Trigger entrance animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    // Bind interactive events
    bindEvents();

    // Build template, capture, and show preview (async pipeline)
    try {
        // Builder returns the #share-schedule-container element (inside a hidden iframe).
        // The element has _fontEmbedCSS attached for the exporter.
        _hiddenEl = await buildShareScheduleElement(payload);
        _canvas = await captureScheduleImage(_hiddenEl);

        // Remove hidden iframe (no longer needed after capture)
        destroyShareScheduleElement(_hiddenEl);
        _hiddenEl = null;

        // Replace spinner with preview image
        showPreviewImage(_canvas);

    } catch (err) {
        console.error('[share-schedule-modal] Failed to generate preview:', err);
        showErrorState();
    }
}

/**
 * Handle the share action — haptic feedback, delegate to caller, close modal.
 */
async function handleShare() {
    if (!_canvas || !_onShareCb) return;

    impact('medium');
    setButtonsLoading(true);

    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));

    try {
        await _onShareCb(_canvas);
    } catch (err) {
        console.error('[share-schedule-modal] Share failed:', err);
    }

    setButtonsLoading(false);
    hideModal();
}

/**
 * Handle the download action — haptic feedback, delegate to caller, close modal.
 */
async function handleDownload() {
    if (!_canvas || !_onDownloadCb) return;

    impact('medium');
    setButtonsLoading(true);

    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));

    try {
        await _onDownloadCb(_canvas);
    } catch (err) {
        console.error('[share-schedule-modal] Download failed:', err);
    }

    setButtonsLoading(false);
    hideModal();
}

/**
 * Handle cancel — dismiss modal, invoke optional cancel callback.
 */
function handleCancel() {
    if (_onCancelCb) _onCancelCb();
    hideModal();
}

/**
 * Bind click events to overlay and action buttons.
 */
function bindEvents() {
    if (!_overlayEl) return;

    // Dismiss on clicking outside the image or buttons
    _overlayEl.addEventListener('click', (e) => {
        const isImage = e.target.closest('.ss-modal__preview-img');
        const isActions = e.target.closest('.ss-modal__actions');

        if (!isImage && !isActions) {
            handleCancel();
        }
    });

    // Action buttons
    _overlayEl.querySelector('#ss-modal-btn-share')?.addEventListener('click', handleShare);
    _overlayEl.querySelector('#ss-modal-btn-download')?.addEventListener('click', handleDownload);

    // Escape key to cancel
    addEscHandler(_overlayEl, handleCancel);
}

/**
 * Trigger exit animation then remove the modal from the DOM.
 */
function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    const dialog = _overlayEl.querySelector('.ss-modal');
    if (dialog) {
        dialog.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    // Safety fallback in case transitionend doesn't fire
    setTimeout(removeModal, 350);
}

/**
 * Physically remove the modal element from the DOM and clean up all references.
 */
function removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }

    // Clean up hidden template if still present (e.g. on early cancel)
    if (_hiddenEl) {
        destroyShareScheduleElement(_hiddenEl);
        _hiddenEl = null;
    }

    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }

    _canvas = null;
    _onShareCb = null;
    _onDownloadCb = null;
    _onCancelCb = null;
}

/**
 * Construct the modal overlay and dialog DOM.
 * Initially renders in a loading state with a spinner.
 *
 * @returns {HTMLElement} The overlay element
 */
function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'ss-modal-overlay';

    overlay.innerHTML = `
        <div class="ss-modal">
            <div class="ss-modal__preview-wrapper" id="ss-modal-preview">
                <div class="ss-modal__loading">
                    <i class='bx bx-loader-alt bx-spin'></i>
                    <span class="ss-modal__loading-text">Memuat jadwal</span>
                </div>
            </div>

            <div class="ss-modal__actions">
                <button class="btn btn--gold ss-modal__btn" id="ss-modal-btn-share" disabled>
                    <i class='bx bx-share'></i>
                    <span>Bagikan</span>
                </button>
                <button class="btn btn--outline ss-modal__btn" id="ss-modal-btn-download" disabled>
                    <i class='bx bx-down-arrow-circle'></i>
                    <span>Unduh</span>
                </button>
            </div>
        </div>
    `;

    return overlay;
}

/**
 * Replace the loading spinner with the preview image from the captured canvas.
 *
 * @param {HTMLCanvasElement} canvas - Captured canvas to display
 */
function showPreviewImage(canvas) {
    if (!_overlayEl) return;

    const previewWrapper = _overlayEl.querySelector('#ss-modal-preview');
    if (!previewWrapper) return;

    const img = document.createElement('img');
    img.className = 'ss-modal__preview-img';
    img.src = canvas.toDataURL('image/png');
    img.alt = 'Preview jadwal imsakiyah';

    previewWrapper.innerHTML = '';
    previewWrapper.appendChild(img);

    // Enable action buttons now that preview is ready
    const shareBtn = _overlayEl.querySelector('#ss-modal-btn-share');
    const downloadBtn = _overlayEl.querySelector('#ss-modal-btn-download');
    if (shareBtn) shareBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = false;
}

/**
 * Show an error state inside the preview wrapper when capture fails.
 */
function showErrorState() {
    if (!_overlayEl) return;

    const previewWrapper = _overlayEl.querySelector('#ss-modal-preview');
    if (!previewWrapper) return;

    previewWrapper.innerHTML = `
        <div class="ss-modal__loading">
            <i class='bx bx-error-circle ss-modal__error-icon'></i>
            <span class="ss-modal__loading-text">Gagal membuat preview</span>
        </div>
    `;
}

/**
 * Toggle loading state on action buttons during share/download operations.
 *
 * @param {boolean} loading - Whether buttons should be in a loading state
 */
function setButtonsLoading(loading) {
    if (!_overlayEl) return;

    const shareBtn = _overlayEl.querySelector('#ss-modal-btn-share');
    const downloadBtn = _overlayEl.querySelector('#ss-modal-btn-download');
    const cancelBtn = _overlayEl.querySelector('#ss-modal-btn-cancel');

    if (shareBtn) shareBtn.disabled = loading;
    if (downloadBtn) downloadBtn.disabled = loading;
    if (cancelBtn) cancelBtn.disabled = loading;
}
