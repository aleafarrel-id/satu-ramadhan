/**
 * Schedule Swipe Handler
 * Reusable gesture recognition for horizontal navigation.
 */

const SWIPE_THRESHOLD = 50;
const WHEEL_COOLDOWN_MS = 600;

let _startX = 0;
let _startY = 0;
let _isSwiping = false;
let _swipeLocked = false;
let _isMouseDown = false;
let _wheelScrollCooldown = false;

let _swipeArea = null;
let _onSwipe = null;
let _handlers = null;

/**
 * Bind all swipe/gesture event listeners on a target element.
 * @param {string} elementId - DOM element ID to attach listeners to
 * @param {Function} onSwipe - Callback invoked with 'left' or 'right' on valid swipe
 */
export function bindSwipeEvents(elementId, onSwipe) {
    _swipeArea = document.getElementById(elementId);
    if (!_swipeArea) return;

    _onSwipe = onSwipe;

    _handlers = {
        touchstart: onTouchStart,
        touchmove: onTouchMove,
        touchend: onTouchEnd,
        touchcancel: resetGesture,
        mousedown: onMouseDown,
        mousemove: onMouseMove,
        mouseup: onMouseUp,
        wheel: onWheel,
    };

    _swipeArea.addEventListener('touchstart', _handlers.touchstart, { passive: true });
    _swipeArea.addEventListener('touchmove', _handlers.touchmove, { passive: false });
    _swipeArea.addEventListener('touchend', _handlers.touchend, { passive: true });
    _swipeArea.addEventListener('touchcancel', _handlers.touchcancel, { passive: true });

    _swipeArea.addEventListener('mousedown', _handlers.mousedown);
    window.addEventListener('mousemove', _handlers.mousemove);
    window.addEventListener('mouseup', _handlers.mouseup);

    _swipeArea.addEventListener('wheel', _handlers.wheel, { passive: false });
}

/**
 * Remove all gesture event listeners and reset internal state.
 */
export function unbindSwipeEvents() {
    if (!_swipeArea || !_handlers) return;

    _swipeArea.removeEventListener('touchstart', _handlers.touchstart);
    _swipeArea.removeEventListener('touchmove', _handlers.touchmove);
    _swipeArea.removeEventListener('touchend', _handlers.touchend);
    _swipeArea.removeEventListener('touchcancel', _handlers.touchcancel);

    _swipeArea.removeEventListener('mousedown', _handlers.mousedown);
    window.removeEventListener('mousemove', _handlers.mousemove);
    window.removeEventListener('mouseup', _handlers.mouseup);

    _swipeArea.removeEventListener('wheel', _handlers.wheel);

    _swipeArea = null;
    _onSwipe = null;
    _handlers = null;
    resetGesture();
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

    if (dx < 0 && _onSwipe) {
        _onSwipe('left');
    } else if (dx > 0 && _onSwipe) {
        _onSwipe('right');
    }
}

function resetGesture() {
    _startX = 0;
    _startY = 0;
    _isSwiping = false;
    _swipeLocked = false;
    _isMouseDown = false;
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

function onWheel(e) {
    if (_wheelScrollCooldown) return;

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) {
        if (e.cancelable) e.preventDefault();

        if (e.deltaX > 0 && _onSwipe) {
            _onSwipe('left');
            triggerWheelCooldown();
        } else if (e.deltaX < 0 && _onSwipe) {
            _onSwipe('right');
            triggerWheelCooldown();
        }
    }
}

function triggerWheelCooldown() {
    _wheelScrollCooldown = true;
    setTimeout(() => { _wheelScrollCooldown = false; }, WHEEL_COOLDOWN_MS);
}
