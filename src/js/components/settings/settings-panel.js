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
    PrayerService,
} from '../../modules/notification/native-notification.js';
import { showPermissionDialogPreset } from '../../modules/permission/permission-dialog-configs.js';
import { store } from '../../core/store.js';
import { isWeb } from '../../modules/system/platform.js';
import { t, loadNS } from '../../core/i18n.js';
import { showAdzanSelectorModal } from '../modal/adzan-selector-modal.js';
import { AVAILABLE_ADZANS, DEFAULT_ADZAN, DEFAULT_ADZAN_SUBUH } from '../../config/adzan-sounds.js';

export function render(container) {
    // Force preload i18n to guarantee translations work accurately
    loadNS('components/modal/adzan-selector-modal');

    container.innerHTML = `
        <div class="card settings-card settings-card-spacing" data-focus-group="settings-list" data-focus-direction="vertical">
            <div class="settings-card-header">
                <div class="settings-card-title">${t('components/settings/settings-panel:section_notif')}</div>
            </div>
            <div class="settings-item ${isWeb ? 'settings-item--disabled' : ''}" id="adzan-selector-row" tabindex="0" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-music'></i>
                    <span id="adzan-selector-label">${t('components/modal/adzan-selector-modal:selector_label', { defaultValue: 'Pilihan Adzan' })}</span>
                </div>
                <div class="settings-select-trigger">
                    <span id="adzan-selected-value"></span>
                </div>
            </div>
            <div class="settings-divider"></div>
            <label class="settings-item ${isWeb ? 'settings-item--disabled' : ''}" for="toggle-notification" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-bell'></i>
                    <span>${t('components/settings/settings-panel:notif_time')}</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-notification" checked ${isWeb ? 'disabled' : ''}>
                    <span class="slider"></span>
                </div>
            </label>
            <div class="settings-divider"></div>
            <label class="settings-item ${isWeb ? 'settings-item--disabled' : ''}" id="adzan-row" for="toggle-adzan" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-volume-full'></i>
                    <span>${t('components/settings/settings-panel:adzan_sound')}</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-adzan" checked ${isWeb ? 'disabled' : ''}>
                    <span class="slider"></span>
                </div>
            </label>
            <div class="settings-divider"></div>
            <div class="settings-item ${isWeb ? 'settings-item--disabled' : ''}" id="battery-row" tabindex="0" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-battery'></i>
                    <span>${t('components/settings/settings-panel:battery_opt')}</span>
                </div>
                <div class="settings-item-value">
                    <i class='bx bx-chevron-right'></i>
                </div>
            </div>
            ${isWeb ? `<div class="settings-platform-notice">${t('components/settings/settings-panel:web_only_notice')}</div>` : ''}
        </div>
    `;

    const notificationToggle = container.querySelector('#toggle-notification');
    const adzanToggle = container.querySelector('#toggle-adzan');
    const batteryRow = container.querySelector('#battery-row');
    const adzanSelectorRow = container.querySelector('#adzan-selector-row');
    const adzanSelectedValue = container.querySelector('#adzan-selected-value');

    // Function to strictly validate against our registry
    const validateAdzan = (val, defaultVal) => {
        if (!val || typeof val !== 'string') return defaultVal;
        const match = AVAILABLE_ADZANS.find(a => a.id === val.trim());
        return match ? match.id : defaultVal;
    };

    let currentAdzan = validateAdzan(store.getState('settings.adzan_selected'), DEFAULT_ADZAN);
    let currentAdzanSubuh = validateAdzan(store.getState('settings.adzan_subuh'), DEFAULT_ADZAN_SUBUH);

    console.log('[SettingsPanel] Strict valid adzan:', currentAdzan, 'subuh:', currentAdzanSubuh);

    function updateAdzanValueDisplay() {
        if (!adzanSelectedValue) return;

        const normalId = currentAdzan;
        const subuhId = currentAdzanSubuh;

        // Find correct labels from our config registry if i18n isn't ready
        const normalConfig = AVAILABLE_ADZANS.find(a => a.id === normalId) || AVAILABLE_ADZANS[0];
        const subuhConfig = AVAILABLE_ADZANS.find(a => a.id === subuhId) || AVAILABLE_ADZANS[0];

        const normalLabel = t(normalConfig.labelKey, { defaultValue: 'Makkah' });

        if (normalId === subuhId) {
            adzanSelectedValue.textContent = normalLabel;
        } else {
            const subuhLabel = t(subuhConfig.labelKey, { defaultValue: 'Makkah' });
            adzanSelectedValue.textContent = `${normalLabel} • ${subuhLabel}`;
        }
    }

    updateAdzanValueDisplay();

    // Read directly from Store Manager synchronization
    if (isWeb) {
        notificationToggle.checked = false;
        adzanToggle.checked = false;
    } else {
        notificationToggle.checked = store.getState('settings.notification') !== false;
        adzanToggle.checked = store.getState('settings.adzan') !== false;
        updateAdzanRowState(notificationToggle.checked, container);
    }

    if (isWeb) return;

    notificationToggle?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        impact('medium');

        if (!enabled) {
            store.setState('settings.notification', false);
            updateAdzanRowState(false, container);
            Notif.show(t('components/settings/settings-panel:notif_off'), 'info');
            return;
        }

        // Gate on OS permission before enabling
        const osGranted = await checkNotificationPermission();

        if (osGranted) {
            store.setState('settings.notification', true);
            updateAdzanRowState(true, container);
            Notif.show(t('components/settings/settings-panel:notif_on'), 'success');

            if (!store.getState('settings.battery_opt_seen')) {
                setTimeout(() => showBatterySafetyDialog(), 350);
            }
            return;
        }

        // OS permission not yet granted — show rationale before OS prompt
        let shouldShowBattery = false;

        await showPermissionDialogPreset('notification', {
            onConfirm: async () => {
                const granted = await requestNotificationPermission();
                if (granted) {
                    store.setState('settings.notification', true);
                    updateAdzanRowState(true, container);
                    Notif.show(t('components/settings/settings-panel:notif_on'), 'success');

                    // Tandai bahwa dialog baterai perlu dimunculkan nanti
                    // (setelah dialog ini benar-benar selesai tertutup)
                    shouldShowBattery = true;
                } else {
                    notificationToggle.checked = false;
                    store.setState('settings.notification', false);
                    updateAdzanRowState(false, container);
                    Notif.show(t('components/settings/settings-panel:perm_denied'), 'warning');
                }
            },
            onCancel: () => {
                notificationToggle.checked = false;
                updateAdzanRowState(false, container);
            }
        });

        // Dialog Notifikasi sudah dianimasikan keluar & dihapus dari DOM secara presisi
        if (shouldShowBattery && !store.getState('settings.battery_opt_seen')) {
            showBatterySafetyDialog();
        }
    });

    adzanToggle?.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        impact('medium');
        store.setState('settings.adzan', enabled);
        Notif.show(
            enabled ? t('components/settings/settings-panel:adzan_on') : t('components/settings/settings-panel:adzan_off'),
            enabled ? 'success' : 'info'
        );
    });

    if (!isWeb) {
        adzanSelectorRow?.addEventListener('click', async () => {
            if (!store.getState('settings.notification')) return;

            showAdzanSelectorModal({
                currentAdzan,
                currentAdzanSubuh,
                onSelect: (selections) => {
                    currentAdzan = selections.normal;
                    currentAdzanSubuh = selections.subuh;

                    store.setState('settings.adzan_selected', currentAdzan);
                    store.setState('settings.adzan_subuh', currentAdzanSubuh);

                    updateAdzanValueDisplay();
                }
            });
        });

        batteryRow?.addEventListener('click', async () => {
            if (!store.getState('settings.notification')) return;
            impact('medium');

            await loadNS('modules/permission/permission-dialog');
            showBatterySafetyDialog();
        });
    }
}

