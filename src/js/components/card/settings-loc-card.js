/**
 * Settings Location Card Component
 * Renders the location settings card with GPS and Manual buttons
 */

import { getSavedLocation, detectLocation, checkGpsEnabled, openLocationSettings } from '../../core/geolocation.js';

import * as notif from '../../modules/notification/notification.js';

import { showLocationSearchModal } from '../modal/location-search-modal.js';

export async function render(container) {
    const savedLocation = await getSavedLocation();

    function renderStatus(loc) {
        if (loc) {
            return `<div class="settings-loc-body"><div class="settings-loc-regency">${loc.regencyName}</div>${loc.provinceName ? `<div class="settings-loc-province">${loc.provinceName}</div>` : ''}</div>`;
        }
        return `<span class="settings-loc-status">Lokasi belum diatur</span>`;
    }

    container.innerHTML = `
        <div class="card settings-loc-card">
            <div class="settings-loc-header">
                <div class="settings-loc-title">LOKASI ANDA</div>
                <div class="settings-loc-icon-wrapper">
                    <i class='bx bx-map settings-loc-map-icon ${savedLocation ? '' : 'unset'}'></i>
                    <div id="settings-loc-status-wrapper" class="settings-loc-status-wrapper">
                        ${renderStatus(savedLocation)}
                    </div>
                </div>
            </div>
            <p class="settings-loc-desc">
                Sesuaikan lokasi untuk mendapatkan jadwal yang akurat
            </p>
            <div class="settings-loc-actions">
                <button class="btn btn--gold" id="btn-settings-gps">
                    <i class='bx bx-current-location'></i>
                    <span>Akses Lokasi</span>
                </button>
                <button class="btn btn--outline" id="btn-settings-manual">
                    <i class='bx bx-search'></i>
                    <span>Pilih Manual</span>
                </button>
            </div>
        </div>
    `;

    const btnGps = container.querySelector('#btn-settings-gps');
    const btnManual = container.querySelector('#btn-settings-manual');

    btnGps?.addEventListener('click', async () => {
        // Direct GPS Detection
        btnGps.disabled = true;
        const originalText = btnGps.innerHTML;
        btnGps.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i><span>Mendeteksi...</span>`;

        try {
            const isGpsOn = await checkGpsEnabled();
            if (!isGpsOn) {
                notif.error('GPS belum aktif. Menunggu...');
                openLocationSettings();
                return;
            }

            const location = await detectLocation(true);
            if (location) {
                notif.success(`Lokasi terdeteksi: ${location.regencyName}`);
                // Update UI directly
                const statusWrapper = container.querySelector('#settings-loc-status-wrapper');
                if (statusWrapper) {
                    statusWrapper.innerHTML = renderStatus(location);
                }
                const mapIcon = container.querySelector('.settings-loc-map-icon');
                if (mapIcon) {
                    mapIcon.classList.remove('unset');
                }
            } else {
                notif.error('Lokasi tidak ditemukan, silakan coba lagi atau pilih manual');
            }
        } catch (error) {
            notif.error('GPS gagal, pastikan GPS aktif atau pilih manual');
        } finally {
            btnGps.disabled = false;
            btnGps.innerHTML = originalText;
        }
    });

    btnManual?.addEventListener('click', () => {
        showLocationSearchModal({
            onLocationSelected: (location) => {
                notif.success(`Lokasi diatur: ${location.regencyName}`);
                // Update UI directly
                const statusWrapper = container.querySelector('#settings-loc-status-wrapper');
                if (statusWrapper) {
                    statusWrapper.innerHTML = renderStatus(location);
                }
                const mapIcon = container.querySelector('.settings-loc-map-icon');
                if (mapIcon) {
                    mapIcon.classList.remove('unset');
                }
            },
        });
    });
}

export function destroy() {
    // cleanup if needed
}
