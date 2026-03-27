/**
 * Mushaf Guide Modal Component
 * Shows mushaf reading and navigation instructions.
 */

/* ── DOM References ── */
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';

let _overlayEl = null;
let _releaseFocus = null;

/* ── Public API ── */

/**
 * Show the mushaf guide modal.
 */
export function showMushafGuideModal() {
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
    const btnClose = _overlayEl.querySelector('#mushaf-guide-close');
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
    overlay.className = 'mushaf-guide-modal-overlay';

    overlay.innerHTML = `
        <div class="mushaf-guide-modal">
            <div class="mushaf-guide-modal__icon">
                <i class='bx bx-book-reader'></i>
            </div>
            <h2 class="mushaf-guide-modal__title">Panduan Mushaf</h2>
            <div class="mushaf-guide-modal__items">
                <div class="mushaf-guide-item">
                    <i class='bx bx-navigation'></i>
                    <span>Geser atau tekan sisi layar untuk berpindah halaman</span>
                </div>
                <div class="mushaf-guide-item">
                    <i class='bx bx-zoom-in'></i>
                    <span>Tekan ikon zoom untuk memperbesar dan tekan lagi untuk memperkecil</span>
                </div>
                <div class="mushaf-guide-item">
                    <i class='bx bx-menu'></i>
                    <span>Klik ikon menu untuk pindah surah dengan mudah</span>
                </div>
            </div>
            <div class="mushaf-guide-modal__buttons">
                <button class="mushaf-guide-modal__btn-close" id="mushaf-guide-close">
                    Tutup
                </button>
            </div>
        </div>
    `;

    return overlay;
}