/**
 * Toggle visual disabled state on the adzan row and battery row.
 * When notifications are off, adzan and battery configs are irrelevant.
 * @param {boolean} notifEnabled
 * @param {HTMLElement} [container]
 */
function updateAdzanRowState(notifEnabled, container) {
    const root = container || document;
    const adzanRow = root.querySelector('#adzan-row');
    const batteryRow = root.querySelector('#battery-row');
    const selectorRow = root.querySelector('#adzan-selector-row');

    if (adzanRow) adzanRow.classList.toggle('settings-item--disabled', !notifEnabled);
    if (batteryRow) batteryRow.classList.toggle('settings-item--disabled', !notifEnabled);
    if (selectorRow) selectorRow.classList.toggle('settings-item--disabled', !notifEnabled);
}

/**
 * Show a rationale dialog explaining why OEM battery optimization
 * needs to be managed manually for reliable post-boot alarms.
 */
function showBatterySafetyDialog() {
    showPermissionDialogPreset('battery', {
        onConfirm: async () => {
            try {
                store.setState('settings.battery_opt_seen', true);
                await PrayerService.openBatteryOptimizationSettings();
            } catch (e) {
                console.warn('[SettingsPanel] Could not open battery settings:', e);
            }
        }
    });
}

export function destroy() {
    // Cleanup if needed
}
