/**
 * Settings Panel Component
 * Renders the settings card with toggles
 */

import { syncNotifications } from '../../modules/notification/notification-sync.js';
import * as Notif from '../../modules/notification/notification.js';
import { impact } from '../../modules/system/haptic.js';

export function render(container) {
    container.innerHTML = `
        <div class="card settings-card" data-focus-group="settings-list" data-focus-direction="vertical">
            <label class="settings-item" for="toggle-notification" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-bell'></i>
                    <span>Hidupkan Notifikasi</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-notification" checked>
                    <span class="slider"></span>
                </div>
            </label>
            <div class="settings-divider"></div>
            <label class="settings-item" id="adzan-row" for="toggle-adzan" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-volume-full'></i>
                    <span>Hidupkan Suara Adzan</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-adzan" checked>
                    <span class="slider"></span>
                </div>
            </label>
        </div>
    `;

    // Listeners for toggles
    const notificationToggle = document.getElementById('toggle-notification');
    const adzanToggle = document.getElementById('toggle-adzan');

    // Load saved preferences if any
    const savedNotif = localStorage.getItem('satu_ramadhan_notif');
    if (savedNotif !== null) {
        notificationToggle.checked = savedNotif === 'true';
    }

    const savedAdzan = localStorage.getItem('satu_ramadhan_adzan');
    if (savedAdzan !== null) {
        adzanToggle.checked = savedAdzan === 'true';
    }

    // Sinkronisasi visual awal: mute adzan row jika notifikasi mati
    updateAdzanRowState(notificationToggle.checked);

    notificationToggle?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await impact('medium');
        localStorage.setItem('satu_ramadhan_notif', enabled);
        updateAdzanRowState(enabled);
        rescheduleNotifications();
        Notif.show(
            enabled ? 'Notifikasi diaktifkan' : 'Notifikasi dimatikan',
            enabled ? 'success' : 'info'
        );
    });

    adzanToggle?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await impact('medium');
        localStorage.setItem('satu_ramadhan_adzan', enabled);
        rescheduleNotifications();
        Notif.show(
            enabled ? 'Suara adzan diaktifkan' : 'Suara adzan dimatikan',
            enabled ? 'success' : 'info'
        );
    });
}

/**
 * Toggle visual disabled state on the adzan row.
 * When notifications are off, adzan toggle is irrelevant.
 * @param {boolean} notifEnabled
 */
function updateAdzanRowState(notifEnabled) {
    const adzanRow = document.getElementById('adzan-row');
    if (!adzanRow) return;
    adzanRow.classList.toggle('settings-item--disabled', !notifEnabled);
}

/**
 * Re-syncs 30-day rolling notification schedule based on
 * current localStorage toggles and saved location.
 */
function rescheduleNotifications() {
    syncNotifications();
}

export function destroy() {
    // Cleanup if needed
}
