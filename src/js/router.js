/**
 * SPA Router — Hash-based Navigation
 * Handles page switching without full reloads.
 *
 * Supports both static handler objects and lazy handlerFactory functions
 * (returning a Promise via dynamic import()) for on-demand module loading.
 */

import { logError } from './utils/error-boundary.js';

const _routes = {};
const _routeCache = {};
let _currentPage = null;
let _isNavigating = false;
const _history = [];
let _onNavigateCallback = null;
let _targetPage = null;
let _navId = 0;

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
    // Determine the true destination we are rendering or resting on
    const effectivePage = _isNavigating ? _targetPage : _currentPage;

    // Avoid double navigation or pushing the exact page we are already on (or heading to)
    if (effectivePage === path) {
        if (_onNavigateCallback && effectivePage) _onNavigateCallback(effectivePage);
        return;
    }

    // If locked by another operation (e.g. language change or active destroy phase),
    // reject it and force UI back to the intended destination target
    if (_isNavigating) {
        if (_onNavigateCallback && effectivePage) _onNavigateCallback(effectivePage);
        return;
    }

    const myNavId = ++_navId;
    _isNavigating = true;
    _targetPage = path;

    // Immediately notify listeners for an optimistic, sub-millisecond UI update
    if (_onNavigateCallback) {
        _onNavigateCallback(path);
    }

    try {
        if (pushHistory && _currentPage) {
            // Prevent pushing the same page consecutively
            if (_history.length === 0 || _history[_history.length - 1] !== _currentPage) {
                _history.push(_currentPage);
            }
        }

        // Destroy current page — this is the critical section that must not overlap
        const currentHandler = _routeCache[_currentPage];
        if (_currentPage && currentHandler?.destroy) {
            await currentHandler.destroy();
        }

        _currentPage = path;
        _isNavigating = false;
        _targetPage = null;

        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // Show target page
        const pageEl = document.getElementById(`page-${path}`);
        if (pageEl) {
            pageEl.classList.add('active');

            // Resolve the handler (static or lazy)
            const handler = await _resolveHandler(path);

            // A newer navigate() may have taken over — abort this render silently
            if (myNavId !== _navId) return;

            if (handler?.render) {
                await handler.render(pageEl);
            }
        }

    } catch (error) {
        // Fallback UI to valid state if navigation throws an error
        if (_onNavigateCallback && _currentPage) {
            _onNavigateCallback(_currentPage);
        }
        logError('[Router]', error);
    } finally {
        // Only release the lock if this navigation still owns it.
        // If a newer navigation took over, it owns the lock state now.
        if (myNavId === _navId) {
            _isNavigating = false;
            _targetPage = null;
        }
    }
}

/**
 * Soft-reload the current page in place.
 * Calls destroy() then render() on the active handler without modifying
 * the history stack or triggering a full app restart (no Splash Screen).
 * Safe to call even when a navigation is not in flight.
 */
export async function refreshCurrentPage() {
    if (_isNavigating || !_currentPage) return;
    _isNavigating = true;
    _targetPage = _currentPage;
    try {
        const handler = _routeCache[_currentPage];
        const pageEl = document.getElementById(`page-${_currentPage}`);
        if (!handler || !pageEl) return;

        if (handler.destroy) await handler.destroy();
        if (handler.render) await handler.render(pageEl, { refresh: true });
    } finally {
        _isNavigating = false;
        _targetPage = null;
    }
}

/**
 * Go back to previous page in history
 */
export function goBack() {
    if (_isNavigating) return null; // Protect against corrupting history during transitions

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
 * @returns {Promise<void>} Resolves when the chunk is successfully parsed
 */
export async function prefetch(path) {
    try {
        await _resolveHandler(path);
    } catch {
        /* silent — prefetch failure is non-critical */
    }
}
