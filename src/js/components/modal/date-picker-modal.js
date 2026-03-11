/**
 * Date Picker Modal Component
 * Replaces native <input type="date"> with a consistent, native-feeling UI.
 * - Monday-first weekday grid (matches calendar-modal)
 * - data-weekday attributes for Friday/Sunday column coloring
 * - Swipe/drag/wheel gesture for month navigation (touch + mouse + trackpad)
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { WEEKDAY_HEADERS_MON_FIRST, MONTH_NAMES, formatDateToYYYYMMDD } from '../../utils/datetime.js';

/* ── Constants ── */

const SWIPE_THRESHOLD_PX = 50;
const WHEEL_COOLDOWN_MS  = 600;

/* ── Module State ── */

let _overlayEl    = null;
let _viewDate     = null; // Month currently displayed (always day 1)
let _selectedDate = null; // Date the user has selected
let _onSelect     = null; // External callback

let _minDate      = null; // Optional minimum selectable Date
let _maxDate      = null; // Optional maximum selectable Date

let _animPhase     = 'idle';
let _animDirection = null;
let _animId        = 0;

/* ── Helpers ── */

/**
 * Parse a YYYY-MM-DD string into a local-time Date (avoids UTC off-by-one).
 * @param {string} str - YYYY-MM-DD
 * @returns {Date}
 */
