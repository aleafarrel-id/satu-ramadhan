/**
 * Location Modal Component
 * Shows a GPS / Manual location choice modal.
 * Used on first launch (no cached location) or when user taps "Ubah".
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { t, loadNS } from '../../core/i18n.js';

// Utilities & Helpers
import { handleGpsDetectionWithButton } from '../../utils/location-feedback.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';

let _overlayEl = null;
let _releaseFocus = null;

/**
 * Show the location modal.
 * @param {object} options
 * @param {Function} options.onLocationDetected  - called with location object after GPS success
 * @param {Function} options.onManualSelect      - called when user picks "Pilih Manual"
 * @returns {void}
 */
export async function showLocationModal({ onLocationDetected, onManualSelect }) {
    // Prevent duplicates
    if (_overlayEl) removeModal();

    await loadNS('components/modal/location-modal');

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideModal);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    const btnGps = _overlayEl.querySelector('#loc-modal-btn-gps');
    btnGps?.addEventListener('click', () => {
        handleGpsDetectionWithButton(btnGps, (location) => {
            hideModal();
            onLocationDetected?.(location);
        });
    });

    const btnManual = _overlayEl.querySelector('#loc-modal-btn-manual');
    btnManual?.addEventListener('click', () => {
        hideModal();
        onManualSelect?.();
    });

    _overlayEl.addEventListener('click', (e) => {
        const isDetecting = btnGps?.disabled;
        if (e.target === _overlayEl && !isDetecting) {
            hideModal();
        }
    });

    addEscHandler(_overlayEl, hideModal);
}

/**
 * Check if the location modal is currently active/visible.
 * @returns {boolean} True if the modal is currently rendered.
 */
export function isModalActive() {
    return _overlayEl !== null;
}

/**
 * Hide the location modal with exit animation, then remove from DOM.
 * @returns {Promise<void>} Resolves when the modal is fully removed from DOM.
 */
export function hideModal() {
    return new Promise((resolve) => {
        if (!_overlayEl) {
            resolve();
            return;
        }

        _overlayEl.classList.remove('active');

        let isRemoved = false;
        const finalize = () => {
            if (isRemoved) return;
            isRemoved = true;
            removeModal();
            resolve();
        };

        _overlayEl.addEventListener('transitionend', finalize, { once: true });
        setTimeout(finalize, 400);
    });
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
    overlay.className = 'modal-overlay-base modal-overlay-base--center location-modal-overlay';

    overlay.innerHTML = `
        <div class="modal-popup-base location-modal">
            <div class="location-modal__icon">
                <i class='bx bx-map-pin'></i>
            </div>
            <h2 class="location-modal__title">${t('components/modal/location-modal:title')}</h2>
            <p class="location-modal__desc">
                ${t('components/modal/location-modal:desc')}
            </p>
            <div class="location-modal__buttons" data-focus-group="location-modal-btns" data-focus-direction="vertical">
                <button class="location-modal__btn-gps" id="loc-modal-btn-gps" data-focus-item>
                    <i class='bx bx-current-location'></i>
                    <span>${t('components/modal/location-modal:btn_gps')}</span>
                </button>
                <button class="location-modal__btn-manual" id="loc-modal-btn-manual" data-focus-item>
                    <i class='bx bx-search'></i>
                    <span>${t('components/modal/location-modal:btn_manual')}</span>
                </button>
            </div>
        </div>
    `;

    return overlay;
}
