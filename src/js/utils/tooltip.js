/**
 * Generic Tooltip Manager
 * Handles event delegation for tooltips to optimize performance.
 * Dynamically adjusts tooltip position to prevent screen overflow.
 */

/* Internal State */

/** @type {WeakSet<Element>} Set of containers with active delegated listeners */
const _attachedContainers = new WeakSet();

/** @type {Element|null} The currently active tooltip trigger element */
let _activeTooltipTrigger = null;

/* Position Calculation */

/**
 * Calculates and applies horizontal offset to prevent tooltip overflow.
 * @param {Element} triggerEl - The element triggering the tooltip
 */
function _adjustTooltipPosition(triggerEl) {
   // Find the nearest scrollable or block container, fallback to document
   const scrollContainer = triggerEl.closest('.quran-reader-scroll') || document.documentElement;
   const containerRect = scrollContainer.getBoundingClientRect();
   const triggerRect = triggerEl.getBoundingClientRect();

   // Best-effort estimation of tooltip width (since pseudo-elements cannot be measured directly)
   const label = triggerEl.getAttribute('data-label') || '';
   const estimatedWidth = (label.length * 7) + 24; // approx char width + padding width
   const halfWidth = estimatedWidth / 2;

   const triggerCenterX = triggerRect.left + (triggerRect.width / 2);
   const safetyPadding = 12; // safety margin from screen edges in pixels

   // Reset positional custom property before calculation
   triggerEl.style.setProperty('--tooltip-offset-x', '-50%');

   // Check right edge collision
   if (triggerCenterX + halfWidth > containerRect.right - safetyPadding) {
      const overflow = (triggerCenterX + halfWidth) - (containerRect.right - safetyPadding);
      triggerEl.style.setProperty('--tooltip-offset-x', `calc(-50% - ${Math.ceil(overflow)}px)`);
   }
   // Check left edge collision
   else if (triggerCenterX - halfWidth < containerRect.left + safetyPadding) {
      const overflow = (containerRect.left + safetyPadding) - (triggerCenterX - halfWidth);
      triggerEl.style.setProperty('--tooltip-offset-x', `calc(-50% + ${Math.ceil(overflow)}px)`);
   }
}

/* Lifecycle API */

/**
 * Initializes event-delegated tooltip handling on a container element.
 * Safe for repeated calls; internally idempotent via WeakSet.
 *
 * @param {Element} container - The parent container element for event delegation
 * @param {string} triggerSelector - The CSS selector for elements that trigger the tooltip
 */
export function initTooltip(container, triggerSelector = '[data-tooltip]') {
   if (!container || _attachedContainers.has(container)) return;
   _attachedContainers.add(container);

   // Mobile Tap/Click Handling
   container.addEventListener('click', (e) => {
      const triggerEl = e.target.closest(triggerSelector);

      if (triggerEl) {
         e.stopPropagation();

         // Toggle off if clicking the same active trigger
         if (_activeTooltipTrigger === triggerEl) {
            triggerEl.classList.remove('active');
            _activeTooltipTrigger = null;
            return;
         }

         // Dismiss previously active tooltip
         if (_activeTooltipTrigger) {
            _activeTooltipTrigger.classList.remove('active');
         }

         // Adjust position to fit screen and activate
         _adjustTooltipPosition(triggerEl);
         triggerEl.classList.add('active');
         _activeTooltipTrigger = triggerEl;
      } else {
         // Dismiss active tooltip if tapped outside any trigger
         if (_activeTooltipTrigger) {
            _activeTooltipTrigger.classList.remove('active');
            _activeTooltipTrigger = null;
         }
      }
   });

   // Desktop Hover Handling
   // Ensures offset calculates before CSS transition begins
   container.addEventListener('mouseover', (e) => {
      const triggerEl = e.target.closest(triggerSelector);
      if (triggerEl) {
         _adjustTooltipPosition(triggerEl);
      }
   });
}

/**
 * Dismisses any currently active tooltip globally.
 * Use during UI teardown or route changes.
 */
export function dismissTooltip() {
   if (_activeTooltipTrigger) {
      _activeTooltipTrigger.classList.remove('active');
      _activeTooltipTrigger = null;
   }
}
