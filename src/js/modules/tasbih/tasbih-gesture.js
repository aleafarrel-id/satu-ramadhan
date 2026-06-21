/**
 * Tasbih Gesture Module
 * Listens for horizontal swipe-right events on the Home page to open the Tasbih compartment.
 * Attached at the document level to avoid being blocked by overflow:hidden on #app-content.
 */

export function initTasbihGesture({ onOpen, getCurrentPage }) {
    const SWIPE_THRESHOLD_X = 60;  // Minimum horizontal distance to trigger
    const SWIPE_MAX_Y = 55;        // Maximum vertical drift (prevents triggering during scroll)

    let _startX = 0;
    let _startY = 0;
    let _isTracking = false;

    function _onTouchStart(e) {
        // Only active on home page
        if (getCurrentPage() !== 'home') return;

        // Prevent gesture collision with the top carousel
        const carousel = document.getElementById('home-top-carousel');
        if (carousel && e.target.closest('#home-top-carousel')) {
            if (carousel.scrollLeft > 5) {
                return;
            }
        }

        // Prevent gesture collision with maps or other interactive touch areas
        if (e.target.closest('.qibla-map-card') || e.target.closest('.leaflet-container')) {
            return;
        }

        const touch = e.changedTouches[0];
        _startX = touch.clientX;
        _startY = touch.clientY;
        _isTracking = true;
    }

    function _onTouchEnd(e) {
        if (!_isTracking) return;
        _isTracking = false;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - _startX;
        const deltaY = Math.abs(touch.clientY - _startY);

        if (deltaX > SWIPE_THRESHOLD_X && deltaY < SWIPE_MAX_Y) {
            onOpen();
        }
    }

    function _onTouchCancel() {
        _isTracking = false;
    }

    document.addEventListener('touchstart', _onTouchStart, { passive: true });
    document.addEventListener('touchend', _onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', _onTouchCancel, { passive: true });
}
