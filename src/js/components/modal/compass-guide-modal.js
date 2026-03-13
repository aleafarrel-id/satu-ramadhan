/**
 * Compass Guide Modal Component
 * Shows compass calibration instructions.
 */

/* ── DOM References ── */
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';

let _overlayEl = null;
let _releaseFocus = null;

/* ── Public API ── */

/**
 * Show the compass guide modal.
 */
export function showCompassGuideModal() {
    // Prevent duplicates
    if (_overlayEl) removeModal();

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideModal);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    // ── Bind: Close button ──
    const btnClose = _overlayEl.querySelector('#compass-guide-close');
    btnClose?.addEventListener('click', hideModal);

    // ── Bind: Click outside to close ──
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) {
            hideModal();
        }
    });

    // ── Bind: Escape to close ──
    addEscHandler(_overlayEl, hideModal);
}

/**
 * Hide the modal with exit animation, then remove from DOM.
 */
export function hideModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');
    _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    // Safety: force remove after animation duration
    setTimeout(removeModal, 400);
}

/* ── Internal Helpers ── */

function removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    // Unregister from hardware back handler
    unregisterModalDismiss(hideModal);
}

/**
 * Create the modal DOM tree.
 */
function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'compass-guide-modal-overlay';

    overlay.innerHTML = `
        <div class="compass-guide-modal">
            <div class="compass-guide-modal__icon">
                <i class='bx bx-compass'></i>
            </div>
            <h2 class="compass-guide-modal__title">Panduan Kalibrasi</h2>
            <p class="compass-guide-modal__desc">
                Orientasikan perangkat secara mendatar untuk akurasi terbaik. 
                Kompas memerlukan sensor <strong>Gyroscope</strong>.
            </p>
            <div class="compass-guide-modal__buttons">
                <button class="compass-guide-modal__btn-close" id="compass-guide-close">
                    Tutup
                </button>
            </div>
        </div>
    `;

    return overlay;
}
