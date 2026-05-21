/**
 * Share Schedule Builder Module
 */

import { cleanTimeStr } from '../../utils/datetime.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { t } from '../../core/i18n.js';

/** Template URL served by Vite or compiled by Rollup */
const TEMPLATE_URL = import.meta.env.DEV 
    ? '/src/templates/share-schedule/share-schedule.html'
    : './src/templates/share-schedule/share-schedule.html';

/** Template A4 dimensions */
const TEMPLATE_WIDTH  = 1240;
const TEMPLATE_HEIGHT = 1754;

import fontPoppinsLight from '../../../assets/font/poppins/Poppins-Light.woff2?url';
import fontPoppinsRegular from '../../../assets/font/poppins/Poppins-Regular.woff2?url';
import fontPoppinsMedium from '../../../assets/font/poppins/Poppins-Medium.woff2?url';
import fontPoppinsSemiBold from '../../../assets/font/poppins/Poppins-SemiBold.woff2?url';
import fontPoppinsBold from '../../../assets/font/poppins/Poppins-Bold.woff2?url';
import fontAmiriRegular from '../../../assets/font/amiri/Amiri-Regular.woff2?url';
import fontAmiriBold from '../../../assets/font/amiri/Amiri-Bold.woff2?url';

/** Font files to embed as base64 for html-to-image capture */
const FONT_FILES = [
    { path: fontPoppinsLight,    family: 'Poppins', weight: 300,  format: 'woff2' },
    { path: fontPoppinsRegular,  family: 'Poppins', weight: 400,  format: 'woff2' },
    { path: fontPoppinsMedium,   family: 'Poppins', weight: 500,  format: 'woff2' },
    { path: fontPoppinsSemiBold, family: 'Poppins', weight: 600,  format: 'woff2' },
    { path: fontPoppinsBold,     family: 'Poppins', weight: 700,  format: 'woff2' },
    { path: fontAmiriRegular,    family: 'Amiri',   weight: 400,  format: 'woff2' },
    { path: fontAmiriBold,       family: 'Amiri',   weight: 700,  format: 'woff2' },
];

/**
 * @typedef {Object} ShareSchedulePayload
 * @property {Object}       location       - { regencyName, provinceName }
 * @property {string}       orgName        - Active organization display name
 * @property {number|null}  qiblaAngle     - Qibla direction angle in degrees
 * @property {Array}        scheduleData   - Array of 30-day schedule entries
 * @property {string}       hijriMonthName - Hijri month name
 * @property {number}       hijriYear      - Hijri year
 */

let _cachedFontCSS = null;
const _iframeMap = new WeakMap();

/**
 * Build the share schedule element by loading the template in a hidden iframe.
 * The browser renders ALL CSS natively inside the iframe, producing pixel-perfect output.
 *
 * @param {ShareSchedulePayload} payload
 * @returns {Promise<HTMLElement>} The #share-schedule-container element (inside iframe)
 *   — also has `_fontEmbedCSS` property with pre-built base64 font CSS
 */
export async function buildShareScheduleElement(payload) {
    // Build font CSS in parallel with iframe creation
    const [fontCSS, iframe] = await Promise.all([
        ensureFontCSS(),
        createTemplateIframe(),
    ]);

    const iframeDoc = iframe.contentDocument;
    const container = iframeDoc.getElementById('share-schedule-container');

    if (!container) {
        throw new Error('Template is missing #share-schedule-container inside iframe');
    }

    // Inject schedule data into the iframe's DOM
    injectMetadata(container, payload);
    injectTableRows(container.querySelector('#share-schedule-tbody'), payload.scheduleData);

    // Wait for all fonts/images to fully load inside the iframe
    await waitForIframeReady(iframe);

    // Attach metadata for the exporter
    container._fontEmbedCSS = fontCSS;
    container._sourceIframe = iframe;

    // Store iframe reference for cleanup via WeakMap
    _iframeMap.set(container, iframe);

    return container;
}

/**
 * Remove the iframe used for the share schedule element.
 *
 * @param {HTMLElement} el - Element returned by buildShareScheduleElement
 */
