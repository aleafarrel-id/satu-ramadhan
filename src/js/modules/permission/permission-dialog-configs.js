/**
 * Permission Dialog Content Registry
 *
 * Single source of truth for all permission dialog content (icon, title,
 * description, features, button labels). The call sites (app.js,
 * schedule-page.js, quran-reader.js, etc.) remain contextual — only
 * callbacks are passed at the call site; the content is never duplicated.
 *
 * HOW TO ADD A NEW DIALOG:
 *   1. Add a new key to PERMISSION_CONFIGS below.
 *   2. Call `showPermissionDialogPreset(key, { onConfirm, onCancel })` at
 *      the appropriate call site.
 */

import { Filesystem } from '@capacitor/filesystem';
import { showPermissionDialog } from './permission-dialog.js';
import { t, loadNS } from '../../core/i18n.js';

/* ─────────────────────────────────────────────
   Content Registry
   ───────────────────────────────────────────── */

/**
 * Returns dynamic permission dialog configurations based on the
 * current active i18next language resolving to `modules/permission/permission-dialog`.
 */
function getPermissionConfigs() {
    return {
        /**
         * Native OS notification permission rationale.
         * Shown once on first launch if permission has not been granted.
         */
        notification: {
            icon: 'bx-bell',
            iconColor: 'accent',
            title: t('modules/permission/permission-dialog:notif_title'),
            description: t('modules/permission/permission-dialog:notif_desc'),
            features: [
                { icon: 'bxs-bell-ring', label: t('modules/permission/permission-dialog:notif_f1') },
                { icon: 'bx-bell', label: t('modules/permission/permission-dialog:notif_f2') },
                { icon: 'bx-bell-off', label: t('modules/permission/permission-dialog:notif_f3') },
            ],
            confirmText: t('modules/permission/permission-dialog:notif_confirm'),
            cancelText: t('modules/permission/permission-dialog:notif_cancel'),
        },

        /**
         * Native OS filesystem/public storage permission rationale.
         * Shown when the user attempts to download or share a schedule image.
         */
        storage: {
            icon: 'bx-folder-open',
            iconColor: 'primary',
            title: t('modules/permission/permission-dialog:storage_title'),
            description: t('modules/permission/permission-dialog:storage_desc'),
            features: [
                { icon: 'bx-down-arrow-circle', label: t('modules/permission/permission-dialog:storage_f1') },
                { icon: 'bx-share-alt', label: t('modules/permission/permission-dialog:storage_f2') },
                { icon: 'bx-lock-alt', label: t('modules/permission/permission-dialog:storage_f3') },
            ],
            confirmText: t('modules/permission/permission-dialog:storage_confirm'),
            cancelText: t('modules/permission/permission-dialog:storage_cancel'),
        },

        /**
         * Murottal audio download storage rationale.
         * Shown when the user attempts to download Qur'an recitation for offline playback.
         */
        murottal_storage: {
            icon: 'bx-headphone',
            iconColor: 'accent',
            theme: 'quran',
            title: t('modules/permission/permission-dialog:murottal_title'),
            description: t('modules/permission/permission-dialog:murottal_desc'),
            features: [
                { icon: 'bx-cloud-download', label: t('modules/permission/permission-dialog:murottal_f1') },
                { icon: 'bx-wifi-off', label: t('modules/permission/permission-dialog:murottal_f2') },
                { icon: 'bx-lock-alt', label: t('modules/permission/permission-dialog:murottal_f3') },
            ],
            confirmText: t('modules/permission/permission-dialog:murottal_confirm'),
            cancelText: t('modules/permission/permission-dialog:murottal_cancel'),
        },
    };
}

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

/**
 * Show a permission dialog using a named content preset.
 * The only things supplied at the call site are the async callbacks —
 * Wait for namespace loading prior to calling to ensure texts are populated.
 *
 * @param {string} key       - Preset key (e.g. 'notification').
 * @param {{ onConfirm: Function, onCancel?: Function }} callbacks
 */
export async function showPermissionDialogPreset(key, { onConfirm, onCancel, theme } = {}) {
    await loadNS('modules/permission/permission-dialog');

    const configs = getPermissionConfigs();
    const config = configs[key];

    if (!config) {
        console.warn(`[PermissionDialogConfigs] Unknown preset key: "${key}"`);
        return;
    }

    showPermissionDialog({ ...config, onConfirm, onCancel, theme: theme || config.theme });
}

/**
 * Checks and requests filesystem storage permission on native Android.
 * Shows a rationale dialog (using the given preset key) if permission
 * has not been granted yet.
 *
 * Android 13+ (API 33) does not require WRITE_EXTERNAL_STORAGE for
 * app-scoped storage — automatically resolves true.
 *
 * @param {string} presetKey - Dialog preset key (e.g. 'storage', 'murottal_storage')
 * @returns {Promise<boolean>} Resolves `true` if permission is granted.
 */
export function ensureStoragePermission(presetKey) {
    return new Promise(async (resolve) => {
        const ua = navigator.userAgent;
        const androidMatch = ua.match(/Android\s([0-9.]+)/);
        const androidVersion = androidMatch ? parseInt(androidMatch[1]) : 0;

        // Android 13+ uses scoped storage — no permission needed
        if (androidVersion >= 13) {
            resolve(true);
            return;
        }

        try {
            const status = await Filesystem.checkPermissions();
            if (status.publicStorage === 'granted') {
                resolve(true);
                return;
            }
        } catch {
            resolve(false);
            return;
        }

        showPermissionDialogPreset(presetKey, {
            onConfirm: async () => {
                try {
                    const result = await Filesystem.requestPermissions();
                    resolve(result.publicStorage === 'granted');
                } catch {
                    resolve(false);
                }
            },
            onCancel: () => resolve(false),
        });
    });
}

