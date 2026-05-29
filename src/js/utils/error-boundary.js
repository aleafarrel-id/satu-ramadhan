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
 *
 * 3. **Firebase Crashlytics Bridge** — On native platforms, unhandled errors
 *    and promise rejections are forwarded to Firebase Crashlytics as
 *    non-fatal exceptions for production monitoring.
 */

import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';

// Cache platform check once at module evaluation to avoid repeated bridge calls
const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * Parse a raw Error.stack string into StackFrame[] format
 * required by @capacitor-firebase/crashlytics recordException API.
 *
 * @param {string} [stack] - Raw Error.stack string
 * @returns {import('@capacitor-firebase/crashlytics').StackFrame[]}
 */
function parseStackFrames(stack) {
    if (!stack || typeof stack !== 'string') return [];

    return stack
        .split('\n')
        .slice(0, 20) // Limit depth to prevent oversized payloads
        .map(line => {
            // Match common V8/SpiderMonkey stack formats:
            //   "at functionName (fileName:lineNumber:colNumber)"
            //   "at fileName:lineNumber:colNumber"
            const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+)(?::(\d+))?\)?/);
            if (!match) return null;

            return {
                functionName: match[1] || '(anonymous)',
                fileName: match[2] || '',
                lineNumber: parseInt(match[3], 10) || 0
            };
        })
        .filter(Boolean);
}

/**
 * Report an exception to Firebase Crashlytics (native only).
 * Silently no-ops on web or if Crashlytics is unavailable.
 *
 * @param {string} message - Human-readable error message
 * @param {Error}  [error] - Original Error object (for stack parsing)
 */
async function reportToCrashlytics(message, error) {
    if (!IS_NATIVE) return;

    try {
        const stacktrace = parseStackFrames(error?.stack);

        await FirebaseCrashlytics.recordException({
            message: String(message),
            ...(stacktrace.length > 0 && { stacktrace })
        });
    } catch {
        // Crashlytics itself failed — swallow silently
    }
}

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
    window.onerror = (msg, _src, _line, _col, err) => {
        reportToCrashlytics(String(msg), err);
        return true; // Prevents default error logging
    };

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        reportToCrashlytics(
            reason?.message || 'Unhandled Promise Rejection',
            reason instanceof Error ? reason : null
        );
        event.preventDefault(); // Prevents "Uncaught (in promise)" in console
    });
}
