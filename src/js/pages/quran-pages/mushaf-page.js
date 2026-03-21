/**
 * Mushaf Subpage
 * Thin route adapter — when the dock navigates to 'mushaf',
 * this module opens the Mushaf Reader overlay.
 */

import * as MushafReader from '../../modules/quran/mushaf/mushaf-reader.js';
import { navigateBackFromMushaf } from '../quran-page.js';

let _container = null;

/**
 * Called by quran-page.js loadSubPage('mushaf').
 * @param {HTMLElement} container - The #quran-content element
 */
export async function render(container) {
   _container = container;

   // Clear the content area (no list to show — Mushaf is a full overlay)
   container.innerHTML = '';

   // Open the Mushaf reader overlay
   // We pass the onClose callback to restore the previous subpage
   await MushafReader.open(1, { onClose: navigateBackFromMushaf });
}

/**
 * Called when navigating away from the Mushaf subpage.
 */
export async function destroy() {
   MushafReader.destroy();
   _container = null;
}
