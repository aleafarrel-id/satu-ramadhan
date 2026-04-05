/**
 * Header Component
 * Renders app logo, digital clock, and date
 */

import { t, loadNS } from '../../core/i18n.js';

const logoUrl = '/favicon/favicon.png';

let _container = null;
let _clockEl = null;
let _dateEl = null;
let _interval = null;

/**
 * Render the header into the container
 */
export async function render(container) {
    _container = container;

    await loadNS('components/ui/header');

    _container.innerHTML = `
        <img src="${logoUrl}" alt="Satu Ramadhan" class="header-logo" />
        <div class="header-right">
            <div class="header-clock" id="header-clock"></div>
            <div class="header-date" id="header-date"></div>
        </div>
    `;

    _clockEl = document.getElementById('header-clock');
    _dateEl = document.getElementById('header-date');

    updateTime();
    _interval = setInterval(updateTime, 1000);
}

/**
 * Update clock and date display
 */
function updateTime() {
    const now = new Date();

    // Clock: HH:MM:SS
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (_clockEl) _clockEl.textContent = `${h}:${m}:${s}`;

    // Date: Senin, 23 Februari 2026
    // Date: Senin, 23 Februari 2026
    const days = t('components/ui/header:days', { returnObjects: true }) || [];
    const months = t('components/ui/header:months', { returnObjects: true }) || [];
    const day = days[now.getDay()];
    const date = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    if (_dateEl) _dateEl.textContent = `${day}, ${date} ${month} ${year}`;
}

/**
 * Cleanup
 */
export function destroy() {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
}
