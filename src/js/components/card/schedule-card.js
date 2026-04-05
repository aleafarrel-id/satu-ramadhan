/**
 * Schedule Card Component
 * Renders the daily prayer schedule view: date navigation,
 * prayer time rows, featured card, action buttons, and skeleton.
 * Displays dynamic Hijri month names (not hardcoded to Ramadan).
 */

// Core & Libraries
import { PRAYER_LIST, getCurrentPrayer, getPrayerName } from '../../modules/prayer/prayer-times.js';

// Utilities & Helpers
import { SCHEDULE_PRAYERS } from '../../utils/datetime.js';
import { t } from '../../core/i18n.js';

// UI Components
import { renderFeaturedCard, renderOrgToggle, renderKiblatButton } from '../prayer/prayer-widgets.js';
import { renderShareScheduleCard } from './share-schedule-card.js';

/**
 * Render the complete schedule page HTML structure.
 * @param {Object} entry        - Day entry { hijriDay, hijriMonthName, hijriYear, date, isToday, timings }
 * @param {string} orgName      - Display name of selected organization
 * @param {Object|null} todayTimings - Today's prayer timings (for featured card)
 * @param {number} dayIndex     - Current day index
 * @param {number} [totalDays=30] - Total number of days in the Hijri month
 * @returns {string} HTML string
 */
