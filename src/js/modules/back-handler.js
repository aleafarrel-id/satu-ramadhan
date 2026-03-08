/**
 * Hardware back button handler for Android
 * Orchestrates closing modals and page navigation
 */

import { App } from '@capacitor/app';

import * as router from '../router.js';

import * as navBar from '../components/ui/nav-bar.js';

// Stack to track active modals
const _modalDismissStack = [];

/**
 * Register a modal's dismiss function
 * @param {Function} dismissFn
 */
export function registerModalDismiss(dismissFn) {
    _modalDismissStack.push(dismissFn);
}

/**
 * Unregister a modal's dismiss function
 * @param {Function} dismissFn
 */
export function unregisterModalDismiss(dismissFn) {
    const idx = _modalDismissStack.indexOf(dismissFn);
    if (idx !== -1) {
        _modalDismissStack.splice(idx, 1);
    }
}

/**
 * Initialize the back button handler
 */
export function initBackHandler() {
    try {
        App.addListener('backButton', () => {
            // If there's an active modal, close the top-most one
            if (_modalDismissStack.length > 0) {
                const dismiss = _modalDismissStack.pop();
                if (typeof dismiss === 'function') {
                    dismiss();
                }
                return;
            }

            // Clear history if navigating to same page or check history stack
            if (router.canGoBack()) {
                const prevPage = router.goBack();
                if (prevPage) {
                    // Update bottom navigation bar visually
                    navBar.setActive(prevPage);
                }
                return;
            }

            // App is at the root level (home, no history, no modal), exit app
            App.exitApp();
        });
        console.log('[App] Back handler initialized');
    } catch (e) {
        console.warn('[App] App plugin not available (likely running in standard web browser)');
    }
}
