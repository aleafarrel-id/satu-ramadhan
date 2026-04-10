/**
 * Global Error Boundary & Safe Logger
 *
 * Provides two key security mechanisms:
 *
 * 1. **Safe Logger** — `logError()` wraps console.error to strip stack traces
 *    and internal paths during development. In production, esbuild's `drop`
 *    config removes ALL console calls entirely, so this acts as a dev-time
 *    sanitizer.
 *
 * 2. **Global Error Catchers** — Installs `window.onerror` and
 *    `unhandledrejection` handlers to silently swallow uncaught exceptions,
 *    preventing raw stack traces from appearing in the browser console
 *    or native Logcat (for scenarios where the build strip fails).
 */

/**
 * Sanitise an Error object for safe logging.
 * Strips file paths and stack traces; returns a simple message string.
 *
 * @param {unknown} err - The caught error or any value
 * @returns {string} A safe, one-line summary
 */
function sanitiseError(err) {
    if (err == null) return 'Unknown error';
    if (typeof err === 'string') return err;

    // Extract message only — never expose .stack
    if (err instanceof Error) {
        return err.message || err.name || 'Error';
    }

    // Fallback for non-Error throwables
    try {
        return String(err);
    } catch {
        return 'Unserializable error';
    }
}

/**
 * Safe error logger for development.
 *
 * Usage:  `logError('[MyModule]', err);`
 *
 * In **development** this prints a sanitised one-liner to console.error
 * (no stack traces, no internal file paths).
 * In **production** esbuild's `drop: ['console']` removes this call entirely.
 *
 * @param {string}  tag - Module tag e.g. '[API]', '[Router]'
 * @param {unknown} err - Caught error object
 */
export function logError(tag, err) {
    console.error(`${tag} ${sanitiseError(err)}`);
}

/**
 * Installs global error catchers on `window`.
 * Must be called **synchronously** before any async code runs so it
 * catches even bootstrap failures.
 *
 * Both handlers return `true` / call `preventDefault()` to suppress
 * the default browser error reporting which would expose stack traces.
 */
export function installGlobalErrorBoundary() {
    window.onerror = (_msg, _src, _line, _col, _err) => {
        // Silently swallow — console.error is stripped in production anyway.
        // During development, individual try/catch blocks with logError()
        // provide controlled visibility.
        return true; // Prevents default error logging
    };

    window.addEventListener('unhandledrejection', (event) => {
        event.preventDefault(); // Prevents "Uncaught (in promise)" in console
    });
}