export function renderScheduleCard(entry, orgName, todayTimings, dayIndex, totalDays = 30) {
    const viewingToday = entry.isToday;
    const activePrayerKey = viewingToday ? getActivePrayerKey(entry.timings) : null;
    const featuredHtml = todayTimings ? renderFeaturedCard(todayTimings) : '';

    return `
        <div class="schedule-page">
            <div class="card card--container schedule-widget-card">
                <div id="schedule-featured-container">${featuredHtml}</div>
                <div class="schedule-actions">
                    ${renderKiblatButton('schedule-btn-kiblat')}
                    ${renderOrgToggle(orgName, 'schedule-org-toggle')}
                </div>
            </div>

            ${renderShareScheduleCard()}

            <div class="card card--container schedule-content-card${viewingToday ? ' schedule-content-card--today' : ''}" id="schedule-swipe-area">
                ${renderDateNav(entry, dayIndex, totalDays)}
                <div class="schedule-swipe-inner" id="schedule-swipe-inner">
                    <div class="schedule-prayers">
                        ${renderPrayerRows(entry.timings, activePrayerKey, viewingToday)}
                    </div>
                </div>
                <div class="schedule-swipe-hint">
                    <i class='bx bx-chevron-left schedule-swipe-hint__arrow schedule-swipe-hint__arrow--left'></i>
                    <span class="schedule-swipe-hint__text">${t('components/card/schedule-card:swipe_hint')}</span>
                    <i class='bx bx-chevron-right schedule-swipe-hint__arrow schedule-swipe-hint__arrow--right'></i>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update swipe inner content and navigation state without full reflow.
 * Used during slide animations to swap content efficiently.
 * @param {Object} entry     - Day entry for the target day
 * @param {number} dayIndex  - Current day index
 * @param {HTMLElement} container - Parent container for scoped queries
 * @param {number} [totalDays=30] - Total number of Ramadhan days
 * @returns {string|null} Active prayer key (for state tracking)
 */
export function updateScheduleContent(entry, dayIndex, container, totalDays = 30) {
    const viewingToday = entry.isToday;
    const activePrayerKey = viewingToday ? getActivePrayerKey(entry.timings) : null;

    const inner = document.getElementById('schedule-swipe-inner');
    if (inner) {
        inner.innerHTML = `
            <div class="schedule-prayers">
                ${renderPrayerRows(entry.timings, activePrayerKey, viewingToday)}
            </div>
        `;
    }

    const titleEl = container?.querySelector('.schedule-nav__title');
    const subtitleEl = container?.querySelector('.schedule-nav__subtitle');

    if (titleEl) {
        titleEl.textContent = `${entry.hijriDay} ${entry.hijriMonthName} ${entry.hijriYear}`;
    }
    if (subtitleEl) {
        const days = t('components/ui/header:days', { returnObjects: true }) || [];
        const months = t('components/ui/header:months', { returnObjects: true }) || [];
        const dayOfWeek = days[entry.date.getDay()];
        const dateFormatted = formatGregorianDateFromObj(entry.date, months);
        subtitleEl.textContent = `${dayOfWeek}, ${dateFormatted}`;
    }

    const todayBtn = document.getElementById('schedule-today');
    if (todayBtn) {
        todayBtn.classList.toggle('hidden', viewingToday);
    }

    const prevBtn = document.getElementById('schedule-prev');
    const nextBtn = document.getElementById('schedule-next');

    if (prevBtn) {
        const isPrevDisabled = dayIndex <= 0;
        prevBtn.classList.toggle('disabled', isPrevDisabled);
        prevBtn.disabled = isPrevDisabled;
    }
    if (nextBtn) {
        const isNextDisabled = dayIndex >= totalDays - 1;
        nextBtn.classList.toggle('disabled', isNextDisabled);
        nextBtn.disabled = isNextDisabled;
    }

    const contentCard = document.getElementById('schedule-swipe-area');
    if (contentCard) {
        contentCard.classList.toggle('schedule-content-card--today', viewingToday);
    }

    return activePrayerKey;
}

/**
 * Toggle active highlight class on prayer rows.
 * @param {string} activePrayerKey - Key of the currently active prayer
 * @param {HTMLElement} container  - Parent container for scoped queries
 */
export function updateScheduleHighlights(activePrayerKey, container) {
    const rows = container.querySelectorAll('.schedule-prayer-row');
    rows.forEach((row, i) => {
        const key = SCHEDULE_PRAYERS[i];
        row.classList.toggle('schedule-prayer-row--active', key === activePrayerKey);
    });
}

/**
 * Re-render the featured card container.
 * @param {Object} todayTimings - Today's prayer timings
 */
export function updateScheduleFeaturedCard(todayTimings) {
    const container = document.getElementById('schedule-featured-container');
    if (container && todayTimings) {
        container.innerHTML = renderFeaturedCard(todayTimings);
    }
}

/**
 * Get the currently active prayer key from timings.
 * @param {Object} timings - Prayer timings object
 * @returns {string|null} Active prayer key or null
 */
export function getActivePrayerKey(timings) {
    if (!timings) return null;
    const prayerState = getCurrentPrayer(timings);
    return prayerState.current?.key || null;
}

/**
 * Render the skeleton loading state for the schedule page.
 * @returns {string} HTML string
 */
export function renderScheduleCardSkeleton() {
    const skeletonRows = Array.from({ length: 7 }, () => `
        <div class="schedule-prayer-row">
            <div class="skeleton skeleton--prayer-icon"></div>
            <div class="skeleton skeleton--text-sm" style="width: 30%"></div>
            <div class="skeleton skeleton--text-md skeleton--ml-auto" style="width: 18%"></div>
        </div>
    `).join('');

    return `
        <div class="schedule-page">
            <!-- Featured card skeleton -->
            <div class="card card--inner skeleton-featured skeleton--mb-md">
                <div class="skeleton skeleton--featured-icon-sm"></div>
                <div class="skeleton-featured__body">
                    <div class="skeleton skeleton--text-md" style="width: 40%"></div>
                    <div class="skeleton skeleton--text-lg" style="width: 30%"></div>
                </div>
                <div class="skeleton skeleton--badge"></div>
            </div>

            <!-- Action buttons skeleton -->
            <div class="schedule-actions">
                <div class="skeleton skeleton--action-btn-fill"></div>
                <div class="skeleton skeleton--action-btn-fixed"></div>
            </div>

            <!-- Date nav skeleton -->
            <div class="schedule-nav" style="margin-top: var(--spacing-lg)">
                <div class="schedule-nav__info">
                    <div class="skeleton skeleton--text-lg" style="width: 55%"></div>
                    <div class="skeleton skeleton--text-xs skeleton--mt-sm" style="width: 40%"></div>
                </div>
                <div class="schedule-nav__arrows">
                    <div class="skeleton skeleton--nav-arrow"></div>
                    <div class="skeleton skeleton--nav-arrow"></div>
                </div>
            </div>

            <!-- Prayer rows skeleton -->
            <div class="schedule-prayers">
                ${skeletonRows}
            </div>
        </div>
    `;
}

/**
 * Render the bottom skeleton specifically used in empty/error states.
 * @returns {string} HTML string
 */
export function renderScheduleCardBottomSkeleton() {
    const skeletonRows = Array.from({ length: 7 }, () => `
        <div class="schedule-prayer-row">
            <div class="skeleton skeleton--prayer-icon"></div>
            <div class="skeleton skeleton--text-sm" style="width: 30%"></div>
            <div class="skeleton skeleton--text-md skeleton--ml-auto" style="width: 18%"></div>
        </div>
    `).join('');

    return `
        <!-- Date nav skeleton -->
        <div class="schedule-nav">
            <div class="schedule-nav__info">
                <div class="skeleton skeleton--text-lg" style="width: 55%"></div>
                <div class="skeleton skeleton--text-xs skeleton--mt-sm" style="width: 40%"></div>
            </div>
            <div class="schedule-nav__arrows">
                <div class="skeleton skeleton--nav-arrow"></div>
                <div class="skeleton skeleton--nav-arrow"></div>
            </div>
        </div>

        <!-- Prayer rows skeleton -->
        <div class="schedule-prayers" style="margin-top: 5px;">
            ${skeletonRows}
        </div>
    `;
}

/**
 * Render the date navigation bar with title, subtitle, and controls.
 */
function renderDateNav(entry, dayIndex, totalDays = 30) {
    const { hijriDay, hijriMonthName, hijriYear, date, isToday: today, timings } = entry;

    const days = t('components/ui/header:days', { returnObjects: true }) || [];
    const months = t('components/ui/header:months', { returnObjects: true }) || [];
    const dayOfWeek = days[date.getDay()];

    const dateFormatted = timings?.gregorian
        ? formatGregorianDate(timings.gregorian, months)
        : formatGregorianDateFromObj(date, months);

    const isPrevDisabled = dayIndex <= 0;
    const isNextDisabled = dayIndex >= totalDays - 1;

    return `
        <div class="schedule-nav" data-focus-group="schedule-nav" data-focus-direction="horizontal">
            <div class="schedule-nav__info">
                <div class="schedule-nav__title-pill" id="btn-calendar-modal" role="button" tabindex="0" data-focus-item>
                    <span class="schedule-nav__badge-icon"><i class='bx bxs-calendar'></i></span>
                    <span class="schedule-nav__title">${hijriDay} ${hijriMonthName} ${hijriYear}</span>
                </div>
                <span class="schedule-nav__subtitle">${dayOfWeek}, ${dateFormatted}</span>
            </div>
            <div class="schedule-nav__controls">
                <button class="schedule-nav__today${today ? ' hidden' : ''}" id="schedule-today" data-focus-item>
                    <i class='bx bx-reset'></i>
                </button>
                <div class="schedule-nav__arrows">
                    <button class="schedule-nav__btn schedule-nav__btn--prev${isPrevDisabled ? ' disabled' : ''}"
                            id="schedule-prev" ${isPrevDisabled ? 'disabled' : ''} data-focus-item>
                        <i class='bx bxs-chevron-left'></i>
                    </button>
                    <button class="schedule-nav__btn schedule-nav__btn--next${isNextDisabled ? ' disabled' : ''}"
                            id="schedule-next" ${isNextDisabled ? 'disabled' : ''} data-focus-item>
                        <i class='bx bxs-chevron-right'></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render all 7 prayer time rows.
 */
function renderPrayerRows(timings, activePrayerKey, viewingToday) {
    return SCHEDULE_PRAYERS.map(key =>
        renderPrayerRow(key, timings, activePrayerKey, viewingToday)
    ).join('');
}

/**
 * Render a single prayer time row with icon, name, time, and active state.
 */
function renderPrayerRow(key, timings, activePrayerKey, todayView) {
    const prayer = PRAYER_LIST.find(p => p.key === key);
    const time = timings ? cleanTime(timings[key]) : '--:--';
    const isActive = todayView && activePrayerKey === key;

    return `
        <div class="schedule-prayer-row${isActive ? ' schedule-prayer-row--active' : ''}">
            <div class="schedule-prayer-row__icon">${prayer?.icon || ''}</div>
            <span class="schedule-prayer-row__name">${prayer ? getPrayerName(prayer.key) : key}</span>
            <span class="schedule-prayer-row__time">${time}</span>
        </div>
    `;
}

/**
 * Strip timezone notes from time strings, e.g. "04:12 (WIB)" → "04:12".
 */
function cleanTime(timeStr) {
    return timeStr ? timeStr.replace(/\s*\(.*\)/, '') : '--:--';
}

/**
 * Format gregorian date object from API using translated month names.
 * @param {Object} greg - API gregorian object { day, month: { number, en }, year }
 * @param {string[]} months - Array of 12 translated month names (0-indexed)
 * @returns {string} e.g. "19 Februari 2026"
 */
function formatGregorianDate(greg, months) {
    const day = parseInt(greg.day, 10);
    const monthName = months[greg.month.number - 1] || greg.month.en;
    return `${day} ${monthName} ${greg.year}`;
}

/**
 * Format a Date object using translated month names.
 * @param {Date} date - Date object
 * @param {string[]} months - Array of 12 translated month names (0-indexed)
 * @returns {string} e.g. "19 Februari 2026"
 */
function formatGregorianDateFromObj(date, months) {
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
