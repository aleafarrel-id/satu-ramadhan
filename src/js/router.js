/**
 * SPA Router — Hash-based Navigation
 * Handles page switching without full reloads
 */

const _routes = {};
let _currentPage = null;
const _history = [];

/**
 * Register a route
 * @param {string} path - route name (e.g., 'home', 'schedule')
 * @param {{ render: Function, destroy: Function }} handler
 */
export function register(path, handler) {
    _routes[path] = handler;
}

/**
 * Navigate to a page
 * @param {string} path
 * @param {Object} options
 * @param {boolean} options.pushHistory - Whether to add to history stack
 */
export async function navigate(path, { pushHistory = true } = {}) {
    // Avoid double navigation or pushing same page
    if (_currentPage === path) return;

    if (pushHistory && _currentPage) {
        // Prevent pushing the same page consecutively
        if (_history.length === 0 || _history[_history.length - 1] !== _currentPage) {
            _history.push(_currentPage);
        }
    }

    // Destroy current page
    if (_currentPage && _routes[_currentPage]?.destroy) {
        _routes[_currentPage].destroy();
    }

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const pageEl = document.getElementById(`page-${path}`);
    if (pageEl) {
        pageEl.classList.add('active');

        // Render the page
        if (_routes[path]?.render) {
            await _routes[path].render(pageEl);
        }
    }

    _currentPage = path;
}

/**
 * Go back to previous page in history
 */
export function goBack() {
    if (_history.length > 0) {
        const prev = _history.pop();
        navigate(prev, { pushHistory: false });
        return prev;
    }
    return null;
}

/**
 * Check if there is history
 */
export function canGoBack() {
    return _history.length > 0;
}

/**
 * Get current page
 */
export function getCurrentPage() {
    return _currentPage;
}
