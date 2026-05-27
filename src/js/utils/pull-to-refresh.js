/**
 * Custom Mobile-optimized Pull to Refresh
 * Provides smooth, native-feeling pull-to-refresh without the stuttering
 * common to generic JavaScript pull-to-refresh libraries.
 *
 * GPU-accelerated via CSS Custom Properties (--ptr-y). No DOM restructuring
 * or element wrapping — layout hierarchy is fully preserved.
 *
 * @param {Object} options
 * @param {string|HTMLElement} options.scrollElement - Element or selector to attach PTR to.
 * @param {Function} options.onRefresh - Async callback called when refresh is triggered.
 * @param {number} [options.threshold=80] - Pull distance in px to trigger refresh.
 * @param {boolean} [options.disableOnQuran=false] - Suppress PTR while Al-Quran page is active.
 * @param {Function} [options.checkDisabled] - Dynamic callback to block PTR (e.g., when reading Mushaf).
 * @param {string} [options.theme='light'] - 'light' or 'dark' theme for the indicator.
 * @returns {Function} cleanup - Call to remove all event listeners and the PTR element.
 */
import { logError } from './error-boundary.js';

export function initPullToRefresh(options) {
    const {
        scrollElement,
        onRefresh,
        threshold = 80,
        disableOnQuran = false,
        checkDisabled = null,
        theme = 'light',
        textPull = 'Tarik untuk memuat ulang',
        textRelease = 'Lepaskan untuk memuat ulang',
        textRefreshing = 'Memuat ulang',
        iconPull = "<i class='bx bx-down-arrow-alt'></i>",
        iconRefreshing = "<i class='bx bx-loader-alt'></i>"
    } = options;

    const scroller = typeof scrollElement === 'string' ? document.querySelector(scrollElement) : scrollElement;
    if (!scroller) return () => { };

    // Spinner element (absolute overlay, no DOM restructuring) 
    let ptrEl = document.createElement('div');
    ptrEl.className = `custom-ptr ptr-${theme}`;
    ptrEl.innerHTML = `
        <div class="custom-ptr-icon">${iconPull}</div>
        <div class="custom-ptr-text">${textPull}</div>
    `;
    scroller.insertBefore(ptrEl, scroller.firstChild);

    // Cache DOM Nodes (Zero layout thrashing during touch moves)
    const _iconEl = ptrEl.querySelector('.custom-ptr-icon');
    const _textEl = ptrEl.querySelector('.custom-ptr-text');

    let startY = 0;
    let startX = 0;
    let currentY = 0;
    let visualDy = 0;
    let isHorizontalGesture = false;

    // State Machine Architecture
    const STATE = {
        IDLE: 'idle',
        PULLING: 'pulling',
        READY: 'ready',
        REFRESHING: 'refreshing',
        RESTORING: 'restoring'
    };

    let state = STATE.IDLE;
    let animFrameId = null;
    let isTouchDown = false;

    // CSS Variable Helpers (GPU-composited, zero-reflow) 

    /**
     * Writes `--ptr-y` CSS Custom Property on the scroller and toggles the
     * `ptr-animating` class so the CSS rule applies GPU transforms to direct
     * children that are NOT the spinner and NOT the full-screen Quran modal.
     * No element is wrapped or reparented — layout hierarchy fully preserved.
     */
    function _setOffset(px) {
        scroller.style.setProperty('--ptr-y', `${px}px`);
        if (px > 0) {
            scroller.classList.add('ptr-animating');
        } else {
            scroller.classList.remove('ptr-animating');
        }
    }

    /** Enables CSS transition on animated children for smooth settle. */
    function _enableTransition() {
        scroller.classList.add('ptr-transition');
    }

    /** Strips all PTR-related state completely from the scroller element. */
    function _disableTransition() {
        scroller.classList.remove('ptr-transition', 'ptr-animating');
        scroller.style.removeProperty('--ptr-y');
    }

    /**
     * Ensures the PTR indicator remains at the top of the DOM layer,
     * re-inserting it if a component wiped the container (e.g., via innerHTML).
     */
    function _ensurePtrInDom() {
        if (!ptrEl.parentNode || ptrEl.parentNode !== scroller) {
            scroller.insertBefore(ptrEl, scroller.firstChild);
        }
    }

    /**
     * Physics engine: Premium logarithmic friction (Rubber-band effect).
     * Limits maximum stretch visually while allowing infinite physical drag.
     */
    function calculateTension(distance) {
        if (distance <= 0) return 0;
        const maxStretch = threshold * 1.5;
        return maxStretch * Math.atan(distance / (threshold * 3));
    }

    /**
     * UI Render Loop (requestAnimationFrame).
     * Decoupled from touch events to guarantee 60fps.
     * Pure CSS Variable approach — zero DOM mutation, zero reflow, GPU composite.
     */
    function _render() {
        if (state === STATE.PULLING || state === STATE.READY) {
            // Shift children down via CSS var — GPU composited, no reflow
            _setOffset(visualDy);

            // Float spinner at half the gap so it centres naturally in the revealed space
            ptrEl.style.transform = `translateY(${visualDy / 2}px)`;
            ptrEl.style.opacity = visualDy > 10 ? '1' : '0';

            // Minimal state transitions (only on threshold crossing)
            if (visualDy > threshold && state !== STATE.READY) {
                state = STATE.READY;
                if (_iconEl) _iconEl.style.transform = 'rotate(180deg)';
                if (_textEl) _textEl.textContent = textRelease;
            } else if (visualDy <= threshold && visualDy > 0 && state !== STATE.PULLING) {
                state = STATE.PULLING;
                if (_iconEl) _iconEl.style.transform = 'rotate(0deg)';
                if (_textEl) _textEl.textContent = textPull;
            }
        }

        if (isTouchDown && (state === STATE.PULLING || state === STATE.READY)) {
            animFrameId = requestAnimationFrame(_render);
        }
    }

    function _onTouchStart(e) {
        if (state !== STATE.IDLE || scroller.scrollTop > 5) return;

        _ensurePtrInDom();

        // Dynamic suppression (e.g., Mushaf mode)
        if (typeof checkDisabled === 'function' && checkDisabled()) return;

        // Avoid gesture collision with global app layer
        if (disableOnQuran) {
            const quranPage = document.getElementById('page-quran');
            if (quranPage && quranPage.classList.contains('active')) return;
        }

        // Suppress on nested touch-sensitive components (Maps/Carousels)
        if (e.target.closest('.qibla-map-card') || e.target.closest('.leaflet-container') || e.target.closest('.top-carousel')) return;

        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        isTouchDown = true;
        isHorizontalGesture = false;
        state = STATE.PULLING;
        visualDy = 0;

        // Strip transition during active drag for instant finger-tracking response
        _disableTransition();
        ptrEl.style.transition = 'none';

        // Boot up render loop
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = requestAnimationFrame(_render);
    }

    function _onTouchMove(e) {
        if (!isTouchDown || state === STATE.REFRESHING || state === STATE.RESTORING) return;

        currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const physicalDy = currentY - startY;
        const physicalDx = currentX - startX;

        // Deteksi intent gesture: jika lebih horizontal dari vertikal, lepaskan ke browser
        // Threshold 5px mencegah false-positive dari micro-jitter saat tap
        if (!isHorizontalGesture && Math.abs(physicalDx) > Math.abs(physicalDy) && Math.abs(physicalDx) > 5) {
            isHorizontalGesture = true;
        }

        if (isHorizontalGesture) {
            visualDy = 0;
            return;
        }

        if (physicalDy > 0 && scroller.scrollTop <= 5) {
            if (e.cancelable) e.preventDefault();
            visualDy = calculateTension(physicalDy);
        } else {
            visualDy = 0;
        }
    }

    async function _onTouchEnd() {
        if (!isTouchDown) return;
        isTouchDown = false;

        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }

        if (state === STATE.READY && scroller.scrollTop <= 5) {
            state = STATE.REFRESHING;

            // Settle content at the "loading" resting offset with smooth ease
            _enableTransition();
            _setOffset(64);

            ptrEl.style.transition = 'transform 0.35s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.2s';
            ptrEl.style.transform = 'translateY(32px)';
            ptrEl.style.opacity = '1';

            // Swap to loading presentation
            if (_iconEl) {
                // Snap instantly to drop backward rotation artifact
                _iconEl.style.transition = 'none';
                _iconEl.style.transform = 'rotate(0deg)';
                _iconEl.innerHTML = iconRefreshing;

                // Force a DOM reflow to ensure the 'none' transition is applied purely
                void _iconEl.offsetHeight;

                _iconEl.classList.add('spinning');
            }
            if (_textEl) _textEl.textContent = textRefreshing;

            // Execute application payload
            if (onRefresh) {
                try {
                    await onRefresh();
                } catch (err) {
                    logError('[PTR]', err);
                }
            }

            // Artificial visual settle phase
            setTimeout(reset, 500);

        } else if (state === STATE.PULLING || state === STATE.READY) {
            // Cancelled pull — snap back instantly
            reset();
        }
    }

    function reset() {
        if (state === STATE.IDLE || state === STATE.RESTORING) return;
        state = STATE.RESTORING;

        // Animate children back to resting position via CSS var
        _enableTransition();
        _setOffset(0);

        ptrEl.style.transition = 'transform 0.3s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.2s';
        ptrEl.style.transform = 'translateY(0px)';
        ptrEl.style.opacity = '0';

        if (_iconEl) {
            _iconEl.style.transition = '';
            _iconEl.style.transform = 'rotate(0deg)';
        }

        setTimeout(() => {
            state = STATE.IDLE;
            visualDy = 0;

            // Fully remove animation state from scroller
            _disableTransition();
            ptrEl.style.transition = '';

            // Restore loading elements to initial pull state
            if (_iconEl) {
                _iconEl.classList.remove('spinning');
                _iconEl.innerHTML = iconPull;
            }
            if (_textEl) _textEl.textContent = textPull;
        }, 300);
    }

    scroller.addEventListener('touchstart', _onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', _onTouchMove, { passive: false });
    scroller.addEventListener('touchend', _onTouchEnd);
    scroller.addEventListener('touchcancel', _onTouchEnd);

    return function cleanup() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        scroller.removeEventListener('touchstart', _onTouchStart);
        scroller.removeEventListener('touchmove', _onTouchMove);
        scroller.removeEventListener('touchend', _onTouchEnd);
        scroller.removeEventListener('touchcancel', _onTouchEnd);
        if (ptrEl && ptrEl.parentNode) ptrEl.parentNode.removeChild(ptrEl);
        _disableTransition();
    };
}
