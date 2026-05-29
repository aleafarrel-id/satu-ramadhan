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
import * as Notification from '../../modules/notification/notification.js';
import { showFastingDetailsModal } from './fasting-details-modal.js';

import { getFastingCalendarForYear, buildOfflineHijriMonth } from '../../modules/schedule/fasting-engine.js';

let _overlayEl = null;
let _releaseFocus = null;
let _currentMonthOffset = 0;
let _baseDate = new Date();
let _gridData = [];

export async function showCalendarModal({ scheduleData, currentIndex, onSelectDay }) {
    if (_overlayEl) removeModal();

    await loadNS('components/ui/header');
    await loadNS('components/modal/calendar-modal');
    await loadNS('fasting');

    // Reset offset and state
    _currentMonthOffset = 0;
    _baseDate = scheduleData && scheduleData.length > 0 ? scheduleData[0].date : new Date();

    _overlayEl = createModalDOM(currentIndex, scheduleData, onSelectDay);
    getModalRoot().appendChild(_overlayEl);

    registerModalDismiss(hideCalendarModal);
    requestAnimationFrame(() => _overlayEl.classList.add('active'));
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
 * @param {Date|null} selectedDate - The currently selected day's date, for exact comparison.
 * @param {string} animClass - CSS animation class for transitions.
 * @returns {string} HTML string
 */
function buildCalendarGrid(selectedDate, animClass = '') {
    const hijriMonthNames = t('components/ui/header:hijri_months', { returnObjects: true }) || [];
    _gridData = buildOfflineHijriMonth(_currentMonthOffset, _baseDate, hijriMonthNames);
    if (!_gridData || _gridData.length === 0) return '';

    const firstDate = _gridData[0].date;
    const hijriMonthName = _gridData[0].hijriMonthName;
    const hijriYear = _gridData[0].hijriYear;

    const firstGreg = formatGregorianShort(firstDate);
    const lastGreg = formatGregorianShort(_gridData[_gridData.length - 1].date);

    // Fetch fasting data map for the year(s) this grid spans
    const fastingMap = getFastingCalendarForYear(firstDate.getFullYear());
    const lastDate = _gridData[_gridData.length - 1].date;
    const nextYearMap = firstDate.getFullYear() !== lastDate.getFullYear()
        ? getFastingCalendarForYear(lastDate.getFullYear())
        : null;

    const header = `
        <div class="cal-modal__header">
            <button class="cal-modal__nav-btn" id="cal-nav-prev"><i class='bx bx-chevron-left'></i></button>
            <div class="cal-modal__header-info">
                <div class="cal-modal__title">${hijriMonthName} ${hijriYear}</div>
                <div class="cal-modal__subtitle">${firstGreg} – ${lastGreg}</div>
            </div>
            <button class="cal-modal__nav-btn" id="cal-nav-next"><i class='bx bx-chevron-right'></i></button>
        </div>
    `;

    const daysShort = t('components/ui/header:days_short', { returnObjects: true }) || [];
    const reorderedDays = [...daysShort.slice(1), daysShort[0]];

    const weekdayRow = reorderedDays.map((d, i) =>
        `<div class="cal-modal__weekday" data-weekday="${i}">${d}</div>`
    ).join('');

    const startOffset = getMondayBasedDay(firstDate);
    const emptyCells = Array.from({ length: startOffset }, () =>
        '<div class="cal-modal__cell cal-modal__cell--empty"></div>'
    ).join('');

    const dayCells = _gridData.map((entry, index) => {
        const monthsShort = t('components/ui/header:months_short', { returnObjects: true }) || [];
        const gregDay = entry.date.getDate();
        const gregMonth = monthsShort[entry.date.getMonth()] || '';
        const today = isToday(entry.date);
        const weekday = getMondayBasedDay(entry.date);

        // Compare by date string to avoid index mismatch between grid and scheduleData
        const selected = _currentMonthOffset === 0
            && selectedDate instanceof Date
            && entry.date.toDateString() === selectedDate.toDateString();

        // Check for fasting events
        const dateStr = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, '0')}-${String(entry.date.getDate()).padStart(2, '0')}`;
        let fastingEvents = fastingMap.get(dateStr) || (nextYearMap ? nextYearMap.get(dateStr) : null);

        let fastingClass = '';
        let primaryFastingId = '';
        if (fastingEvents && fastingEvents.length > 0) {
            // Priority: Forbidden > Mandatory > Sunnah
            let type = 'sunnah';
            if (fastingEvents.includes('haram')) type = 'forbidden';
            else if (fastingEvents.includes('wajib_ramadhan')) type = 'mandatory';

            fastingClass = `cal-modal__cell--${type}`;
            primaryFastingId = fastingEvents.includes('haram') ? 'haram' : fastingEvents[0];
        }

        const classes = [
            'cal-modal__cell',
            today ? 'cal-modal__cell--today' : '',
            selected ? 'cal-modal__cell--selected' : '',
            fastingClass
        ].filter(Boolean).join(' ');

        return `
            <div class="${classes}" data-day-index="${index}" data-fasting-id="${primaryFastingId}" data-weekday="${weekday}" data-focus-item="true">
                <span class="cal-modal__hijri">${entry.hijriDay}</span>
                <span class="cal-modal__greg">${gregDay} ${gregMonth}</span>
            </div>
        `;
    }).join('');

    const typeSunnah = t('fasting:common.type_sunnah') || 'Sunnah';
    const typeMandatory = t('fasting:common.type_mandatory') || 'Wajib';

    const formatLegend = (type) => t('fasting:common.legend_format', { type }) || `${type} Fasting`;

    const formatLegendHaram = t('fasting:common.legend_haram_puasa') || 'Forbidden (Fasting)';
    const hintText = t('fasting:common.hint_long_press') || 'Long press on marked days for fasting details';

    const legendHtml = `
        <div class="cal-modal__legend">
            <div class="cal-modal__legend-item">
                <div class="cal-modal__legend-color cal-modal__legend-color--sunnah"></div>
                <span>${formatLegend(typeSunnah)}</span>
            </div>
            <div class="cal-modal__legend-item">
                <div class="cal-modal__legend-color cal-modal__legend-color--mandatory"></div>
                <span>${formatLegend(typeMandatory)}</span>
            </div>
            <div class="cal-modal__legend-item">
                <div class="cal-modal__legend-color cal-modal__legend-color--forbidden"></div>
                <span>${formatLegendHaram}</span>
            </div>
        </div>
        <div class="cal-modal__hint">
            <span>${hintText}</span>
        </div>
    `;

    return `
        ${header}
        <div class="cal-modal__grid ${animClass}" data-focus-group="calendar-grid" data-focus-direction="grid" data-focus-grid-cols="7">
            ${weekdayRow}
            ${emptyCells}
            ${dayCells}
        </div>
        ${legendHtml}
    `;
}

/**
 * Create the modal DOM tree.
 */
function createModalDOM(currentIndex, scheduleData, onSelectDay) {
    const overlay = document.createElement('div');
    overlay.className = 'cal-modal-overlay';

    // Derive the selected date from scheduleData for accurate day comparison
    const selectedDate = scheduleData?.[currentIndex]?.date ?? null;

    const renderGrid = (dir = 'init') => {
        let animClass = '';
        if (dir === 'next') animClass = 'cal-slide-left';
        else if (dir === 'prev') animClass = 'cal-slide-right';
        else animClass = 'cal-fade-in';

        overlay.innerHTML = `
            <div class="cal-modal">
                ${buildCalendarGrid(selectedDate, animClass)}
            </div>
        `;

        // Bind day clicks and long presses
        overlay.querySelectorAll('.cal-modal__cell[data-day-index]').forEach(cell => {
            let pressTimer;

            const handleLongPress = () => {
                const fastingId = cell.dataset.fastingId;
                if (fastingId && fastingId !== 'null') {
                    showFastingDetailsModal(fastingId);
                }
            };

            let startX = 0;
            let startY = 0;

            const startPress = (e) => {
                // Ignore right clicks
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                startX = e.clientX;
                startY = e.clientY;
                pressTimer = setTimeout(handleLongPress, 500);
            };

            const cancelPress = () => {
                if (pressTimer) clearTimeout(pressTimer);
            };

            const movePress = (e) => {
                if (!pressTimer) return;
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                if (dx > 10 || dy > 10) {
                    cancelPress();
                }
            };

            cell.addEventListener('pointerdown', startPress);
            cell.addEventListener('pointerup', cancelPress);
            cell.addEventListener('pointercancel', cancelPress);
            cell.addEventListener('pointerleave', cancelPress);
            cell.addEventListener('pointermove', movePress);

            // Keep click for navigation
            makeAccessibleBtn(cell, async () => {
                cancelPress();
                if (_currentMonthOffset === 0) {
                    const dayIndex = parseInt(cell.dataset.dayIndex, 10);
                    const entry = _gridData?.[dayIndex];
                    hideCalendarModal();
                    if (entry?.date) onSelectDay?.(entry.date);
                } else {
                    Notification.info(t('fasting:common.out_of_month'));
                }
            });
        });

        // Bind Nav
        const btnPrev = overlay.querySelector('#cal-nav-prev');
        const btnNext = overlay.querySelector('#cal-nav-next');

        if (btnPrev) {
            btnPrev.addEventListener('click', (e) => {
                e.stopPropagation();
                _currentMonthOffset--;
                renderGrid('prev');
            });
        }
        if (btnNext) {
            btnNext.addEventListener('click', (e) => {
                e.stopPropagation();
                _currentMonthOffset++;
                renderGrid('next');
            });
        }
    };

    renderGrid();

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            hideCalendarModal();
        }
    });

    addEscHandler(overlay, hideCalendarModal);

    // --- Touch Swipe Support for changing months ---
    let touchStartX = 0;
    let touchStartY = 0;

    overlay.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        touchStartX = e.touches[0].screenX;
        touchStartY = e.touches[0].screenY;
    }, { passive: true });

    overlay.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        // Check if the swipe is primarily horizontal and > 50px
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) {
                // Swiped Left -> Next Month
                _currentMonthOffset++;
                renderGrid('next');
            } else {
                // Swiped Right -> Prev Month
                _currentMonthOffset--;
                renderGrid('prev');
            }
        }
    }, { passive: true });

    return overlay;
}
