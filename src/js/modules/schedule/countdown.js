/**
 * Countdown Module
 */

let _interval = null;
let _callback = null;

/**
 * Calculate time difference between now and target
 * @returns {{ hours, minutes, seconds, total }}
 */
export function getTimeUntil(targetDate) {
    const now = new Date();
    let diff = targetDate - now;

    // If target is in the past (next day), add 24h
    if (diff < 0) diff += 24 * 60 * 60 * 1000;

    const total = Math.max(0, diff);
    const hours = Math.floor(total / (1000 * 60 * 60));
    const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((total % (1000 * 60)) / 1000);

    return { hours, minutes, seconds, total };
}

/**
 * Start the countdown timer
 * @param {Function} onTick - callback receiving { hours, minutes, seconds }
 * @param {Function} getTarget - function returning the target Date
 */
export function startCountdown(onTick, getTarget) {
    stopCountdown();

    _callback = () => {
        const target = getTarget();
        if (!target) return;
        const remaining = getTimeUntil(target);
        onTick(remaining);
    };

    // Immediate first tick
    _callback();

    // Update every second
    _interval = setInterval(_callback, 1000);
}

/**
 * Stop the countdown timer
 */
export function stopCountdown() {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
    _callback = null;
}
