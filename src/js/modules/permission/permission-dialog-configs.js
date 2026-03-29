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

/* ─────────────────────────────────────────────
   Content Registry
   ───────────────────────────────────────────── */

/**
 * @type {Record<string, import('./permission-dialog.js').PermissionDialogConfig>}
 */
export const PERMISSION_CONFIGS = {

    /**
     * Native OS notification permission rationale.
     * Shown once on first launch if permission has not been granted.
     */
    notification: {
        icon: 'bx-bell',
        iconColor: 'accent',
        title: 'Izin Notifikasi',
        description: 'Untuk dapat menampilkan notifikasi adzan tepat waktu, aplikasi memerlukan izin notifikasi.',
        features: [
            { icon: 'bxs-bell-ring', label: 'Pengingat adzan setiap hari' },
            { icon: 'bx-bell', label: 'Notifikasi waktu sholat' },
            { icon: 'bx-bell-off', label: 'Dapat dinonaktifkan kapan saja' },
        ],
        confirmText: 'Izinkan Notifikasi',
        cancelText: 'Lewati',
    },

    /**
     * Native OS filesystem/public storage permission rationale.
     * Shown when the user attempts to download or share a schedule image.
     */
    storage: {
        icon: 'bx-folder-open',
        iconColor: 'primary',
        title: 'Izin Penyimpanan',
        description: 'Untuk menyimpan dan membagikan gambar jadwal sholat, aplikasi memerlukan akses penyimpanan.',
        features: [
            { icon: 'bx-down-arrow-circle', label: 'Simpan jadwal sebagai gambar' },
            { icon: 'bx-share-alt', label: 'Bagikan jadwal ke media sosial' },
            { icon: 'bx-lock-alt', label: 'Hanya akses file buatan aplikasi' },
        ],
        confirmText: 'Izinkan Akses',
        cancelText: 'Batal',
    },

};

/* ─────────────────────────────────────────────
   Helper
   ───────────────────────────────────────────── */

/**
 * Show a permission dialog using a named content preset.
 * The only things supplied at the call site are the async callbacks —
 * all visual content lives in PERMISSION_CONFIGS above.
 *
 * @param {keyof PERMISSION_CONFIGS} key       - Preset key (e.g. 'notification').
 * @param {{ onConfirm: Function, onCancel?: Function }} callbacks
 */
export function showPermissionDialogPreset(key, { onConfirm, onCancel } = {}) {
    const config = PERMISSION_CONFIGS[key];

    if (!config) {
        console.warn(`[PermissionDialogConfigs] Unknown preset key: "${key}"`);
        return;
    }

    showPermissionDialog({ ...config, onConfirm, onCancel });
}
