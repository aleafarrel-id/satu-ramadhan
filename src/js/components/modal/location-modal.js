/**
 * Location Modal Component
 * Shows a GPS / Manual location choice modal.
 * Used on first launch (no cached location) or when user taps "Ubah".
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

import { handleGpsDetectionWithButton } from '../../utils/location-feedback.js';

/* ── DOM References ── */
let _overlayEl = null;

/* ── State ── */
// State is purely DOM-based now (button.disabled)

/* ── Public API ── */

/**
 * Show the location modal.
 * @param {object} options
 * @param {Function} options.onLocationDetected  - called with location object after GPS success
 * @param {Function} options.onManualSelect      - called when user picks "Pilih Manual"
 * @returns {void}
 */
export function showLocationModal({ onLocationDetected, onManualSelect }) {
    // Prevent duplicates
    if (_overlayEl) removeModal();

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideModal);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // ── Bind: GPS button ──
    const btnGps = _overlayEl.querySelector('#loc-modal-btn-gps');
    btnGps?.addEventListener('click', () => {
        handleGpsDetectionWithButton(btnGps, (location) => {
            hideModal();
            onLocationDetected?.(location);
        });
    });

    // ── Bind: Manual button ──
    const btnManual = _overlayEl.querySelector('#loc-modal-btn-manual');
    btnManual?.addEventListener('click', () => {
        hideModal();
        onManualSelect?.();
    });

    // ── Bind: Click outside to close ──
    _overlayEl.addEventListener('click', (e) => {
        const isDetecting = btnGps?.disabled;
        if (e.target === _overlayEl && !isDetecting) {
            hideModal();
        }
    });
}

/**
 * Hide the location modal with exit animation, then remove from DOM.
 */
export function hideModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');
    _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    // Safety: force remove after animation duration in case event doesn't fire
    setTimeout(removeModal, 400);
}

/* ── Internal Helpers ── */

function removeModal() {
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
    overlay.className = 'location-modal-overlay';

    overlay.innerHTML = `
        <div class="location-modal">
            <div class="location-modal__icon">
                <i class='bx bx-map-pin'></i>
            </div>
            <h2 class="location-modal__title">Izinkan Akses Lokasi</h2>
            <p class="location-modal__desc">
                Untuk menampilkan jadwal sholat yang akurat sesuai lokasi Anda,
                aplikasi memerlukan akses GPS perangkat.
            </p>
            <div class="location-modal__buttons">
                <button class="location-modal__btn-gps" id="loc-modal-btn-gps">
                    <i class='bx bx-current-location'></i>
                    <span>Akses Lokasi</span>
                </button>
                <button class="location-modal__btn-manual" id="loc-modal-btn-manual">
                    <i class='bx bx-search'></i>
                    <span>Pilih Manual</span>
                </button>
            </div>
        </div>
    `;

    return overlay;
}
