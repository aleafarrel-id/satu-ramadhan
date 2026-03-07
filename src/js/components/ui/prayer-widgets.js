/**
 * Prayer Widgets — Shared UI components
 * Reusable across Home and Schedule pages (DRY)
 */

import { getCurrentPrayer } from '../../modules/prayer-times.js';
import { toggleOrg, getOrgDisplayName } from '../../modules/ramadhan.js';
import { impact } from '../../modules/haptic.js';
import * as notif from '../../modules/notification.js';

/* ── Helpers ── */

/** Remove timezone notes, e.g. "04:12 (WIB)" → "04:12" */
function cleanTime(timeStr) {
    return timeStr ? timeStr.replace(/\s*\(.*\)/, '') : '--:--';
}

/* ── Featured Prayer Card ── */

/**
 * Render the "current prayer" featured card with icon, name, time, and "Sekarang" badge
 * @param {object} timings - prayer timings object { imsak, subuh, ... }
 * @returns {string} HTML string
 */
export function renderFeaturedCard(timings) {
    if (!timings) return '';

    const prayerState = getCurrentPrayer(timings);
    const current = prayerState.current;
    if (!current) return '';

    return `
        <div class="card card--inner prayer-featured">
            <div class="prayer-featured__icon">${current.icon}</div>
            <div class="prayer-featured__info">
                <div class="prayer-featured__name">${current.name}</div>
                <div class="prayer-featured__time">${cleanTime(current.time)}</div>
            </div>
            <span class="prayer-featured__badge">Sekarang</span>
        </div>
    `;
}

/* ── Organization Toggle Button ── */

/**
 * Render the org toggle button HTML
 * @param {string} orgName - display name of the org
 * @param {string} [id='org-toggle'] - element ID
 * @returns {string} HTML string
 */
export function renderOrgToggle(orgName, id = 'org-toggle') {
    return `
        <button class="org-toggle" id="${id}">
            <span class="org-toggle__icon-circle"><i class='bx bxs-home'></i></span>
            <span class="org-toggle__label" id="${id}-label">${orgName}</span>
        </button>
    `;
}

/**
 * Handle org toggle click — switches org and updates label
 * @param {string} [labelId='org-toggle-label'] - ID of the label element to update
 * @param {Function} [onToggle] - optional callback after toggling
 */
export async function handleOrgToggle(labelId = 'org-toggle-label', onToggle) {
    impact('medium');

    const newOrg = await toggleOrg();
    const displayName = getOrgDisplayName(newOrg);
    const label = document.getElementById(labelId);
    if (label) label.textContent = displayName;

    notif.success(`Organisasi Diubah: ${displayName}`);

    if (onToggle) onToggle(newOrg);
}

/* ── Kiblat Button ── */

/**
 * Render the Kiblat shortcut button with compass badge
 * @param {string} [id='btn-kiblat'] - element ID
 * @returns {string} HTML string
 */
export function renderKiblatButton(id = 'btn-kiblat') {
    return `
        <button class="kiblat-btn" id="${id}">
            <span class="kiblat-btn__icon-circle"><i class='bx bx-compass'></i></span>
            <span class="kiblat-btn__label">Kiblat</span>
        </button>
    `;
}
