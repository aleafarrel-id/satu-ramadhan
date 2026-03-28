/**
 * Custom Mobile-optimized Pull to Refresh
 * Provides smooth, native-feeling pull-to-refresh without the stuttering
 * common to generic JavaScript pull-to-refresh libraries.
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

    let ptrEl = document.createElement('div');
    ptrEl.className = `custom-ptr ptr-${theme}`;

    // Cache internal markup up-front to prevent DOM regeneration
    ptrEl.innerHTML = `
        <div class="custom-ptr-icon">${iconPull}</div>
        <div class="custom-ptr-text">${textPull}</div>
    `;
    scroller.insertBefore(ptrEl, scroller.firstChild);

    // Cache DOM Nodes (Zero layout thrashing during touch moves)
    const _iconEl = ptrEl.querySelector('.custom-ptr-icon');
    const _textEl = ptrEl.querySelector('.custom-ptr-text');

    let startY = 0;
    let currentY = 0;
    let visualDy = 0;

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
     * Physics engine: Premium logarithmic friction (Rubber-band effect)
     * Limit maximum stretch visually while allowing infinite physical drag.
     */
    function calculateTension(distance) {
        if (distance <= 0) return 0;
        const maxStretch = threshold * 1.5;
        return maxStretch * Math.atan(distance / (threshold * 3));
    }

    /**
     * UI Render Loop (requestAnimationFrame)
     * Decoupled from sensory (touch) events to guarantee 60fps
     */
    function _render() {
        if (state === STATE.PULLING || state === STATE.READY) {
            ptrEl.style.height = `${visualDy}px`;

            // Minimal state transitions for DOM writes
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
        if (e.target.closest('.qibla-map-card') || e.target.closest('.leaflet-container')) return;

        startY = e.touches[0].clientY;
        isTouchDown = true;
        state = STATE.PULLING;
        visualDy = 0;

        ptrEl.style.transition = 'none';

        // Boot up render loop
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = requestAnimationFrame(_render);
    }

    function _onTouchMove(e) {
        if (!isTouchDown || state === STATE.REFRESHING || state === STATE.RESTORING) return;

        currentY = e.touches[0].clientY;
        const physicalDy = currentY - startY;

        if (physicalDy > 0 && scroller.scrollTop <= 5) {
            if (e.cancelable) e.preventDefault();
            visualDy = calculateTension(physicalDy);
        } else {
            visualDy = 0;
            // Snaps back immediately if scrolled up while pulling
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

            // Apply smooth transition locks
            ptrEl.style.transition = 'height 0.35s cubic-bezier(0.19, 1, 0.22, 1)';
            ptrEl.style.height = '64px';

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
                    console.error('[PTR] Refresh error:', err);
                }
            }

            // Artificial visual settle phase
            setTimeout(reset, 500);

        } else if (state === STATE.PULLING || state === STATE.READY) {
            // Cancelled pull
            reset();
        }
    }

    function reset() {
        if (state === STATE.IDLE || state === STATE.RESTORING) return;
        state = STATE.RESTORING;

        ptrEl.style.transition = 'height 0.3s cubic-bezier(0.19, 1, 0.22, 1)';
        ptrEl.style.height = '0px';

        if (_iconEl) {
            // Restore standard CSS transition (empty string clears JS inline override)
            _iconEl.style.transition = '';
            _iconEl.style.transform = 'rotate(0deg)';
        }

        setTimeout(() => {
            state = STATE.IDLE;
            visualDy = 0;

            // Clean up loading state
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
    };
}
