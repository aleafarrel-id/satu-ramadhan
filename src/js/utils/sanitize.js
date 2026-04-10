/**
 * HTML Sanitization Utilities
 * Central defense against XSS when rendering dynamic data via innerHTML.
 */

/**
 * Escapes HTML-special characters so the string is rendered as plain text
 * inside innerHTML templates.  Safe to call on any value — nullish inputs
 * return an empty string and non-string values are coerced first.
 *
 * @param {*} value - The value to escape (typically a string).
 * @returns {string} HTML-safe string.
 */
export function escapeHtml(value) {
    if (value == null) return '';

    return String(value)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;');
}
