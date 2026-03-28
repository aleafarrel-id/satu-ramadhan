/**
 * Accessibility (A11y) Utility Module
 * Centralized keyboard navigation support for interactive elements.
 *
 * - makeAccessibleBtn: Makes non-semantic elements (div, span) keyboard-accessible
 * - addEscHandler: Adds Escape key listener to close modals
 * - trapFocus: Auto-focuses and traps Tab cycling inside a modal
 */


const NATIVE_INTERACTIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);


const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');


/**
 * Make an element behave like an accessible button.
 *
 * For non-semantic elements (<div>, <span>, etc.):
 *   - Sets tabindex="0" so the element can receive focus via Tab
 *   - Sets role="button" for screen-reader semantics
 *   - Adds a click listener
 *   - Adds a keydown listener that converts Enter / Space into a click action
 *
 * For native interactive elements (<button>, <a>, <input>):
 *   - Only adds the click listener (they are already focusable & keyboard-activated)
 *
 * @param {HTMLElement} element  - The DOM element to enhance
 * @param {Function}    callback - The action to invoke on activation
 */
export function makeAccessibleBtn(element, callback) {
    if (!element || typeof callback !== 'function') return;

    // Always register the click handler
    element.addEventListener('click', callback);

    // For non-semantic elements, inject a11y attributes + keyboard handler
    if (!NATIVE_INTERACTIVE.has(element.tagName)) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');

        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); // Prevent page scroll on Space
                callback(e);
            }
        });
    }
}

/**
 * Add an Escape-key handler to a modal overlay element.
 * Pressing Escape while any child of the overlay is focused (or the overlay itself)
 * will invoke the provided hide function to dismiss the modal.
 *
 * @param {HTMLElement} overlayEl   - The modal overlay container
 * @param {Function}    hideModalFn - Function to call when Escape is pressed
 */
export function addEscHandler(overlayEl, hideModalFn) {
    if (!overlayEl || typeof hideModalFn !== 'function') return;

    overlayEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            hideModalFn();
        }
    });
}

const activeFocusTraps = [];

/**
 * Trap keyboard focus inside a modal overlay.
 *
 * 1. Sets the overlay as focusable (tabindex="-1") and moves focus into it. 
 * 2. Intercepts Tab / Shift+Tab to cycle focus within the overlay boundaries.
 * 3. Prevents focus from escaping the modal via document focus listener.
 * 4. Saves the previously focused element and restores focus when the trap is released.
 * 5. Uses a stack to ensure only the most recently opened modal enforces focus.
 *
 * Call the returned cleanup function when the modal is removed/hidden
 * to restore focus to the previously active element.
 *
 * @param {HTMLElement} overlayEl - The modal overlay container
 * @returns {Function} cleanup - Call this when the modal is hidden/removed
 */
export function trapFocus(overlayEl) {
    if (!overlayEl) return () => { };

    // Remember what was focused before the modal opened
    const previouslyFocused = document.activeElement;

    // Add to stack of active traps
    const trapConfig = { overlayEl };
    activeFocusTraps.push(trapConfig);

    // Make overlay focusable as a fallback target
    overlayEl.setAttribute('tabindex', '-1');

    // Helper to dynamically get only visible focusable elements
    function getVisibleFocusables() {
        const els = overlayEl.querySelectorAll(FOCUSABLE_SELECTOR);
        return Array.from(els).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);
    }

    // Delay focus lightly to avoid racing with CSS visibility changes (e.g. .active class)
    setTimeout(() => {
        // Focus the modal container to prevent programmatic focus outline on buttons
        // while still announcing the modal to screen readers.
        overlayEl.focus({ preventScroll: true });
    }, 100);

    // Tab-cycling handler
    function handleTabKey(e) {
        if (e.key !== 'Tab') return;

        const visibleEls = getVisibleFocusables();
        if (visibleEls.length === 0) return;

        const firstEl = visibleEls[0];
        const lastEl = visibleEls[visibleEls.length - 1];

        if (e.shiftKey) {
            // Shift+Tab: if focus is on first element, wrap to last
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            // Tab: if focus is on last element, wrap to first
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    }

    // Strict isolation: if focus somehow escapes to document body, push it back
    function handleDocumentFocus(e) {
        // Only enforce focus if this is the most recently opened trap
        if (activeFocusTraps.length > 0 && activeFocusTraps[activeFocusTraps.length - 1] !== trapConfig) {
            return;
        }

        // If the newly focused element is not inside our modal overlay...
        if (!overlayEl.contains(e.target)) {
            e.stopPropagation();
            overlayEl.focus({ preventScroll: true });
        }
    }

    overlayEl.addEventListener('keydown', handleTabKey);
    // Use capture phase to intercept focus before it occurs on outside elements
    document.addEventListener('focus', handleDocumentFocus, true);

    // Return cleanup function
    return function releaseFocus() {
        // Remove this trap from the active stack
        const index = activeFocusTraps.indexOf(trapConfig);
        if (index !== -1) {
            activeFocusTraps.splice(index, 1);
        }

        overlayEl.removeEventListener('keydown', handleTabKey);
        document.removeEventListener('focus', handleDocumentFocus, true);
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };
}

