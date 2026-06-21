/**
 * Schedule Card Component
 * Renders the daily prayer schedule view: date navigation,
 * prayer time rows, featured card, action buttons, and skeleton.
 * Displays dynamic Hijri month names (not hardcoded to Ramadan).
 */

// Core & Libraries
import { PRAYER_LIST, getCurrentPrayer, getPrayerName } from '../../modules/prayer/prayer-times.js';

// Utilities & Helpers
import { SCHEDULE_PRAYERS, ADZAN_PRAYER_KEYS } from '../../utils/datetime.js';
import { t } from '../../core/i18n.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { store } from '../../core/store.js';
import { isNative } from '../../modules/system/platform.js';
import { analyzeFastingDayOffline } from '../../modules/schedule/fasting-engine.js';
import { generateOfflineHijri } from '../../core/local-calculator.js';

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

            ${_renderFastingWrapper(entry)}

            <div class="card card--container schedule-content-card${viewingToday ? ' schedule-content-card--today' : ''}" id="schedule-swipe-area">
                ${renderDateNav(entry, dayIndex, totalDays)}
                <div class="schedule-today-container${viewingToday ? ' hidden' : ''}" id="schedule-today-container">
                    <button class="schedule-today-btn" id="schedule-today">
                        <i class='bx bx-reset'></i>
                        <span>${t('pages/schedule-page:back_to_today')}</span>
                    </button>
                </div>
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

    const badgeWrapper = document.getElementById('schedule-fasting-card-wrapper');
    if (badgeWrapper) {
        const todayBadgeHtml = renderFastingBadgeHtml(entry, false);
        const tomorrowBadgeHtml = entry.isToday ? renderFastingBadgeHtml(entry, true) : '';
        const innerHtml = _assembleFastingHtml(todayBadgeHtml, tomorrowBadgeHtml);
        badgeWrapper.innerHTML = innerHtml;
        badgeWrapper.classList.toggle('hidden', !innerHtml.trim());
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

    const todayContainer = document.getElementById('schedule-today-container');
    if (todayContainer) {
        todayContainer.classList.toggle('hidden', viewingToday);
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
    rows.forEach(row => {
        const key = row.dataset.prayer;
        if (key) {
            row.classList.toggle('schedule-prayer-row--active', key === activePrayerKey);
        }
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

    const tabletContainer = document.getElementById('sched-featured-tablet');
    if (tabletContainer && todayTimings) {
        tabletContainer.innerHTML = renderFeaturedCard(todayTimings);
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
            <!-- Widget card skeleton -->
            <div class="card card--container schedule-widget-card">
                <!-- Featured card skeleton -->
                <div class="card card--inner skeleton-featured">
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
            </div>

            <!-- Date nav skeleton -->
            <div class="schedule-nav" style="margin-top: var(--spacing-lg)">
                <div class="schedule-nav__header">
                    <div class="skeleton skeleton--text-2xs skeleton--w-30"></div>
                </div>
                <div class="schedule-nav__row">
                    <div class="skeleton skeleton--icon-square"></div>
                    <div class="schedule-nav__info">
                        <div class="skeleton skeleton--text-sm skeleton--w-65"></div>
                        <div class="skeleton skeleton--text-xs skeleton--mt-sm skeleton--w-45"></div>
                    </div>
                    <div class="schedule-nav__controls">
                        <div class="schedule-nav__arrows">
                            <div class="skeleton skeleton--nav-arrow"></div>
                            <div class="skeleton skeleton--nav-arrow"></div>
                        </div>
                    </div>
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
            <div class="schedule-nav__header">
                <div class="skeleton skeleton--text-2xs skeleton--w-30"></div>
            </div>
            <div class="schedule-nav__row">
                <div class="skeleton skeleton--icon-square"></div>
                <div class="schedule-nav__info">
                    <div class="skeleton skeleton--text-sm skeleton--w-65"></div>
                    <div class="skeleton skeleton--text-xs skeleton--mt-sm skeleton--w-45"></div>
                </div>
                <div class="schedule-nav__controls">
                    <div class="schedule-nav__arrows">
                        <div class="skeleton skeleton--nav-arrow"></div>
                        <div class="skeleton skeleton--nav-arrow"></div>
                    </div>
                </div>
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
    const { hijriDay, hijriMonthName, hijriYear, date, timings } = entry;

    const days = t('components/ui/header:days', { returnObjects: true }) || [];
    const months = t('components/ui/header:months', { returnObjects: true }) || [];
    const dayOfWeek = days[date.getDay()];

    const dateFormatted = timings?.gregorian
        ? formatGregorianDate(timings.gregorian, months)
        : formatGregorianDateFromObj(date, months);

    const isPrevDisabled = dayIndex <= 0;
    const isNextDisabled = dayIndex >= totalDays - 1;

    return `
        <div class="schedule-nav" id="btn-calendar-modal" role="button" tabindex="0" data-focus-group="schedule-nav" data-focus-direction="vertical" aria-label="Open Calendar">
            <div class="schedule-nav__header">
                ${t('pages/schedule-page:calendar_header')}
            </div>
            <div class="schedule-nav__row">
                <i class='bx bx-calendar schedule-nav__icon'></i>
                <div class="schedule-nav__info">
                    <div class="schedule-nav__title">${escapeHtml(hijriDay)} ${escapeHtml(hijriMonthName)} ${escapeHtml(hijriYear)}</div>
                    <div class="schedule-nav__subtitle">${dayOfWeek}, ${dateFormatted}</div>
                </div>
                <div class="schedule-nav__controls">
                    <div class="schedule-nav__arrows">
                        <button class="schedule-nav__btn schedule-nav__btn--prev${isPrevDisabled ? ' disabled' : ''}"
                                id="schedule-prev" ${isPrevDisabled ? 'disabled' : ''} data-focus-item>
                            <i class='bx bx-chevron-left'></i>
                        </button>
                        <button class="schedule-nav__btn schedule-nav__btn--next${isNextDisabled ? ' disabled' : ''}"
                                id="schedule-next" ${isNextDisabled ? 'disabled' : ''} data-focus-item>
                            <i class='bx bx-chevron-right'></i>
                        </button>
                    </div>
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
 *
 * Adzan toggle visibility follows a hierarchy:
 *   1. Non-native (Web) or Global notification OFF  → no toggle icon rendered
 *   2. Global adzan OFF         → disabled mute icon (non-interactive, like imsak/terbit)
 *   3. Both globals ON          → interactive per-prayer toggle
 */
function renderPrayerRow(key, timings, activePrayerKey, todayView) {
    const prayer = PRAYER_LIST.find(p => p.key === key);
    const time = timings ? cleanTime(timings[key]) : '--:--';
    const isActive = todayView && activePrayerKey === key;

    const adzanPrayers = ADZAN_PRAYER_KEYS;
    let rightSideHtml = '';
    let isClickable = false;

    const isNotifEnabled = store.getState('settings.notification');

    if (isNative && isNotifEnabled) {
        if (adzanPrayers.includes(key)) {
            const isGlobalAdzanEnabled = store.getState('settings.adzan');

            if (!isGlobalAdzanEnabled) {
                // Global adzan OFF → show disabled muted icon (same look as imsak/sunrise)
                rightSideHtml = `<div class="schedule-prayer-row__adzan-toggle disabled"><i class='bx bx-volume-mute'></i></div>`;
            } else {
                // Both globals ON → interactive per-prayer toggle
                const adzanEnabled = store.getState('settings.adzanControls.' + key) !== false;
                const icon = adzanEnabled ? 'bx-volume-full' : 'bx-volume-mute';
                const activeClass = adzanEnabled ? ' active' : '';
                rightSideHtml = `<button class="schedule-prayer-row__adzan-toggle${activeClass}" data-action="toggle-adzan"><i class='bx ${icon}'></i></button>`;
                isClickable = true;
            }
        } else {
            // Non-adzan prayer (imsak/terbit) → interactive notification toggle
            const notifEnabled = store.getState('settings.notifControls.' + key) !== false;
            const bellIcon = notifEnabled ? 'bx-bell' : 'bx-bell-off';
            const activeClass = notifEnabled ? ' active' : '';
            rightSideHtml = `<button class="schedule-prayer-row__adzan-toggle${activeClass}" data-action="toggle-notif"><i class='bx ${bellIcon}'></i></button>`;
            isClickable = true;
        }
    } else {
        // Global notification OFF or Web environment → hide everything in the right column
        rightSideHtml = '';
    }

    return `
        <div class="schedule-prayer-row${isActive ? ' schedule-prayer-row--active' : ''}${isClickable ? ' clickable' : ''}" data-prayer="${key}">
            <div class="schedule-prayer-row__icon">${prayer?.icon || ''}</div>
            <span class="schedule-prayer-row__name">${prayer ? getPrayerName(prayer.key) : key}</span>
            <div class="schedule-prayer-row__time-wrapper">
                <span class="schedule-prayer-row__time">${time}</span>
                ${rightSideHtml}
            </div>
        </div>
    `;
}

/**
 * Strip timezone notes from time strings, e.g. "04:12 (WIB)" → "04:12".
 */
function cleanTime(timeStr) {
    if (!timeStr) return '--:--';
    const cleaned = timeStr.replace(/\s*\(.*\)/, '');
    return /^\d{1,2}:\d{2}$/.test(cleaned) ? cleaned : '--:--';
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

/**
 * Assemble the fasting wrapper inner HTML.
 * When both today and tomorrow fasting exist, wraps them in a unified group.
 * This keeps the total vertical footprint equal to a single card.
 * @param {string} todayHtml
 * @param {string} tomorrowHtml
 * @returns {string}
 */
function _assembleFastingHtml(todayHtml, tomorrowHtml) {
    if (todayHtml && tomorrowHtml) {
        return `<div class="schedule-fasting-group">${todayHtml}${tomorrowHtml}</div>`;
    }
    return todayHtml + tomorrowHtml;
}

/**
 * Render the fasting card wrapper div with both today and tomorrow cards.
 * Returns the wrapper hidden if neither card has content.
 * @param {Object} entry - Day entry
 * @returns {string} HTML string
 */
function _renderFastingWrapper(entry) {
    const todayHtml = renderFastingBadgeHtml(entry, false);
    const tomorrowHtml = entry.isToday ? renderFastingBadgeHtml(entry, true) : '';
    const innerHtml = _assembleFastingHtml(todayHtml, tomorrowHtml);
    const hasContent = innerHtml.trim().length > 0;
    return `<div id="schedule-fasting-card-wrapper"${hasContent ? '' : ' class="hidden"'}>${innerHtml}</div>`;
}

/**
 * Render the fasting badge for a day entry.
 *
 * - isTomorrow=false → full primary card (today's fasting)
 * - isTomorrow=true  → compact inline strip (proactive reminder for tomorrow)
 *   The strip is much shorter than a full card so it does not push prayer rows
 *   below the fold when two consecutive fasting days exist.
 *
 * @param {Object} entry - Day entry { hijriDay, hijriMonthNumber, date, isToday }
 * @param {boolean} isTomorrow - If true, renders a compact strip for the day AFTER entry.date.
 * @returns {string} HTML string, or empty string if no fasting event
 */
function renderFastingBadgeHtml(entry, isTomorrow = false) {
    if (!entry || !entry.date) return '';

    let targetDate;
    let hijri;

    if (isTomorrow) {
        // Calculate for the next calendar day
        targetDate = new Date(entry.date);
        targetDate.setDate(targetDate.getDate() + 1);
        // Derive hijri offline — the fasting engine itself handles offsets internally
        const rawHijri = generateOfflineHijri(targetDate);
        hijri = {
            day: String(rawHijri.day),
            month: { number: parseInt(rawHijri.month.number, 10) }
        };
    } else {
        // Use entry-level data (preset-aware, not raw API hijri)
        targetDate = entry.date;
        hijri = {
            day: String(entry.hijriDay),
            month: { number: entry.hijriMonthNumber || 0 }
        };
        // Guard: skip if we don't have month info from entry
        if (!hijri.month.number) return '';
    }

    const fastingEvents = analyzeFastingDayOffline(hijri, targetDate);
    if (!fastingEvents || fastingEvents.length === 0) return '';

    const primaryId = fastingEvents.includes('haram') ? 'haram' : fastingEvents[0];
    const data = t(`fasting:${primaryId}`, { returnObjects: true });
    if (!data || typeof data === 'string') return '';

    // Tomorrow: compact strip — saves vertical space when two consecutive fasting days exist
    if (isTomorrow) {
        const tomorrowLabel = t('pages/schedule-page:fasting-header-tomorrow');
        return `
            <button class="schedule-fasting-tomorrow-strip schedule-fasting-tomorrow-strip--${data.type}" data-fasting-id="${primaryId}" type="button">
                <span class="schedule-fasting-tomorrow-strip__pulse" aria-hidden="true"></span>
                <span class="schedule-fasting-tomorrow-strip__label">${tomorrowLabel}</span>
                <span class="schedule-fasting-tomorrow-strip__divider" aria-hidden="true"></span>
                <i class='bx ${data.icon} schedule-fasting-tomorrow-strip__icon' aria-hidden="true"></i>
                <span class="schedule-fasting-tomorrow-strip__text">${escapeHtml(data.name)}</span>
                <i class='bx bx-chevron-right schedule-fasting-tomorrow-strip__chevron' aria-hidden="true"></i>
            </button>
        `;
    }

    // Today: full primary card
    const headerText = t('pages/schedule-page:fasting-header');
    return `
        <button class="card card--container schedule-fasting-card" data-fasting-id="${primaryId}" type="button">
            <div class="schedule-fasting-card__header">
                ${headerText}
            </div>
            <div class="schedule-fasting-card__inner schedule-fasting-card__inner--${data.type}">
                <i class='bx ${data.icon} schedule-fasting-card__icon' aria-hidden="true"></i>
                <span class="schedule-fasting-card__text">${escapeHtml(data.name)}</span>
                <i class='bx bx-chevron-right schedule-fasting-card__chevron' aria-hidden="true"></i>
            </div>
        </button>
    `;
}
