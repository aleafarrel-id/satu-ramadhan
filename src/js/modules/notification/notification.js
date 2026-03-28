/**
 * In-App Notification Module
 */

/** @type {HTMLElement|null} */
let _container = null;

const ICON_MAP = {
    success: '<i class="bx bx-check-circle"></i>',
    error: '<i class="bx bx-x-circle"></i>',
    info: '<i class="bx bx-info-circle"></i>',
    warning: '<i class="bx bx-error"></i>',
};

const DEFAULT_DURATION = 3500;

/**
 * Ensure the notification container exists
 */
function ensureContainer() {
    if (_container && document.body.contains(_container)) return;

    _container = document.createElement('div');
    _container.className = 'notif-container';
    _container.id = 'notif-container';
    document.body.appendChild(_container);
}

/**
 * Show a notification
 * @param {string} message - Text to display
 * @param {'success'|'error'|'info'|'warning'} type - Notification type
 * @param {number} duration - Auto dismiss duration in ms (0 = no auto dismiss)
 */
export function show(message, type = 'info', duration = DEFAULT_DURATION) {
    ensureContainer();

    const el = document.createElement('div');
    el.className = `notif notif--${type}`;

    const icon = ICON_MAP[type] || ICON_MAP.info;

    el.innerHTML = `
        <span class="notif__icon">${icon}</span>
        <span class="notif__message">${message}</span>
    `;

    // Insert at top so newest is on top
    _container.prepend(el);

    // Trigger enter animation
    requestAnimationFrame(() => {
        el.classList.add('notif--visible');
    });

    // Auto dismiss
    if (duration > 0) {
        setTimeout(() => dismiss(el), duration);
    }

    return el;
}

/**
 * Dismiss a notification with exit animation
 * @param {HTMLElement} el
 */
function dismiss(el) {
    if (!el || !el.parentNode) return;

    el.classList.add('notif--exit');
    el.addEventListener('animationend', () => {
        el.remove();
    }, { once: true });
}

/**
 * Shorthand helpers
 */
export function success(message, duration) {
    return show(message, 'success', duration);
}

export function error(message, duration) {
    return show(message, 'error', duration);
}

export function info(message, duration) {
    return show(message, 'info', duration);
}

export function warning(message, duration) {
    return show(message, 'warning', duration);
}

/**
 * Clear all notifications
 */
export function clearAll() {
    if (!_container) return;
    _container.innerHTML = '';
}
