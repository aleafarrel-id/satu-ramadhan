/**
 * Share Schedule Exporter
 * ───────────────────────
 * Captures a DOM element (rendered inside an iframe) as a PNG via html-to-image,
 * then either downloads or shares the image file.
 *
 * Uses html-to-image with `fontEmbedCSS` option to ensure custom fonts
 * are properly embedded in the SVG serialization.
 *
 * @module share-schedule-exporter
 */

import { toCanvas } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** ── Constants ── */

const TEMPLATE_WIDTH = 1240;
const TEMPLATE_HEIGHT = 1754;

/** Default filename for downloaded images */
const DEFAULT_FILENAME = 'jadwal-imsakiyah.png';

/** ── Public API ── */

/**
 * Capture a DOM element as a canvas using html-to-image.
 * Accepts an element from inside an iframe (built by share-schedule-builder).
 *
 * The element should have a `_fontEmbedCSS` property with pre-built
 * base64 @font-face CSS from the builder.
 *
 * @param {HTMLElement} element - DOM element to capture (from iframe)
 * @returns {Promise<HTMLCanvasElement>} Rendered canvas
 */
export async function captureScheduleImage(element) {
    if (!element) throw new Error('captureScheduleImage: element is required');

    // Get pre-built font CSS from builder (attached to element)
    const fontEmbedCSS = element._fontEmbedCSS || '';

    const options = {
        pixelRatio: 4,
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
        },
    };

    const canvas = await toCanvas(element, options);
    return canvas;
}

/**
 * Download a canvas as a PNG file via browser blob download.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} [filename]
 * @returns {Promise<void>}
 */
export async function downloadScheduleImage(canvas, filename = DEFAULT_FILENAME) {
    if (!canvas) throw new Error('downloadScheduleImage: canvas is required');

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
        if (Capacitor.getPlatform() === 'web') {
            try {
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                if (blob) {
                    const file = new File([blob], 'jadwal-imsakiyah.png', { type: 'image/png' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'Jadwal Imsakiyah'
                        });
                        return; // Successfully shared
                    }
                }
            } catch (err) {
                console.warn('[share-schedule-exporter] Web Share failed, falling back to download:', err);
            }

            // Web fallback if canShare is false or user cancels/fails
            await downloadScheduleImage(canvas);
            return;
        }

        const dataUrl = canvas.toDataURL('image/png');
        const base64Data = dataUrl.split(',')[1];

        const fileName = `jadwal-${Date.now()}.png`;

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
            title: 'Jadwal Imsakiyah',
            // Omit text property to force native apps (like WhatsApp) to attach the image
            files: [uri],
            dialogTitle: 'Bagikan Jadwal',
        });

        await Filesystem.deleteFile({
            path: fileName,
            directory: Directory.Cache,
        }).catch(() => { /* cleanup failure is non-critical */ });

    } catch (err) {
        console.warn('[share-schedule-exporter] Capacitor Share unavailable, falling back to download', err);
        await downloadScheduleImage(canvas);
    }
}
