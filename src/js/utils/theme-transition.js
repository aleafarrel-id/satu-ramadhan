/**
 * Theme Transition Utility
 * Abstractions for View Transition API to animate theme background flawlessly.
 */

/**
 * Executes DOM update within a View Transition.
 * @param {Object} options
 * @param {number} [options.x] Origin X coordinate
 * @param {number} [options.y] Origin Y coordinate
 * @param {Function} options.updateDOMCallback Callback to update DOM
 * @returns {Promise<void>} Resolves when transition ends or if unsupported
 */
export function executeThemeTransition({ x, y, updateDOMCallback }) {
    return new Promise((resolve) => {
        // Fallback for unsupported browsers or background tabs
        if (!document.startViewTransition || document.hidden || document.visibilityState === 'hidden') {
            updateDOMCallback();
            resolve();
            return;
        }

        // Calculate max radius to cover the viewport

        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        // Default to center-top point for celestial-type automatic animation changes
        const startX = x !== undefined ? x : vw / 2;
        const startY = y !== undefined ? y : 0; 

        const endRadius = Math.hypot(
            Math.max(startX, vw - startX),
            Math.max(startY, vh - startY)
        );

        // Lock UI during transition
        document.documentElement.classList.add('theme-transitioning');

        try {
            const transition = document.startViewTransition(() => {
                updateDOMCallback();
            });

            // Wait for DOM update before animating
            transition.ready.then(() => {
                // Keep the old view opaque
                document.documentElement.animate(
                    { opacity: [1, 1] },
                    {
                        duration: 700,
                        pseudoElement: '::view-transition-old(root)'
                    }
                );

                // Animate new view as growing circle from targeted origin coordinate
                document.documentElement.animate(
                    {
                        clipPath: [
                            `circle(0px at ${startX}px ${startY}px)`,
                            `circle(${endRadius}px at ${startX}px ${startY}px)`
                        ]
                    },
                    {
                        duration: 700,
                        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        pseudoElement: '::view-transition-new(root)'
                    }
                );
            }).catch(() => {
                // Ignore animation errors (e.g. tab switch during transition)
            });

            // Cleanup
            transition.finished.finally(() => {
                document.documentElement.classList.remove('theme-transitioning');
                resolve();
            });
        } catch {
            // Handle InvalidStateError or other synchronous API errors
            document.documentElement.classList.remove('theme-transitioning');
            updateDOMCallback();
            resolve();
        }
    });
}
