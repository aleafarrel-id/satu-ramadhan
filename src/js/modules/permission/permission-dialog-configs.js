/**
 * Permission Dialog Content Registry
 *
 * Single source of truth for all permission dialog content (icon, title,
 * description, features, button labels). The call sites (app.js,
 * schedule-page.js, etc.) remain contextual — only callbacks are passed
 * at the call site; the content is never duplicated.
 *
 * HOW TO ADD A NEW DIALOG:
 *   1. Add a new key to PERMISSION_CONFIGS below.
 *   2. Call `showPermissionDialogPreset(key, { onConfirm, onCancel })` at
 *      the appropriate call site.
 */

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
    };
}

/* ─────────────────────────────────────────────
   Helper
   ───────────────────────────────────────────── */

/**
 * Show a permission dialog using a named content preset.
 * The only things supplied at the call site are the async callbacks —
 * Wait for namespace loading prior to calling to ensure texts are populated.
 *
 * @param {string} key       - Preset key (e.g. 'notification').
 * @param {{ onConfirm: Function, onCancel?: Function }} callbacks
 */
export async function showPermissionDialogPreset(key, { onConfirm, onCancel } = {}) {
    await loadNS('modules/permission/permission-dialog');

    const configs = getPermissionConfigs();
    const config = configs[key];

    if (!config) {
        console.warn(`[PermissionDialogConfigs] Unknown preset key: "${key}"`);
        return;
    }

    showPermissionDialog({ ...config, onConfirm, onCancel });
}
