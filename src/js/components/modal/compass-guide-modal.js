/**
 * Compass Guide Modal Component
 * Shows compass calibration and usage instructions.
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';

let _overlayEl = null;
let _releaseFocus = null;

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

    const btnClose = _overlayEl.querySelector('#compass-guide-close');
    btnClose?.addEventListener('click', hideModal);

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) {
            hideModal();
        }
    });

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
            <h2 class="compass-guide-modal__title">Panduan Kompas</h2>
            <div class="compass-guide-modal__items">
                <div class="compass-guide-item">
                    <i class='bx bx-infinite'></i>
                    <span>Gerakkan perangkat membentuk angka 8 untuk kalibrasi sensor</span>
                </div>
                <div class="compass-guide-item">
                    <i class='bx bx-mobile-landscape'></i>
                    <span>Orientasikan perangkat secara mendatar untuk akurasi terbaik</span>
                </div>
                <div class="compass-guide-item">
                    <i class='bx bx-magnet'></i>
                    <span>Jauhkan dari magnet, logam, dan perangkat elektronik lain</span>
                </div>
                <div class="compass-guide-item">
                    <i class='bx bx-target-lock'></i>
                    <span>Kompas menggunakan deklinasi magnetik untuk arah yang presisi</span>
                </div>
            </div>
            <div class="compass-guide-modal__buttons">
                <button class="compass-guide-modal__btn-close" id="compass-guide-close">
                    Tutup
                </button>
            </div>
        </div>
    `;

    return overlay;
}