function parseDateLocal(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Returns the Monday-based weekday index (Mon=0 … Sun=6) for a given Date.
 * @param {Date} date
 * @returns {number}
 */
function getMondayBasedDay(date) {
    return (date.getDay() + 6) % 7;
}

/**
 * Navigate the view by ±1 month with slide animation.
 * Always snaps to the 1st of the target month.
 * @param {number} delta - +1 or -1
 */
function shiftMonth(delta) {
    const direction = delta > 0 ? 'left' : 'right'; // next month slides from right to left

    if (_animPhase === 'out' && _animDirection === direction) {
        return; // Already animating this direction
    }

    animateSlide(direction, () => {
        _viewDate = new Date(_viewDate.getFullYear(), _viewDate.getMonth() + delta, 1);
        renderCalendar();
    });
}

/**
 * Orchestrates a two-phase CSS animation (slide-out -> callback -> slide-in).
 * @param {string} direction - 'left' or 'right'
 * @param {Function} onMiddle - Called when out-animation finishes (to update DOM)
 */
function animateSlide(direction, onMiddle) {
    if (!_overlayEl) return;
    const inner = _overlayEl.querySelector('#dp-days');
    if (!inner) {
        onMiddle();
        return;
    }

    const currentAnimId = ++_animId;
    _animPhase = 'out';
    _animDirection = direction;

    inner.classList.remove('sliding-out-left', 'sliding-out-right', 'sliding-in-left', 'sliding-in-right');
    // Force reflow
    void inner.offsetWidth;

    const outClass = direction === 'left' ? 'sliding-out-left' : 'sliding-out-right';
    inner.classList.add(outClass);

    inner.addEventListener('animationend', function onOut(e) {
        if (e.target !== inner) return;
        inner.removeEventListener('animationend', onOut);

        if (currentAnimId !== _animId) return;

        inner.classList.remove(outClass);
        
        // Execute the DOM update
        onMiddle();

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

/* ── Public API ── */

/**
 * Show the date picker modal.
 * @param {object}          options
 * @param {string|Date}    [options.initialDate] - Pre-selected date (YYYY-MM-DD string or Date)
 * @param {Function}        options.onSelect     - Callback(dateString) on selection
 * @param {string|Date}    [options.minDate]    - Minimum selectable date
 * @param {string|Date}    [options.maxDate]    - Maximum selectable date
 */
export function showDatePickerModal({ initialDate, onSelect, minDate, maxDate }) {
    if (_overlayEl) {
        unregisterModalDismiss(hideDatePickerModal);
        removeModal();
    }

    _onSelect = onSelect;

    // Parse initial date — always use local-time to avoid UTC timezone shift
    if (initialDate) {
        const parsed = typeof initialDate === 'string'
            ? parseDateLocal(initialDate)
            : new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());

        if (!isNaN(parsed.getTime())) {
            _selectedDate = parsed;
            _viewDate     = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
        } else {
            _selectedDate = null;
            _viewDate     = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        }
    } else {
        _selectedDate = null;
        _viewDate     = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }

    // Parse constraint dates
    if (minDate) {
        _minDate = typeof minDate === 'string' ? parseDateLocal(minDate) : new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    } else {
        _minDate = null;
    }

    if (maxDate) {
        _maxDate = typeof maxDate === 'string' ? parseDateLocal(maxDate) : new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
    } else {
        _maxDate = null;
    }

    // If initial view date is before minDate, snap view to minDate's month
    if (_minDate && _viewDate < new Date(_minDate.getFullYear(), _minDate.getMonth(), 1)) {
        _viewDate = new Date(_minDate.getFullYear(), _minDate.getMonth(), 1);
    }

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Bind swipe AFTER appending to DOM so the element is live in the document
    bindSwipeGesture(_overlayEl.querySelector('.date-picker-sheet'));

    registerModalDismiss(hideDatePickerModal);
    renderCalendar();

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));
}

/**
 * Hide the date picker modal with exit animation, then remove from DOM.
 */
export function hideDatePickerModal() {
    if (!_overlayEl) return;
    unregisterModalDismiss(hideDatePickerModal);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.date-picker-sheet');
    const target = sheet ?? _overlayEl;
    target.addEventListener('transitionend', removeModal, { once: true });
    setTimeout(removeModal, 450);
}

/* ── Internal Helpers ── */

function removeModal() {
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    _onSelect = null;
    _minDate = null;
    _maxDate = null;
    _animPhase = 'idle';
    _animId++;    
}

/* ── Swipe Gesture (self-contained, works on element reference) ── */

/**
 * Attach touch + mouse-drag + wheel horizontal swipe to a live DOM element.
 * Self-contained — does not depend on schedule-swipe singleton.
 * @param {HTMLElement} el
 */
function bindSwipeGesture(el) {
    if (!el) return;

    let startX      = 0;
    let startY      = 0;
    let isSwiping   = false;
    let axisLocked  = false;
    let isMouseDown = false;
    let wheelBusy   = false;

    // ── Common gesture core ──

    function onStart(clientX, clientY) {
        startX     = clientX;
        startY     = clientY;
        isSwiping  = false;
        axisLocked = false;
    }

    function onMove(clientX, clientY, e) {
        if (!startX) return;
        const dx = Math.abs(clientX - startX);
        const dy = Math.abs(clientY - startY);

        if (!axisLocked && (dx > 8 || dy > 8)) {
            axisLocked = true;
            isSwiping  = dx > dy; // lock to horizontal only if dx dominates
        }

        // Prevent vertical scroll from also sliding the calendar
        if (isSwiping && e?.cancelable) e.preventDefault();
    }

    function onEnd(clientX) {
        if (!startX || !isSwiping) { startX = 0; return; }
        const delta = clientX - startX;
        startX = 0;
        if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
        impact('light');
        shiftMonth(delta > 0 ? -1 : +1); // right → prev, left → next
    }

    // ── Touch ──
    el.addEventListener('touchstart', (e) => {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        onMove(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
        onEnd(e.changedTouches[0].clientX);
    }, { passive: true });

    el.addEventListener('touchcancel', () => { startX = 0; }, { passive: true });

    // ── Mouse drag ──
    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isMouseDown = true;
        onStart(e.clientX, e.clientY);
    });

    // mousemove / mouseup on window so drag works even if cursor leaves the card
    window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        onMove(e.clientX, e.clientY, null); // mouse move can't preventDefault scroll
    });

    window.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        onEnd(e.clientX);
    });

    // ── Mouse wheel / trackpad horizontal scroll ──
    el.addEventListener('wheel', (e) => {
        if (wheelBusy) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
            if (e.cancelable) e.preventDefault();
            impact('light');
            shiftMonth(e.deltaX > 0 ? +1 : -1);
            wheelBusy = true;
            setTimeout(() => { wheelBusy = false; }, WHEEL_COOLDOWN_MS);
        }
    }, { passive: false });
}

/* ── DOM & Rendering ── */

