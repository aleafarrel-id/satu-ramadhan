/**
 * Settings Panel Component
 * Renders the settings card with toggles.
 */

// Core & Libraries
import * as Notif from '../../modules/notification/notification.js';
import { impact } from '../../modules/system/haptic.js';
import {
    checkNotificationPermission,
    requestNotificationPermission,
} from '../../modules/notification/native-notification.js';
import { showPermissionDialogPreset } from '../../modules/permission/permission-dialog-configs.js';
import { store } from '../../core/store.js';

export function render(container) {
    container.innerHTML = `
        <div class="card settings-card" data-focus-group="settings-list" data-focus-direction="vertical">
            <div class="settings-card-header">
                <div class="settings-card-title">NOTIFIKASI</div>
            </div>
            <label class="settings-item" for="toggle-notification" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-bell'></i>
                    <span>Notifikasi Waktu</span>
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
                    <span>Suara Adzan</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-adzan" checked>
                    <span class="slider"></span>
                </div>
            </label>
        </div>
    `;

    const notificationToggle = document.getElementById('toggle-notification');
    const adzanToggle = document.getElementById('toggle-adzan');

    // Murni membaca sinkronisasi Store Manager
    notificationToggle.checked = store.getState('settings.notification') !== false;
    adzanToggle.checked = store.getState('settings.adzan') !== false;

    updateAdzanRowState(notificationToggle.checked);

    notificationToggle?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await impact('medium');

        if (!enabled) {
            store.setState('settings.notification', false);
            updateAdzanRowState(false);
            Notif.show('Notifikasi dimatikan', 'info');
            return;
        }

        // Gate on OS permission before enabling
        const osGranted = await checkNotificationPermission();

        if (osGranted) {
            store.setState('settings.notification', true);
            updateAdzanRowState(true);
            Notif.show('Notifikasi diaktifkan', 'success');
            return;
        }

        // OS permission not yet granted — show rationale before OS prompt
        showPermissionDialogPreset('notification', {
            onConfirm: async () => {
                const granted = await requestNotificationPermission();
                if (granted) {
                    store.setState('settings.notification', true);
                    updateAdzanRowState(true);
                    Notif.show('Notifikasi diaktifkan', 'success');
                } else {
                    notificationToggle.checked = false;
                    store.setState('settings.notification', false);
                    updateAdzanRowState(false);
                    Notif.show('Izin notifikasi ditolak', 'warning');
                }
            },
            onCancel: () => {
                notificationToggle.checked = false;
                store.setState('settings.notification', false);
                updateAdzanRowState(false);
            },
        });
    });

    adzanToggle?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await impact('medium');
        store.setState('settings.adzan', enabled);
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

export function destroy() {
    // Cleanup if needed
}
