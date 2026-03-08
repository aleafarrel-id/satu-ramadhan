import { getMonthlyPrayerTimes, getPrayerTimesByCoords } from '../core/api.js';
import { getSavedLocation } from '../core/geolocation.js';
import { getRamadhanConfig } from '../core/database.js';

import { getSelectedOrg, getOrgDisplayName } from '../modules/ramadhan.js';
import { PRAYER_LIST, getCurrentPrayer } from '../modules/prayer-times.js';

import { renderFeaturedCard, renderOrgToggle, handleOrgToggle, renderKiblatButton } from '../components/ui/prayer-widgets.js';
import { renderScheduleSkeleton } from '../components/ui/skeleton-schedule.js';
import { renderEmptyState } from '../components/ui/empty-state.js';
import { showCalendarModal } from '../components/modal/calendar-modal.js';

/* --- STATE & CONSTANTS --- */
let _container = null;
let _scheduleData = null;
let _currentDayIndex = 0;
let _todayTimings = null;

let _refreshInterval = null;
let _lastActivePrayerKey = null;
let _lastDateStr = null;

const REFRESH_INTERVAL_MS = 30_000;

const WEEKDAY_ID = {
    Sunday: 'Minggu', Monday: 'Senin', Tuesday: 'Selasa',
    Wednesday: 'Rabu', Thursday: 'Kamis', Friday: 'Jumat', Saturday: 'Sabtu',
};

const MONTH_ID = {
    1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
    5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
    9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
};

const SCHEDULE_PRAYERS = ['imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'magrib', 'isya'];

const SWIPE_THRESHOLD = 50;
let _startX = 0;
let _startY = 0;
let _isSwiping = false;
let _swipeLocked = false;
let _isMouseDown = false;
let _wheelScrollCooldown = false;
let _animPhase = 'idle';
let _animDirection = null;
let _animId = 0;

/* --- LIFECYCLE --- */

/**
 * Bootstraps and constructs the single-day 30 format UI.
 * Connects the daily location API payload and bridges user's daily data.
 *
 * @param {HTMLElement} container - Active DOM payload to render upon.
 */
export async function render(container) {
    _container = container;
    renderSkeleton();

    const location = await getSavedLocation();

    if (!location) {
        renderError(false);
        return;
    }

    const [scheduleResult, todayTimingsResult] = await Promise.all([
        fetchScheduleData(location),
        getPrayerTimesByCoords(location.latitude, location.longitude).catch(() => null),
    ]);

    _scheduleData = scheduleResult;
    _todayTimings = todayTimingsResult;

    if (!_scheduleData) {
        renderError(true);
        return;
    }

    _currentDayIndex = findTodayIndex(_scheduleData);
    await renderDayView();
}

/**
 * Nullifies swipe thresholds alongside 30-day timeline objects
 * stopping async loop intervals and destroying handlers.
 */
export function destroy() {
    stopAutoRefresh();
    _container = null;
    _scheduleData = null;
    _todayTimings = null;
    _currentDayIndex = 0;
    _lastActivePrayerKey = null;
    _lastDateStr = null;
}

/* --- INITIALIZATION & DATA --- */

/**
 * Composes a full span of Gregorian 30-day date sets tailored
 * algorithmically to matching Hijri Ramadhan dates.
 *
 * @param {string} org - Identifier establishing the source of data.
 */
function computeRamadhanDates(org) {
    const config = getRamadhanConfig();
    const startStr = config.tanggalSatuRamadhan[org];
    const startDate = new Date(startStr + 'T00:00:00');
    const dates = [];

    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }

    return { startDate, dates };
}

/**
 * Resolves calendar crossings across matching unique months 
 * ensuring API fetches avoid missing fragments in edge-cases.
 *
 * @param {Array<Date>} dates - Batch of targeted month segments.
 */
function getRequiredMonths(dates) {
    const monthSet = new Map();
    for (const d of dates) {
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!monthSet.has(key)) {
            monthSet.set(key, { year: d.getFullYear(), month: d.getMonth() + 1 });
        }
    }
    return [...monthSet.values()];
}

/**
 * Probes the 30-day API response node by node, finding the
 * exact matching dictionary payload by traversing valid strings.
 *
 * @param {Array} allDays - Expanded collection response elements.
 * @param {Date} targetDate - The exact native target reference node.
 */
