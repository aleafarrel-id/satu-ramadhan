/**
 * Calendar Modal Component
 * Shows a monthly Ramadhan calendar grid (Hijri day prominent, Gregorian small).
 * Reuses the overlay pattern from location-modal.
 */

/* ── Constants ── */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/back-handler.js';

const WEEKDAY_HEADERS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const MONTH_ID = {
    1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
    5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
};

/* ── DOM State ── */

let _overlayEl = null;

/* ── Public API ── */

/**
 * Show the calendar modal.
 * @param {object} options
 * @param {Array}    options.scheduleData   - 30-day Ramadhan schedule entries
 * @param {number}   options.currentIndex   - currently viewed day index (0-based)
 * @param {Function} options.onSelectDay    - callback(index) when a day is selected
 */
export function showCalendarModal({ scheduleData, currentIndex, onSelectDay }) {
    if (_overlayEl) removeModal();

    _overlayEl = createModalDOM(scheduleData, currentIndex, onSelectDay);
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideCalendarModal);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));
}

/**
 * Hide the calendar modal with exit animation, then remove from DOM.
 */
export function hideCalendarModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');
    _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    // Safety: force remove after animation
    setTimeout(removeModal, 400);
}

/* ── Internal Helpers ── */

function removeModal() {
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    // Unregister from hardware back handler
    unregisterModalDismiss(hideCalendarModal);
}

/**
 * Check if a date is today (live check).
 */
function isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

/**
 * Get ISO-style weekday offset for a date (Monday = 0 … Sunday = 6).
 */
function getMondayBasedDay(date) {
    return (date.getDay() + 6) % 7;
}

/**
 * Format a gregorian date's day/month for the subtitle.
 */
function formatGregorianShort(date) {
    return `${date.getDate()} ${MONTH_ID[date.getMonth() + 1]}`;
}

/**
 * Build the calendar grid HTML.
 * @returns {string} HTML string
 */
function buildCalendarGrid(scheduleData, currentIndex) {
    if (!scheduleData || scheduleData.length === 0) return '';

    const firstDate = scheduleData[0].date;
    const tahunHijriah = scheduleData[0].tahunHijriah;

    // Determine Gregorian month range for the subtitle
    const firstGreg = formatGregorianShort(firstDate);
    const lastGreg = formatGregorianShort(scheduleData[scheduleData.length - 1].date);

    // Build header
    const header = `
        <div class="cal-modal__header">
            <div class="cal-modal__title">Ramadan ${tahunHijriah}</div>
            <div class="cal-modal__subtitle">${firstGreg} – ${lastGreg}</div>
        </div>
    `;

    // Weekday row
    const weekdayRow = WEEKDAY_HEADERS.map((d, i) =>
        `<div class="cal-modal__weekday" data-weekday="${i}">${d}</div>`
    ).join('');

    // Calculate leading empty cells (offset of day 1 Ramadhan)
    const startOffset = getMondayBasedDay(firstDate);

    // Build day cells
    const emptyCells = Array.from({ length: startOffset }, () =>
        '<div class="cal-modal__cell cal-modal__cell--empty"></div>'
    ).join('');

    const dayCells = scheduleData.map((entry, index) => {
        const gregDay = entry.date.getDate();
        const gregMonth = MONTH_ID[entry.date.getMonth() + 1]?.substring(0, 3) || '';
        const today = isToday(entry.date);
        const weekday = getMondayBasedDay(entry.date);
        const selected = index === currentIndex;

        const classes = [
            'cal-modal__cell',
            today ? 'cal-modal__cell--today' : '',
            selected ? 'cal-modal__cell--selected' : '',
        ].filter(Boolean).join(' ');

        return `
            <div class="${classes}" data-day-index="${index}" data-weekday="${weekday}">
                <span class="cal-modal__hijri">${entry.ramadhanDay}</span>
                <span class="cal-modal__greg">${gregDay} ${gregMonth}</span>
            </div>
        `;
    }).join('');

    return `
        ${header}
        <div class="cal-modal__grid">
            ${weekdayRow}
            ${emptyCells}
            ${dayCells}
        </div>
    `;
}

/**
 * Create the modal DOM tree.
 */
function createModalDOM(scheduleData, currentIndex, onSelectDay) {
    const overlay = document.createElement('div');
    overlay.className = 'cal-modal-overlay';

    const gridHTML = buildCalendarGrid(scheduleData, currentIndex);

    overlay.innerHTML = `
        <div class="cal-modal">
            ${gridHTML}
        </div>
    `;

    // ── Bind: Day cell clicks ──
    overlay.querySelectorAll('.cal-modal__cell[data-day-index]').forEach(cell => {
        cell.addEventListener('click', () => {
            const index = parseInt(cell.dataset.dayIndex, 10);
            hideCalendarModal();
            onSelectDay?.(index);
        });
    });

    // ── Bind: Click outside to close ──
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            hideCalendarModal();
        }
    });

    return overlay;
}
