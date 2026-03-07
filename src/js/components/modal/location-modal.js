/**
 * Location Modal Component
 * Shows a GPS / Manual location choice modal.
 * Used on first launch (no cached location) or when user taps "Ubah".
 */

import { detectLocation, checkGpsEnabled, openLocationSettings } from '../../core/geolocation.js';

import * as notif from '../../modules/notification.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/back-handler.js';

/* ── DOM References ── */
let _overlayEl = null;

/* ── State ── */
let _isDetecting = false;

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
    btnGps?.addEventListener('click', async () => {
        if (_isDetecting) return;
        _isDetecting = true;
        setGpsButtonLoading(true);

        // Check if GPS is enabled on device
        const isGpsOn = await checkGpsEnabled();
        if (!isGpsOn) {
            notif.error('GPS belum aktif. Menunggu...');
            openLocationSettings();

            // Keep the modal visible and reset loading state so user can retry
            setGpsButtonLoading(false);
            _isDetecting = false;
            return;
        }

        try {
            // Pass `true` for forceRefresh so it ignores cached location
            const location = await detectLocation(true);
            if (location) {
                notif.success(`Lokasi terdeteksi: ${location.regencyName}`);
                hideModal();
                onLocationDetected?.(location);
            } else {
                notif.error('Lokasi tidak ditemukan, coba lagi atau pilih manual');
                setGpsButtonLoading(false);
            }
        } catch {
            notif.error('GPS gagal, pastikan GPS aktif atau pilih manual');
            setGpsButtonLoading(false);
        } finally {
            _isDetecting = false;
        }
    });

    // ── Bind: Manual button ──
    const btnManual = _overlayEl.querySelector('#loc-modal-btn-manual');
    btnManual?.addEventListener('click', () => {
        hideModal();
        onManualSelect?.();
    });

    // ── Bind: Click outside to close ──
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl && !_isDetecting) {
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
    _isDetecting = false;
    // Unregister from hardware back handler
    unregisterModalDismiss(hideModal);
}

/**
 * Toggle GPS button between normal and loading state.
 */
function setGpsButtonLoading(loading) {
    const btn = _overlayEl?.querySelector('#loc-modal-btn-gps');
    if (!btn) return;

    if (loading) {
        btn.disabled = true;
        btn.innerHTML = `
            <i class='bx bx-loader-alt bx-spin'></i>
            <span>Mendeteksi Lokasi...</span>
        `;
    } else {
        btn.disabled = false;
        btn.innerHTML = `
            <i class='bx bx-current-location'></i>
            <span>Akses Lokasi</span>
        `;
    }
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