export function destroyShareScheduleElement(el) {
    if (!el) return;

    const iframe = _iframeMap.get(el) || el._sourceIframe;
    if (iframe && iframe.parentNode) {
        iframe.remove();
    }
    _iframeMap.delete(el);
}

/**
 * Create a hidden iframe that loads the share schedule template.
 * The iframe is same-origin, so we have full DOM access.
 *
 * @returns {Promise<HTMLIFrameElement>}
 */
function createTemplateIframe() {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');

        Object.assign(iframe.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: `${TEMPLATE_WIDTH}px`,
            height: `${TEMPLATE_HEIGHT}px`,
            border: 'none',
            opacity: '0.01',
            pointerEvents: 'none',
            zIndex: '-9999',
            overflow: 'hidden',
        });

        iframe.setAttribute('data-share-schedule-iframe', 'true');

        const timeout = setTimeout(() => {
            reject(new Error('Iframe load timeout'));
        }, 10000);

        iframe.addEventListener('load', () => {
            clearTimeout(timeout);
            resolve(iframe);
        }, { once: true });

        iframe.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load template iframe'));
        }, { once: true });

        // Load the template HTML directly via its URL — Vite serves it
        iframe.src = TEMPLATE_URL;
        document.body.appendChild(iframe);
    });
}

/**
 * Wait for all fonts, images, and styles to fully load inside the iframe.
 *
 * @param {HTMLIFrameElement} iframe
 */
async function waitForIframeReady(iframe) {
    const iframeWin = iframe.contentWindow;

    // Wait for fonts
    if (iframeWin.document.fonts && iframeWin.document.fonts.ready) {
        await Promise.race([
            iframeWin.document.fonts.ready,
            new Promise(r => setTimeout(r, 3000)),
        ]);
    }

    // Wait for images
    const images = iframeWin.document.querySelectorAll('img');
    const imgPromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(r => {
            img.addEventListener('load', r, { once: true });
            img.addEventListener('error', r, { once: true });
            setTimeout(r, 2000);
        });
    });
    await Promise.all(imgPromises);

    // Small extra delay for rendering to settle
    await new Promise(r => setTimeout(r, 200));
}

/**
 * Build and cache base64-embedded @font-face CSS for html-to-image.
 * This tells the capture library to use these fonts instead of trying
 * to auto-detect from stylesheets (which fails across iframe boundaries).
 *
 * @returns {Promise<string>}
 */
async function ensureFontCSS() {
    if (_cachedFontCSS) return _cachedFontCSS;

    const fontRules = await Promise.all(
        FONT_FILES.map(async (font) => {
            try {
                const resp = await fetch(font.path);
                if (!resp.ok) return '';
                const blob = await resp.blob();
                const dataUrl = await blobToDataUrl(blob);
                return `@font-face {
    font-family: '${font.family}';
    src: url('${dataUrl}') format('${font.format}');
    font-weight: ${font.weight};
    font-style: normal;
}`;
            } catch {
                console.warn(`[share-schedule-builder] Failed to embed font: ${font.path}`);
                return '';
            }
        })
    );

    _cachedFontCSS = fontRules.filter(Boolean).join('\n');
    return _cachedFontCSS;
}

/**
 * Convert a Blob to a base64 data URL string.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Inject metadata into the template elements.
 * @param {HTMLElement} el
 * @param {ShareSchedulePayload} payload
 */