function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'date-picker-overlay';

    overlay.innerHTML = `
        <div class="date-picker-sheet">
            <div class="date-picker-header">
                <button class="date-picker-nav-btn" id="dp-prev" aria-label="Bulan sebelumnya">
                    <i class='bx bx-chevron-left'></i>
                </button>
                <div class="date-picker-title" id="dp-title"></div>
                <button class="date-picker-nav-btn" id="dp-next" aria-label="Bulan berikutnya">
                    <i class='bx bx-chevron-right'></i>
                </button>
            </div>
            <div class="date-picker-grid">
                <div class="date-picker-weekdays">
                    ${WEEKDAY_HEADERS_MON_FIRST.map((w, i) =>
                        `<div data-weekday="${i}">${w}</div>`
                    ).join('')}
                </div>
                <div class="date-picker-days" id="dp-days"></div>
            </div>
            <div class="date-picker-footer">
                <div class="date-picker-hint">
                    <i class='bx bx-swipe'></i>
                    <span>Geser untuk lainnya</span>
                </div>
                <button class="date-picker-today-btn" id="dp-today">Hari ini</button>
            </div>
        </div>
    `;

    // ── Bind: Click outside to dismiss ──
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideDatePickerModal();
    });

    // ── Bind: Navigation buttons ──
    overlay.querySelector('#dp-prev').addEventListener('click', () => {
        impact('light');
        shiftMonth(-1);
    });
    overlay.querySelector('#dp-next').addEventListener('click', () => {
        impact('light');
        shiftMonth(+1);
    });

    // ── Bind: Today button ──
    overlay.querySelector('#dp-today').addEventListener('click', () => {
        impact('medium');
        const todayStr = formatDateToYYYYMMDD(new Date());
        _selectedDate  = new Date();
        renderCalendar(); // immediate visual feedback

        const cb = _onSelect;
        setTimeout(() => {
            hideDatePickerModal();
            cb?.(todayStr);
        }, 100);
    });

    return overlay;
}

/**
 * (Re-)render the calendar grid for the current _viewDate month.
 */
function renderCalendar() {
    if (!_overlayEl) return;

    const titleEl = _overlayEl.querySelector('#dp-title');
    const daysEl  = _overlayEl.querySelector('#dp-days');
    if (!titleEl || !daysEl) return;

    const year  = _viewDate.getFullYear();
    const month = _viewDate.getMonth();

    // ── Title ──
    titleEl.textContent = `${MONTH_NAMES[month]} ${year}`;

    // ── Grid cells ──
    const startOffset = getMondayBasedDay(new Date(year, month, 1));
    const today       = new Date();

    let html = '';

    // Generate exactly 42 cells (6 rows) — leading/trailing dates from adj. months
    for (let i = 0; i < 42; i++) {
        const cellDate       = new Date(year, month, 1 - startOffset + i);
        const isCurrentMonth = cellDate.getMonth() === month;
        const weekday        = getMondayBasedDay(cellDate);
        const isToday        = cellDate.getDate()     === today.getDate()
                            && cellDate.getMonth()    === today.getMonth()
                            && cellDate.getFullYear() === today.getFullYear();
        const isSelected     = _selectedDate
                            && cellDate.getDate()     === _selectedDate.getDate()
                            && cellDate.getMonth()    === _selectedDate.getMonth()
                            && cellDate.getFullYear() === _selectedDate.getFullYear();
        
        const isDisabled     = (_minDate && cellDate < _minDate) || (_maxDate && cellDate > _maxDate);

        const classes = [
            'date-picker-cell',
            isDisabled      ? 'date-picker-cell--disabled' : '',
            !isCurrentMonth ? 'date-picker-cell--muted'    : '',
            isToday         ? 'date-picker-cell--today'    : '',
            isSelected      ? 'date-picker-cell--selected' : '',
        ].filter(Boolean).join(' ');

        html += `<div class="${classes}" data-date="${formatDateToYYYYMMDD(cellDate)}" data-weekday="${weekday}">${cellDate.getDate()}</div>`;
    }

    daysEl.innerHTML = html;

    // ── Bind: Day cell clicks ──
    daysEl.querySelectorAll('.date-picker-cell.date-picker-cell--disabled').forEach(cell => {
        // Stop clicks on disabled cells
        cell.addEventListener('click', (e) => e.stopPropagation());
    });

    daysEl.querySelectorAll('.date-picker-cell[data-date]:not(.date-picker-cell--disabled)').forEach(cell => {
        cell.addEventListener('click', () => {
            impact('medium');

            const dateStr = cell.dataset.date;
            _selectedDate = parseDateLocal(dateStr);
            renderCalendar(); // Immediate visual feedback

            // Capture callback reference before the modal begins closing
            const cb = _onSelect;
            setTimeout(() => {
                hideDatePickerModal();
                cb?.(dateStr);
            }, 100);
        });
    });
}
