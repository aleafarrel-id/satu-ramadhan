/**
 * Modal Portal Utility
 *
 * Provides a single, centralized mount target for all sliding/sheet modals.
 * On desktop (≥1024px): mounts into #content-modal-portal, which lives inside
 * the grid's content area — modals are visually scoped and do not cover the sidebar
 * or header.
 * On mobile/tablet (<1024px): returns document.body for full-screen behavior,
 * preserving the existing experience on all non-desktop devices.
 */

const DESKTOP_BREAKPOINT = 1024;
const PORTAL_ID = 'content-modal-portal';

/**
 * Returns the appropriate DOM node for modal injection.
 * Falls back to document.body if the portal element is missing.
 *
 * @returns {HTMLElement}
 */
export function getModalRoot() {
    if (window.innerWidth < DESKTOP_BREAKPOINT) return document.body;

    const portal = document.getElementById(PORTAL_ID);
    // Defensive fallback: if for any reason the portal is absent, use body.
    return portal ?? document.body;
}