function findDayData(allDays, targetDate) {
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const yyyy = targetDate.getFullYear();
    return allDays.find(d => d.date === `${dd}-${mm}-${yyyy}`) || null;
}

/**
 * Handles concurrent API calls establishing full 30-day calendar views.
 * Restitutes an array mapped symmetrically with matching local metadata.
 *
 * @param {Object} location - Coordinates structure.
 */
async function fetchScheduleData(location) {
    const org = await getSelectedOrg();
    const { dates } = computeRamadhanDates(org);
    const requiredMonths = getRequiredMonths(dates);

    const monthResults = await Promise.all(
        requiredMonths.map(({ year, month }) =>
            getMonthlyPrayerTimes(location.latitude, location.longitude, year, month)
        )
    );

    const allDays = monthResults.filter(Boolean).flat();
    if (allDays.length === 0) return null;

    const config = getRamadhanConfig();
    return dates.map((date, index) => ({
        ramadhanDay: index + 1,
        date,
        isToday: isToday(date),
        timings: findDayData(allDays, date),
        tahunHijriah: config.tahunHijriah,
    }));
}

/**
 * Loops iteratively across 30 seconds scanning any discrepancies
 * with day crossings or specific active prayer rollovers
 * injecting highlights locally where fit.
 */
function startAutoRefresh() {
    stopAutoRefresh();

    _refreshInterval = setInterval(() => {
        if (!_container || !_scheduleData) return;

        const currentDateStr = getTodayDateStr();

        if (_lastDateStr !== currentDateStr) {
            _lastDateStr = currentDateStr;

            _scheduleData.forEach(entry => {
                entry.isToday = isToday(entry.date);
            });

            _currentDayIndex = findTodayIndex(_scheduleData);
            renderDayView();
            return;
        }

        const entry = _scheduleData[_currentDayIndex];
        if (!entry || !isToday(entry.date)) return;

        const newActivePrayerKey = getActivePrayerKey(entry.timings);

        if (newActivePrayerKey !== _lastActivePrayerKey) {
            _lastActivePrayerKey = newActivePrayerKey;
            updatePrayerHighlights(newActivePrayerKey);
            updateFeaturedCard();
        }
    }, REFRESH_INTERVAL_MS);
}

/**
 * Disposes active interval timers silently preventing rogue calls.
 */
function stopAutoRefresh() {
    if (_refreshInterval) {
        clearInterval(_refreshInterval);
        _refreshInterval = null;
    }
}

/* --- RENDER METHODS --- */

/**
 * Paints a blank, animated skeleton layout mirroring schedule UI
 * structure, filling visual gaps gracefully while requesting endpoints.
 */
function renderSkeleton() {
    renderScheduleSkeleton(_container);
}

/**
 * Renders prominent fault-tolerances when the API or user configurations
 * fallback against missing location tracking or severed internet sockets.
 *
 * @param {boolean} hasLocation - Deciphers which warning layout to mount.
 */
function renderError(hasLocation) {
    const icon = hasLocation ? 'bx-wifi-off' : 'bx-map-pin';
    const title = hasLocation ? 'Gagal Memuat Jadwal' : 'Lokasi Belum Diatur';
    const desc = hasLocation
        ? 'Tidak dapat memuat jadwal Ramadhan. Periksa koneksi internet Anda dan coba lagi.'
        : 'Atur lokasi terlebih dahulu di Pengaturan untuk melihat jadwal Ramadhan.';

    _container.innerHTML = `
        <div class="schedule-page">
            ${renderEmptyState({
        icon,
        iconVariant: hasLocation ? 'warning' : undefined,
        title,
        description: desc,
        action: hasLocation ? {
            label: 'Coba Lagi',
            icon: 'bx-refresh',
            onclick: 'location.reload()',
        } : undefined,
    })}
        </div>
    `;
}

/**
 * Binds active daily metadata strings encompassing readable Indonesian
 * mappings along with accessible previous and next day controls.
 *
 * @param {Object} entry - Subroutine containing individual mapped dates.
 */
