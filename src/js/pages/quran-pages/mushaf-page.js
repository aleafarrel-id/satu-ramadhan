/**
 * Mushaf Subpage — route adapter that opens the Mushaf Reader overlay.
 */

import * as MushafReader from '../../modules/quran/mushaf/mushaf-reader.js';

import { navigateBackFromMushaf } from '../quran-page.js';

let _container = null;

/** Called by quran-page.js when loading the 'mushaf' subpage. */
export async function render(container) {
   _container = container;
   await MushafReader.open(1, { onClose: navigateBackFromMushaf });
}

/** Called when navigating away from the Mushaf subpage. */
export async function destroy() {
   MushafReader.destroy();
   _container = null;
}
