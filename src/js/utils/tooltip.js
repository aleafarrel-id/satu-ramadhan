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

/** @type {HTMLElement|null} The singleton global tooltip DOM element */
let _globalTooltipEl = null;

function _ensureGlobalTooltip() {
   if (!_globalTooltipEl) {
      _globalTooltipEl = document.createElement('div');
      _globalTooltipEl.className = 'global-tajweed-tooltip';
      document.body.appendChild(_globalTooltipEl);
   }
   return _globalTooltipEl;
}

/* Position Calculation */

/**
 * Calculates and applies horizontal offset to prevent tooltip overflow.
 * @param {Element} triggerEl - The element triggering the tooltip
 */
function _adjustTooltipPosition(triggerEl, e) {
   const tooltip = _ensureGlobalTooltip();
   const label = triggerEl.getAttribute('data-label') || '';
   tooltip.textContent = label;

   // Find the nearest scrollable or block container, fallback to window/document
   const scrollContainer = triggerEl.closest('.quran-reader-scroll') || document.documentElement;
   const containerRect = scrollContainer.getBoundingClientRect();
   const triggerRect = triggerEl.getBoundingClientRect();
   const rects = triggerEl.getClientRects();

   let targetRect = triggerRect;

   // Handle wrapped inline elements
   if (rects.length > 1) {
      if (e && typeof e.clientX === 'number' && e.clientX > 0) {
         let minDist = Infinity;
         for (const rect of rects) {
            const center = rect.left + rect.width / 2;
            const dist = Math.abs(center - e.clientX);
            if (dist < minDist) {
               minDist = dist;
               targetRect = rect;
            }
         }
      } else {
         // Fallback to the first physical fragment
         targetRect = rects[0];
      }
   }

   // Position the global tooltip explicitly
   tooltip.style.left = `${targetRect.left + (targetRect.width / 2)}px`;
   tooltip.style.top = `${targetRect.top - 8}px`;

   // Best-effort estimation of tooltip width
   const estimatedWidth = (label.length * 7) + 24; // approx char width + padding width
   const halfWidth = estimatedWidth / 2;

   const triggerCenterX = targetRect.left + (targetRect.width / 2);
   const safetyPadding = 12; // safety margin from screen edges in pixels

   // Reset positional custom property before calculation
   tooltip.style.setProperty('--tooltip-offset-x', '-50%');

   // Check right edge collision
   if (triggerCenterX + halfWidth > containerRect.right - safetyPadding) {
      const overflow = (triggerCenterX + halfWidth) - (containerRect.right - safetyPadding);
      tooltip.style.setProperty('--tooltip-offset-x', `calc(-50% - ${Math.ceil(overflow)}px)`);
   }
   // Check left edge collision
   else if (triggerCenterX - halfWidth < containerRect.left + safetyPadding) {
      const overflow = (containerRect.left + safetyPadding) - (triggerCenterX - halfWidth);
      tooltip.style.setProperty('--tooltip-offset-x', `calc(-50% + ${Math.ceil(overflow)}px)`);
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

   // Setup touch state for this attached container
   let isTouch = false;
   let touchStartX = 0;
   let touchStartY = 0;
   let touchStartTime = 0;

   // 1. Pointer Down (Capture Phase)
   container.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
         isTouch = true;
         touchStartX = e.clientX;
         touchStartY = e.clientY;
         touchStartTime = Date.now();
      } else {
         isTouch = false;
      }
   }, { capture: true, passive: true });

   // 2. Pointer Up (Capture Phase) - Robust Tap Detection
   container.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') {
         const dx = Math.abs(e.clientX - touchStartX);
         const dy = Math.abs(e.clientY - touchStartY);
         const dt = Date.now() - touchStartTime;

         // Quick tap criteria: < 15px movement, < 500ms duration
         if (dx < 15 && dy < 15 && dt < 500) {
            const triggerEl = e.target.closest(triggerSelector);
            if (triggerEl) {
               // Toggle off if tapping the same active trigger
               if (_activeTooltipTrigger === triggerEl) {
                  dismissTooltip();
               } else {
                  dismissTooltip(); // Cleanly dismiss any previous tooltip

                  // Calculate and position
                  _adjustTooltipPosition(triggerEl, e);
                  triggerEl.classList.add('active');
                  if (_globalTooltipEl) _globalTooltipEl.classList.add('is-active');
                  _activeTooltipTrigger = triggerEl;
               }
            } else {
               // Tap outside any trigger -> dismiss
               dismissTooltip();
            }
         }
      }
   }, { capture: true, passive: true });

   // 3. Desktop Hover Handling
   container.addEventListener('mouseover', (e) => {
      // Prevent emulated mouse events from triggering double-logic on touch devices
      if (isTouch) return;

      const triggerEl = e.target.closest(triggerSelector);
      if (triggerEl) {
         if (_activeTooltipTrigger !== triggerEl) {
            dismissTooltip();
            _adjustTooltipPosition(triggerEl, e);
            triggerEl.classList.add('active');
            if (_globalTooltipEl) _globalTooltipEl.classList.add('is-active');
            _activeTooltipTrigger = triggerEl;
         }
      }
   }, { capture: true, passive: true });

   container.addEventListener('mouseout', (e) => {
      if (isTouch) return;
      const triggerEl = e.target.closest(triggerSelector);

      // Ensure we only dismiss if leaving the currently active trigger
      if (triggerEl && _activeTooltipTrigger === triggerEl) {
         dismissTooltip();
      }
   }, { capture: true, passive: true });

   // Global scroll listener to dismiss tooltip when scrolling
   // We attach it passively to window
   window.addEventListener('scroll', dismissTooltip, { passive: true, capture: true });
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
   if (_globalTooltipEl) {
      _globalTooltipEl.classList.remove('is-active');
   }
}
