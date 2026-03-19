/**
 * Inline Header Component
 */

import { makeAccessibleBtn } from '../../utils/a11y.js';

let _backBtn = null;
let _onBack = null;

/**
 * Initializes header listeners.
 * @param {HTMLElement} headerEl - The inline header element.
 * @param {Function} onBack - Back button callback.
 */
export function init(headerEl, onBack) {
   _onBack = onBack;

   if (!headerEl) return;

   _backBtn = headerEl.querySelector('.quran-back-btn');

   if (_backBtn) {
      makeAccessibleBtn(_backBtn, handleBack);
   }
}

/**
 * Handles back navigation.
 */
function handleBack() {
   if (_onBack) {
      _onBack();
   }
}

/**
 * Updates the header title text.
 */
export function setTitle(title) {
   const titleEl = document.querySelector('.quran-header-title');
   if (titleEl) {
      titleEl.textContent = title;
   }
}

/**
 * Cleans up listeners and references.
 */
export function destroy() {
   if (_backBtn) {
      _backBtn.removeEventListener('click', handleBack);
   }

   _backBtn = null;
   _onBack = null;
}