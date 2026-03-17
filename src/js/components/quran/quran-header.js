/**
 * Al-Quran Header Component
 */

import { makeAccessibleBtn } from '../../utils/a11y.js';

let _backBtn = null;
let _onBack = null;

/**
 * Initialize header event listeners on the inline header
 * @param {HTMLElement} headerEl - The inline header element already in DOM
 * @param {Function} onBack - Callback when back button is clicked
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
 * Handle back button click
 */
function handleBack() {
   if (_onBack) {
      _onBack();
   }
}

/**
 * Update header title
 */
export function setTitle(title) {
   const titleEl = document.querySelector('.quran-header-title');
   if (titleEl) {
      titleEl.textContent = title;
   }
}

/**
 * Cleanup
 */
export function destroy() {
   if (_backBtn) {
      _backBtn.removeEventListener('click', handleBack);
   }

   _backBtn = null;
   _onBack = null;
}