function renderDateNav(entry) {
    const { ramadhanDay, date, isToday: today, timings, tahunHijriah } = entry;

    const weekdayEn = timings?.weekday?.en || date.toLocaleDateString('en', { weekday: 'long' });
    const weekdayId = WEEKDAY_ID[weekdayEn] || weekdayEn;
    const dateFormatted = timings?.gregorian
        ? formatGregorianDate(timings.gregorian)
        : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const todayClass = today ? ' schedule-nav--today' : '';
    const isPrevDisabled = _currentDayIndex <= 0;
    const isNextDisabled = _currentDayIndex >= 29;

    return `
        <div class="schedule-nav">
            <div class="schedule-nav__info">
                <div class="schedule-nav__title-pill" id="btn-calendar-modal" role="button" tabindex="0">
                    <span class="schedule-nav__badge-icon"><i class='bx bxs-calendar'></i></span>
                    <span class="schedule-nav__title">${ramadhanDay} Ramadan ${tahunHijriah}</span>
                </div>
                <span class="schedule-nav__subtitle">${weekdayId}, ${dateFormatted}</span>
            </div>
            <div class="schedule-nav__controls">
                <button class="schedule-nav__today${today ? ' hidden' : ''}" id="schedule-today">
                    <i class='bx bx-reset'></i>
                </button>
                <div class="schedule-nav__arrows">
                    <button class="schedule-nav__btn schedule-nav__btn--prev${isPrevDisabled ? ' disabled' : ''}"
                            id="schedule-prev" ${isPrevDisabled ? 'disabled' : ''}>
                        <i class='bx bxs-chevron-left'></i>
                    </button>
                    <button class="schedule-nav__btn schedule-nav__btn--next${isNextDisabled ? ' disabled' : ''}"
                            id="schedule-next" ${isNextDisabled ? 'disabled' : ''}>
                        <i class='bx bxs-chevron-right'></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Imprints a structural cell formatting each specific sub-prayer time.
 * Overlays an active design class conditionally toggled when true.
 *
 * @param {string} key - Identifying constant representing specific times.
 * @param {Object} timings - Batch timings relative solely to the targeted day.
 * @param {string} activePrayerKey - Checks active node equivalences against current key.
 * @param {boolean} todayView - Overrides styling only targeting strictly "today".
 */
function renderPrayerRow(key, timings, activePrayerKey, todayView) {
    const time = timings ? cleanTime(timings[key]) : '--:--';
    const icon = getPrayerIcon(key);
    const name = getPrayerName(key);
    const isActive = todayView && activePrayerKey === key;

    return `
        <div class="schedule-prayer-row${isActive ? ' schedule-prayer-row--active' : ''}">
            <div class="schedule-prayer-row__icon">${icon}</div>
            <span class="schedule-prayer-row__name">${name}</span>
            <span class="schedule-prayer-row__time">${time}</span>
        </div>
    `;
}

/**
 * Computes and renders the centralized DOM structure dictating the sweeping
 * timeline views combining navbar elements with native widget handlers.
 */
async function renderDayView() {
    if (!_scheduleData || !_scheduleData[_currentDayIndex]) return;

    const entry = _scheduleData[_currentDayIndex];
    const viewingToday = isToday(entry.date);
    const activePrayerKey = viewingToday ? getActivePrayerKey(entry.timings) : null;

    const org = await getSelectedOrg();
    const orgName = getOrgDisplayName(org);

    const prayerRows = SCHEDULE_PRAYERS.map(key =>
        renderPrayerRow(key, entry.timings, activePrayerKey, viewingToday)
    ).join('');

    const featuredHtml = _todayTimings ? renderFeaturedCard(_todayTimings) : '';

    _container.innerHTML = `
        <div class="schedule-page">
            <div class="card card--container schedule-widget-card">
                <div id="schedule-featured-container">${featuredHtml}</div>
                <div class="schedule-actions">
                    ${renderKiblatButton()}
                    ${renderOrgToggle(orgName, 'schedule-org-toggle')}
                </div>
            </div>

            <div class="card card--container schedule-content-card${viewingToday ? ' schedule-content-card--today' : ''}" id="schedule-swipe-area">
                ${renderDateNav(entry)}
                <div class="schedule-swipe-inner" id="schedule-swipe-inner">
                    <div class="schedule-prayers">
                        ${prayerRows}
                    </div>
                </div>
                <div class="schedule-swipe-hint">
                    <i class='bx bx-chevron-left schedule-swipe-hint__arrow schedule-swipe-hint__arrow--left'></i>
                    <span class="schedule-swipe-hint__text">Geser untuk lainnya</span>
                    <i class='bx bx-chevron-right schedule-swipe-hint__arrow schedule-swipe-hint__arrow--right'></i>
                </div>
            </div>
        </div>
    `;

    _lastActivePrayerKey = activePrayerKey;
    _lastDateStr = getTodayDateStr();

    bindEvents();
    startAutoRefresh();
}

/**
 * Performs lightweight DOM updates limited exclusively inward targeting rows
 * bypassing outer unneeded redraws preserving structural fluidity and layout.
 */
function updateSwipeInnerContent() {
    if (!_scheduleData || !_scheduleData[_currentDayIndex]) return;

    const entry = _scheduleData[_currentDayIndex];
    const viewingToday = isToday(entry.date);
    const activePrayerKey = viewingToday ? getActivePrayerKey(entry.timings) : null;

    const inner = document.getElementById('schedule-swipe-inner');
    if (inner) {
        const prayerRows = SCHEDULE_PRAYERS.map(key =>
            renderPrayerRow(key, entry.timings, activePrayerKey, viewingToday)
        ).join('');

        inner.innerHTML = `
            <div class="schedule-prayers">
                ${prayerRows}
            </div>
        `;
    }

    const titleEl = _container.querySelector('.schedule-nav__title');
    const subtitleEl = _container.querySelector('.schedule-nav__subtitle');
    const todayBtn = document.getElementById('schedule-today');
    const prevBtn = document.getElementById('schedule-prev');
    const nextBtn = document.getElementById('schedule-next');

    if (titleEl) {
        titleEl.textContent = `${entry.ramadhanDay} Ramadan ${entry.tahunHijriah}`;
    }
    if (subtitleEl) {
        const weekdayEn = entry.timings?.weekday?.en || entry.date.toLocaleDateString('en', { weekday: 'long' });
        const WEEKDAY_MAP = { Sunday: 'Minggu', Monday: 'Senin', Tuesday: 'Selasa', Wednesday: 'Rabu', Thursday: 'Kamis', Friday: 'Jumat', Saturday: 'Sabtu' };
        const weekdayId = WEEKDAY_MAP[weekdayEn] || weekdayEn;
        const dateFormatted = entry.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        subtitleEl.textContent = `${weekdayId}, ${dateFormatted}`;
    }

    if (todayBtn) {
        todayBtn.classList.toggle('hidden', viewingToday);
    }

    if (prevBtn) {
        const isPrevDisabled = _currentDayIndex <= 0;
        prevBtn.classList.toggle('disabled', isPrevDisabled);
        prevBtn.disabled = isPrevDisabled;
    }
    if (nextBtn) {
        const isNextDisabled = _currentDayIndex >= 29;
        nextBtn.classList.toggle('disabled', isNextDisabled);
        nextBtn.disabled = isNextDisabled;
    }

    const contentCard = document.getElementById('schedule-swipe-area');
    if (contentCard) {
        contentCard.classList.toggle('schedule-content-card--today', viewingToday);
    }

    _lastActivePrayerKey = activePrayerKey;
}

/**
 * Mutates specific indicator classes bridging newly acquired timeline nodes.
 * Used internally syncing interval changes silently bridging state mismatches.
 *
 * @param {string} activePrayerKey - Determines node selection parameters.
 */
function updatePrayerHighlights(activePrayerKey) {
    const rows = _container.querySelectorAll('.schedule-prayer-row');
    rows.forEach((row, i) => {
        const key = SCHEDULE_PRAYERS[i];
        if (key === activePrayerKey) {
            row.classList.add('schedule-prayer-row--active');
        } else {
            row.classList.remove('schedule-prayer-row--active');
        }
    });
}

/**
 * Propagates fresh card details natively inside the schedule wrapper
 * overwriting existing structural logic locally without full teardowns.
 */
function updateFeaturedCard() {
    const container = document.getElementById('schedule-featured-container');
    if (container && _todayTimings) {
        container.innerHTML = renderFeaturedCard(_todayTimings);
    }
}

/* --- EVENTS & HANDLERS --- */

/**
 * Establishes centralized interaction layers linking native swipe loops
 * to core navigation patterns alongside dynamic organization modals.
 */
function bindEvents() {
    document.getElementById('schedule-prev')?.addEventListener('click', () => {
        if (_currentDayIndex > 0) {
            navigateWithAnimation('right');
        }
    });

    document.getElementById('schedule-next')?.addEventListener('click', () => {
        if (_currentDayIndex < 29) {
            navigateWithAnimation('left');
        }
    });

    document.getElementById('schedule-today')?.addEventListener('click', () => {
        const todayIdx = findTodayIndex(_scheduleData);
        if (_currentDayIndex !== todayIdx) {
            const dir = todayIdx > _currentDayIndex ? 'left' : 'right';
            _currentDayIndex = todayIdx;
            animateSlide(dir);
        }
    });

    document.getElementById('schedule-org-toggle')?.addEventListener('click', async () => {
        await handleOrgToggle('schedule-org-toggle-label', async () => {
            const location = await getSavedLocation();
            if (location) {
                _scheduleData = await fetchScheduleData(location);
                _currentDayIndex = findTodayIndex(_scheduleData);
                renderDayView();
            }
        });
    });

    document.getElementById('btn-kiblat')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-tab="compass"]')?.click();
    });

    document.getElementById('btn-calendar-modal')?.addEventListener('click', () => {
        showCalendarModal({
            scheduleData: _scheduleData,
            currentIndex: _currentDayIndex,
            onSelectDay: (newIndex) => {
                if (newIndex === _currentDayIndex) return;
                const dir = newIndex > _currentDayIndex ? 'left' : 'right';
                _currentDayIndex = newIndex;
                animateSlide(dir);
            },
        });
    });

    bindSwipeEvents();
}

/**
 * Bootstraps listener arrays linking native screen touches mapping gesture layouts.
 */
function bindSwipeEvents() {
    const swipeArea = document.getElementById('schedule-swipe-area');
    if (!swipeArea) return;

    swipeArea.addEventListener('touchstart', onTouchStart, { passive: true });
    swipeArea.addEventListener('touchmove', onTouchMove, { passive: false });
    swipeArea.addEventListener('touchend', onTouchEnd, { passive: true });
    swipeArea.addEventListener('touchcancel', resetGesture, { passive: true });

    swipeArea.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    swipeArea.addEventListener('wheel', onWheel, { passive: false });
}

function handleGestureStart(clientX, clientY) {
    _startX = clientX;
    _startY = clientY;
    _isSwiping = false;
    _swipeLocked = false;
}

function handleGestureMove(clientX, clientY, e) {
    if (!_startX) return;

    const dx = Math.abs(clientX - _startX);
    const dy = Math.abs(clientY - _startY);

    if (!_swipeLocked && (dx > 10 || dy > 10)) {
        _swipeLocked = true;
        _isSwiping = dx > dy;
    }

    if (_isSwiping && e.cancelable) {
        e.preventDefault();
    }
}

function handleGestureEnd(clientX) {
    if (!_startX || !_isSwiping) { resetGesture(); return; }

    const dx = clientX - _startX;
    resetGesture();

    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    if (dx < 0 && _currentDayIndex < 29) {
        navigateWithAnimation('left');
    } else if (dx > 0 && _currentDayIndex > 0) {
        navigateWithAnimation('right');
    }
}

function onTouchStart(e) {
    if (!e.touches || e.touches.length === 0) return;
    handleGestureStart(e.touches[0].clientX, e.touches[0].clientY);
}
function onTouchMove(e) {
    if (!e.touches || e.touches.length === 0) return;
    handleGestureMove(e.touches[0].clientX, e.touches[0].clientY, e);
}
function onTouchEnd(e) {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    handleGestureEnd(e.changedTouches[0].clientX);
}

function onMouseDown(e) {
    if (e.button !== 0) return;
    _isMouseDown = true;
    handleGestureStart(e.clientX, e.clientY);
}
function onMouseMove(e) {
    if (!_isMouseDown) return;
    handleGestureMove(e.clientX, e.clientY, e);
}
function onMouseUp(e) {
    if (!_isMouseDown) return;
    _isMouseDown = false;
    handleGestureEnd(e.clientX);
}

/**
 * Normalizes touch pad horizontal scroll events linking them directly to screen swipes.
 */
function onWheel(e) {
    if (_wheelScrollCooldown) return;

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
        if (e.cancelable) e.preventDefault();

        if (e.deltaX > 0 && _currentDayIndex < 29) {
            navigateWithAnimation('left');
            triggerWheelCooldown();
        } else if (e.deltaX < 0 && _currentDayIndex > 0) {
            navigateWithAnimation('right');
            triggerWheelCooldown();
        }
    }
}

function triggerWheelCooldown() {
    _wheelScrollCooldown = true;
    setTimeout(() => { _wheelScrollCooldown = false; }, 600);
}

function resetGesture() {
    _startX = 0;
    _startY = 0;
    _isSwiping = false;
    _swipeLocked = false;
    _isMouseDown = false;
}

/**
 * Injects fluid motion transition steps ensuring a flawless
 * left/right shift resolving boundaries automatically.
 *
 * @param {string} direction - Navigational vector mapping next steps.
 */
function navigateWithAnimation(direction) {
    if (direction === 'left' && _currentDayIndex < 29) {
        _currentDayIndex++;
    } else if (direction === 'right' && _currentDayIndex > 0) {
        _currentDayIndex--;
    } else {
        return;
    }

    if (_animPhase === 'out' && _animDirection === direction) {
        return;
    }

    animateSlide(direction);
}

/**
 * Composes a two-tiered phase transition (slide-out/in) chaining DOM 
 * listeners seamlessly hiding rendering delays on heavy interfaces.
 *
 * @param {string} direction - Denotes either left or right slide logic maps.
 */
function animateSlide(direction) {
    const inner = document.getElementById('schedule-swipe-inner');
    if (!inner) { renderDayView(); return; }

    const currentAnimId = ++_animId;
    _animPhase = 'out';
    _animDirection = direction;

    inner.classList.remove('sliding-out-left', 'sliding-out-right', 'sliding-in-left', 'sliding-in-right');
    void inner.offsetWidth;

    const outClass = direction === 'left' ? 'sliding-out-left' : 'sliding-out-right';
    inner.classList.add(outClass);

    inner.addEventListener('animationend', function onOut(e) {
        if (e.target !== inner) return;
        inner.removeEventListener('animationend', onOut);

        if (currentAnimId !== _animId) return;

        inner.classList.remove(outClass);

        updateSwipeInnerContent();

        _animPhase = 'in';
        const inClass = direction === 'left' ? 'sliding-in-left' : 'sliding-in-right';
        inner.classList.add(inClass);

        inner.addEventListener('animationend', function onIn(e) {
            if (e.target !== inner) return;
            inner.removeEventListener('animationend', onIn);

            if (currentAnimId !== _animId) return;

            inner.classList.remove(inClass);
            _animPhase = 'idle';
            _animDirection = null;
        });
    });
}

/* --- UTILITIES --- */

/**
 * Trims unneeded payload timezone wrappers producing clean strings.
 */
function cleanTime(timeStr) {
    return timeStr ? timeStr.replace(/\s*\(.*\)/, '') : '--:--';
}

function getPrayerIcon(key) {
    return PRAYER_LIST.find(p => p.key === key)?.icon || '';
}

function getPrayerName(key) {
    return PRAYER_LIST.find(p => p.key === key)?.name || key;
}

function formatGregorianDate(greg) {
    const day = parseInt(greg.day, 10);
    const monthName = MONTH_ID[greg.month.number] || greg.month.en;
    return `${day} ${monthName} ${greg.year}`;
}

/**
 * Confirms whether the passed context parameter hits current true date bounds.
 */
function isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

/**
 * Pulls explicitly derived currently active internal identifiers fetching live.
 */
function getActivePrayerKey(timings) {
    if (!timings) return null;
    const prayerState = getCurrentPrayer(timings);
    return prayerState.current?.key || null;
}

function findTodayIndex(schedule) {
    if (!schedule) return 0;
    const idx = schedule.findIndex(entry => isToday(entry.date));
    return idx >= 0 ? idx : 0;
}

function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}
