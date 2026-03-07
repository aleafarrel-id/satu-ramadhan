/**
 * Header Component
 * Renders app logo, digital clock, and date
 */

const logoUrl = '/favicon/favicon.png';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

let _container = null;
let _clockEl = null;
let _dateEl = null;
let _interval = null;

/**
 * Render the header into the container
 */
export function render(container) {
    _container = container;

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
    const day = DAYS[now.getDay()];
    const date = now.getDate();
    const month = MONTHS[now.getMonth()];
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
