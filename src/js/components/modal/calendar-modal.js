/**
 * Calendar Modal Component
 * Shows a monthly Hijri calendar grid (Hijri day prominent, Gregorian small).
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

// Utilities & Helpers
import { t, loadNS } from '../../core/i18n.js';
import { makeAccessibleBtn, addEscHandler, trapFocus } from '../../utils/a11y.js';
import { getModalRoot } from '../../utils/modal-portal.js';

let _overlayEl = null;
let _releaseFocus = null;

/**
 * Show the calendar modal.
 * @param {object} options
 * @param {Array}    options.scheduleData   - 30-day Ramadhan schedule entries
 * @param {number}   options.currentIndex   - currently viewed day index (0-based)
 * @param {Function} options.onSelectDay    - callback(index) when a day is selected
 */
export async function showCalendarModal({ scheduleData, currentIndex, onSelectDay }) {
    if (_overlayEl) removeModal();
    
    await loadNS('components/ui/header');
    await loadNS('components/modal/calendar-modal');

    _overlayEl = createModalDOM(scheduleData, currentIndex, onSelectDay);
    getModalRoot().appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideCalendarModal);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);
}

/**
 * Hide the calendar modal with exit animation, then remove from DOM.
 */
export function hideCalendarModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');

    let isRemoved = false;
    const finalize = () => {
        if (isRemoved) return;
        isRemoved = true;
        removeModal();
    };

    _overlayEl.addEventListener('transitionend', finalize, { once: true });
    // Safety: force remove after animation
    setTimeout(finalize, 400);
}

function removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
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
    const months = t('components/ui/header:months', { returnObjects: true }) || [];
    return `${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Build the calendar grid HTML.
 * @returns {string} HTML string
 */
function buildCalendarGrid(scheduleData, currentIndex) {
    if (!scheduleData || scheduleData.length === 0) return '';

    const firstDate = scheduleData[0].date;
    const hijriMonthName = scheduleData[0].hijriMonthName || t('components/modal/calendar-modal:hijriah');
    const hijriYear = scheduleData[0].hijriYear || '';

    // Determine Gregorian month range for the subtitle
    const firstGreg = formatGregorianShort(firstDate);
    const lastGreg = formatGregorianShort(scheduleData[scheduleData.length - 1].date);

    // Build header — dynamic Hijri month name
    const header = `
        <div class="cal-modal__header">
            <div class="cal-modal__title">${hijriMonthName} ${hijriYear}</div>
            <div class="cal-modal__subtitle">${firstGreg} – ${lastGreg}</div>
        </div>
    `;

    // Weekday row (Monday-first)
    const daysShort = t('components/ui/header:days_short', { returnObjects: true }) || [];
    const reorderedDays = [...daysShort.slice(1), daysShort[0]];
    
    const weekdayRow = reorderedDays.map((d, i) =>
        `<div class="cal-modal__weekday" data-weekday="${i}">${d}</div>`
    ).join('');

    // Calculate leading empty cells (offset of day 1 Ramadhan)
    const startOffset = getMondayBasedDay(firstDate);

    // Build day cells
    const emptyCells = Array.from({ length: startOffset }, () =>
        '<div class="cal-modal__cell cal-modal__cell--empty"></div>'
    ).join('');

    const dayCells = scheduleData.map((entry, index) => {
        const monthsShort = t('components/ui/header:months_short', { returnObjects: true }) || [];
        const gregDay = entry.date.getDate();
        const gregMonth = monthsShort[entry.date.getMonth()] || '';
        const today = isToday(entry.date);
        const weekday = getMondayBasedDay(entry.date);
        const selected = index === currentIndex;

        const classes = [
            'cal-modal__cell',
            today ? 'cal-modal__cell--today' : '',
            selected ? 'cal-modal__cell--selected' : '',
        ].filter(Boolean).join(' ');

        return `
            <div class="${classes}" data-day-index="${index}" data-weekday="${weekday}" data-focus-item="true">
                <span class="cal-modal__hijri">${entry.hijriDay}</span>
                <span class="cal-modal__greg">${gregDay} ${gregMonth}</span>
            </div>
        `;
    }).join('');

    return `
        ${header}
        <div class="cal-modal__grid" data-focus-group="calendar-grid" data-focus-direction="grid" data-focus-grid-cols="7">
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

    overlay.querySelectorAll('.cal-modal__cell[data-day-index]').forEach(cell => {
        makeAccessibleBtn(cell, () => {
            const index = parseInt(cell.dataset.dayIndex, 10);
            hideCalendarModal();
            onSelectDay?.(index);
        });
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            hideCalendarModal();
        }
    });

    addEscHandler(overlay, hideCalendarModal);

    return overlay;
}
