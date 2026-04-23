/**
 * Share Schedule Exporter Module
 */

import { toCanvas } from 'html-to-image';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative, isWeb } from '../system/platform.js';
import { Share } from '@capacitor/share';
import { Media } from '@capacitor-community/media';
import { success as notifySuccess, error as notifyError } from '../notification/notification.js';
import { t } from '../../core/i18n.js';
import { logError } from '../../utils/error-boundary.js';

const TEMPLATE_WIDTH = 1240;
const TEMPLATE_HEIGHT = 1754;

function sanitizeFilename(name) {
    return (name || '').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase() || 'jadwal-imsakiyah';
}

const getDefaultFilenamePng = () => {
    const name = t('modules/share/share-schedule-exporter:default_filename_png') || 'jadwal-imsakiyah.png';
    return sanitizeFilename(name.replace(/\.png$/i, '')) + '.png';
};
const getDefaultFilename = () => {
    const name = t('modules/share/share-schedule-exporter:default_filename') || 'jadwal-imsakiyah';
    return sanitizeFilename(name);
};

/**
 * Capture a DOM element as a canvas using html-to-image.
 * Accepts an element from inside an iframe (built by share-schedule-builder).
 *
 * The element should have a `_fontEmbedCSS` property with pre-built
 * base64 @font-face CSS from the builder.
 *
 * @param {HTMLElement} element - DOM element to capture (from iframe)
 * @param {Object}      [customOptions] - Optional overrides (e.g. pixelRatio)
 * @returns {Promise<HTMLCanvasElement>} Rendered canvas
 */
export async function captureScheduleImage(element, customOptions = {}) {
    if (!element) throw new Error('captureScheduleImage: element is required');

    // Get pre-built font CSS from builder (attached to element)
    const fontEmbedCSS = element._fontEmbedCSS || '';

    const options = {
        pixelRatio: customOptions.pixelRatio || 2,
        backgroundColor: null,
        cacheBust: true,
        width: TEMPLATE_WIDTH,
        height: TEMPLATE_HEIGHT,
        fontEmbedCSS: fontEmbedCSS,
        filter: (node) => {
            if (node.tagName === 'SCRIPT') return false;
            return true;
        },
        style: {
            margin: '0',
            padding: '0',
            boxShadow: 'none',
            backdropFilter: 'none',
            ...customOptions.style
        },
    };

    const canvas = await toCanvas(element, options);
    return canvas;
}

/**
 * Download a canvas as a PNG file.
 * On native platforms (Android/iOS), saves to the Documents folder using Capacitor Filesystem.
 * On web, defaults to browser blob download.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} [filename]
 * @returns {Promise<void>}
 */
export async function downloadScheduleImage(canvas, filename = null) {
    if (!canvas) throw new Error('downloadScheduleImage: canvas is required');

    if (!filename) filename = getDefaultFilenamePng();

    if (isNative) {
        try {
            const dataUrl = canvas.toDataURL('image/png');

            let nativeFileName = filename === getDefaultFilenamePng()
                ? `${getDefaultFilename()}-${Date.now()}`
                : filename.replace(/\.png$/i, '');

            // On Android, albumIdentifier is required.
            // We'll try to find or create "Satu Ramadhan" album.
            const albumName = 'Satu Ramadhan';
            let { albums } = await Media.getAlbums();
            let album = albums.find(a => a.name === albumName);

            if (!album) {
                try {
                    await Media.createAlbum({ name: albumName });
                    const { albums: refreshedAlbums } = await Media.getAlbums();
                    album = refreshedAlbums.find(a => a.name === albumName);
                } catch (albumErr) {
                    console.warn('[share-schedule-exporter] Failed to create album, falling back to first available or none:', albumErr);
                    // Fallback to first album if creation fails, or try without identifier (might still fail on some Android versions)
                    album = albums[0];
                }
            }

            await Media.savePhoto({
                path: dataUrl,
                fileName: nativeFileName,
                albumIdentifier: album?.identifier
            });

            notifySuccess(t('modules/share/share-schedule-exporter:save_success') || 'Jadwal berhasil disimpan ke Galeri', 3500);
            return;
        } catch (error) {
            logError('[ShareExporter]', error);
            notifyError(t('modules/share/share-schedule-exporter:save_error') || 'Gagal menyimpan jadwal ke Galeri', 3500);
            return;
        }
    }

    // Web fallback
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to create blob from canvas'));
                return;
            }

            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            anchor.click();

            setTimeout(() => {
                URL.revokeObjectURL(url);
                resolve();
            }, 100);
        }, 'image/png');
    });
}

/**
 * Share a canvas as a PNG file via Capacitor Share plugin.
 * Falls back to browser download if Capacitor plugins are unavailable.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<void>}
 */
export async function shareScheduleImage(canvas) {
    if (!canvas) throw new Error('shareScheduleImage: canvas is required');

    try {
        if (isWeb) {
            try {
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                if (blob) {
                    const file = new File([blob], getDefaultFilenamePng(), { type: 'image/png' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: t('modules/share/share-schedule-exporter:share_title') || 'Jadwal Imsakiyah'
                        });
                        return; // Successfully shared
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('cancel'))) {
                    return;
                }
                console.warn('[share-schedule-exporter] Web Share failed:', err);
                notifyError(t('modules/share/share-schedule-exporter:share_error') || 'Gagal membagikan jadwal', 3500);
                return;
            }

            // If browser does not support sharing files via Web Share API
            notifyError(t('modules/share/share-schedule-exporter:share_unsupported') || 'Silakan gunakan tombol Unduh.', 3500);
            return;
        }

        const dataUrl = canvas.toDataURL('image/png');
        const base64Data = dataUrl.split(',')[1];

        const fileName = `${getDefaultFilename()}-${Date.now()}.png`;

        await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
        });

        const { uri } = await Filesystem.getUri({
            path: fileName,
            directory: Directory.Cache,
        });

        await Share.share({
            title: t('modules/share/share-schedule-exporter:share_title') || 'Jadwal Imsakiyah',
            // Omit text property to force native apps (like WhatsApp) to attach the image
            files: [uri],
            dialogTitle: t('modules/share/share-schedule-exporter:share_dialog_title') || 'Bagikan Jadwal',
        });

        await Filesystem.deleteFile({
            path: fileName,
            directory: Directory.Cache,
        }).catch(() => { /* cleanup failure is non-critical */ });

    } catch (err) {
        if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('cancel'))) {
            return;
        }
        console.warn('[share-schedule-exporter] Capacitor Share failed:', err);
        notifyError(t('modules/share/share-schedule-exporter:share_error') || 'Gagal membagikan jadwal', 3500);
    }
}
