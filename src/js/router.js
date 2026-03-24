/**
 * SPA Router — Hash-based Navigation
 * Handles page switching without full reloads.
 *
 * Supports both static handler objects and lazy handlerFactory functions
 * (returning a Promise via dynamic import()) for on-demand module loading.
 */

const _routes = {};
const _routeCache = {};
let _currentPage = null;
let _isNavigating = false;
const _history = [];
let _onNavigateCallback = null;

/**
 * Register a route.
 * @param {string} path - route name (e.g., 'home', 'schedule')
 * @param {object|Function} handlerOrFactory - Either a static handler object
 *   with { render, destroy } methods, or a factory function that returns
 *   a Promise resolving to such an object (e.g., () => import('./pages/xyz.js')).
 */
export function register(path, handlerOrFactory) {
    if (typeof handlerOrFactory === 'function' && !handlerOrFactory.render) {
        // It's a factory function (lazy loader)
        _routes[path] = { factory: handlerOrFactory };
    } else {
        // It's a static handler object — cache immediately
        _routes[path] = { factory: null };
        _routeCache[path] = handlerOrFactory;
    }
}

/**
 * Resolve a route handler — returns the cached module or invokes the factory.
 * @param {string} path
 * @returns {Promise<object>} The resolved handler with render/destroy
 */
async function _resolveHandler(path) {
    if (_routeCache[path]) return _routeCache[path];

    const route = _routes[path];
    if (!route) return null;

    if (route.factory) {
        const mod = await route.factory();
        _routeCache[path] = mod;
        return mod;
    }

    return null;
}

/**
 * Navigate to a page
 * @param {string} path
 * @param {Object} options
 * @param {boolean} options.pushHistory - Whether to add to history stack
 */
export async function navigate(path, { pushHistory = true } = {}) {
    // Avoid double navigation or pushing same page
    if (_isNavigating || _currentPage === path) return;
    _isNavigating = true;

    try {
        if (pushHistory && _currentPage) {
            // Prevent pushing the same page consecutively
            if (_history.length === 0 || _history[_history.length - 1] !== _currentPage) {
                _history.push(_currentPage);
            }
        }

        // Destroy current page
        const currentHandler = _routeCache[_currentPage];
        if (_currentPage && currentHandler?.destroy) {
            await currentHandler.destroy();
        }

        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // Show target page
        const pageEl = document.getElementById(`page-${path}`);
        if (pageEl) {
            pageEl.classList.add('active');

            // Resolve the handler (static or lazy)
            const handler = await _resolveHandler(path);
            if (handler?.render) {
                await handler.render(pageEl);
            }
        }

        _currentPage = path;

        // Notify listeners of navigation change
        if (_onNavigateCallback) {
            _onNavigateCallback(path);
        }
    } finally {
        _isNavigating = false;
    }
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

/**
 * Register a callback fired on every navigation (including goBack)
 * @param {Function} callback - receives the target page path
 */
export function onNavigate(callback) {
    _onNavigateCallback = callback;
}

/**
 * Pre-fetch a lazy route module in background without navigating.
 * Silently resolves and caches the handler so subsequent navigation is instant.
 * @param {string} path - route name to prefetch
 */
export function prefetch(path) {
    _resolveHandler(path).catch(() => {
        /* silent — prefetch failure is non-critical */
    });
}