function injectMetadata(el, payload) {
    const setText = (id, text) => {
        const target = el.querySelector(`#${id}`);
        if (target) target.textContent = text;
    };

    const loc = payload.location;
    const locationDisplay = loc
        ? (loc.districtName ? `${loc.districtName}, ${loc.regencyName}` : loc.regencyName)
        : '—';
    setText('share-schedule-location', locationDisplay);
    setText('share-schedule-province', loc?.provinceName || '');
    setText('share-schedule-org', payload.orgName || '—');
    setText('share-schedule-hijri-title', `${payload.hijriMonthName || 'Ramadan'} ${payload.hijriYear || ''} H`);
    setText('share-schedule-qibla', payload.qiblaAngle != null ? `${payload.qiblaAngle.toFixed(1)}°` : '—');

    // i18n Injections
    setText('share-schedule-title-head', t('modules/share/share-schedule-exporter:tpl_title'));
    setText('share-schedule-title', t('modules/share/share-schedule-exporter:tpl_title'));
    setText('share-schedule-qibla-label', t('modules/share/share-schedule-exporter:tpl_qibla'));
    setText('share-schedule-th-hari', t('modules/share/share-schedule-exporter:tpl_th_hari'));
    setText('share-schedule-th-tanggal', t('modules/share/share-schedule-exporter:tpl_th_tanggal'));
    setText('share-schedule-th-imsak', t('modules/share/share-schedule-exporter:tpl_th_imsak'));
    setText('share-schedule-th-subuh', t('modules/share/share-schedule-exporter:tpl_th_subuh'));
    setText('share-schedule-th-dzuhur', t('modules/share/share-schedule-exporter:tpl_th_dzuhur'));
    setText('share-schedule-th-ashar', t('modules/share/share-schedule-exporter:tpl_th_ashar'));
    setText('share-schedule-th-maghrib', t('modules/share/share-schedule-exporter:tpl_th_maghrib'));
    setText('share-schedule-th-isya', t('modules/share/share-schedule-exporter:tpl_th_isya'));
    setText('share-schedule-footer-note-1', t('modules/share/share-schedule-exporter:tpl_note_1'));
    setText('share-schedule-footer-note-2', t('modules/share/share-schedule-exporter:tpl_note_2', { appName: t('common:app_name') }));
    setText('share-schedule-branding-name', t('common:app_name'));
}

/**
 * Populate the <tbody> with 30-day schedule rows.
 * @param {HTMLElement} tbody
 * @param {Array} scheduleData
 */
function injectTableRows(tbody, scheduleData) {
    if (!tbody || !scheduleData) return;

    let html = '';

    for (const entry of scheduleData) {
        const dayOfWeek = entry.date instanceof Date ? entry.date.getDay() : -1;
        const isFriday  = dayOfWeek === 5;
        const isSunday  = dayOfWeek === 0;

        let hijriCellClass = 'share-schedule__cell-hijri';
        if (isFriday) hijriCellClass += ' share-schedule__cell-hijri--friday';
        if (isSunday) hijriCellClass += ' share-schedule__cell-hijri--sunday';

        const monthsShort = t('components/ui/header:months_short', { returnObjects: true }) || [];
        const hijriDisplay = `${escapeHtml(String(entry.hijriDay))} ${escapeHtml(entry.hijriMonthName || '')}`;
        const dateGregorian = entry.date instanceof Date
            ? `${escapeHtml(String(entry.date.getDate()))} ${escapeHtml(monthsShort[entry.date.getMonth()] || '')}`
            : '—';

        const tm = entry.timings || {};

        html +=
            '<tr class="share-schedule__row">' +
                `<td class="${hijriCellClass}">${hijriDisplay}</td>` +
                `<td class="share-schedule__cell-date">${dateGregorian}</td>` +
                `<td class="share-schedule__cell-time share-schedule__cell-imsak">${escapeHtml(cleanTimeStr(tm.imsak) || '—')}</td>` +
                `<td class="share-schedule__cell-time">${escapeHtml(cleanTimeStr(tm.subuh) || '—')}</td>` +
                `<td class="share-schedule__cell-time">${escapeHtml(cleanTimeStr(tm.dzuhur) || '—')}</td>` +
                `<td class="share-schedule__cell-time">${escapeHtml(cleanTimeStr(tm.ashar) || '—')}</td>` +
                `<td class="share-schedule__cell-time share-schedule__cell-maghrib">${escapeHtml(cleanTimeStr(tm.magrib) || '—')}</td>` +
                `<td class="share-schedule__cell-time">${escapeHtml(cleanTimeStr(tm.isya) || '—')}</td>` +
            '</tr>';
    }

    tbody.innerHTML = html;
}
