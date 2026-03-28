/**
 * Search UI Component
 */

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';

let _overlay = null;
let _input = null;
let _results = null;
let _callbacks = null;

/**
 * Returns the search overlay HTML.
 */
export function renderHTML() {
   return `
      <div class="quran-search-overlay" id="quran-search-overlay">
         <div class="quran-search-header">
            <button class="quran-search-close quran-icon-btn" aria-label="Tutup Pencarian">
               <i class='bx bx-chevron-left'></i>
            </button>
            <div class="quran-search-input-wrapper">
               <i class='bx bx-search quran-search-icon'></i>
               <input type="text" class="quran-search-input" placeholder="Cari..." autocomplete="off">
            </div>
         </div>
         <div class="quran-search-results" id="quran-search-results">
         </div>
      </div>
   `;
}

/**
 * Initializes the search component and listeners.
 */
export function init(container, callbacks = {}) {
   _callbacks = callbacks;
   _overlay = container.querySelector('#quran-search-overlay');
   if (!_overlay) return;

   _input = _overlay.querySelector('.quran-search-input');
   _results = _overlay.querySelector('#quran-search-results');
   
   // Initial placeholder state
   renderSearchPlaceholder(_results);
   
   const closeBtn = _overlay.querySelector('.quran-search-close');
   if (closeBtn) {
       makeAccessibleBtn(closeBtn, () => {
           if (_callbacks.onClose) _callbacks.onClose();
       });
   }
   
   if (_input) {
       _input.addEventListener('input', (e) => {
           if (_callbacks.onInput) {
               _callbacks.onInput(e.target.value, _results, renderSearchPlaceholder);
           }
       });
   }
}

/**
 * Displays the search overlay.
 */
export function show() {
   if (!_overlay) return;
   _overlay.classList.add('active');
   if (_input) {
       setTimeout(() => _input.focus(), 350);
   }
}

/**
 * Hides the search overlay.
 */
export function hide() {
   if (!_overlay) return;
   _overlay.classList.remove('active');
   if (_input) _input.value = '';
   renderSearchPlaceholder(_results);
}

/**
 * Renders a visual placeholder in the results area.
 */
export function renderSearchPlaceholder(container, message = "Mulai ketik pencarian...", icon = "bx-search") {
   if (!container) return;
   container.innerHTML = `
      <div class="quran-search-placeholder">
         <i class='bx ${icon} quran-search-placeholder-icon'></i>
         <span>${message}</span>
      </div>
   `;
}

/**
 * Cleans up DOM references and callbacks.
 */
export function destroy() {
   _overlay = null;
   _input = null;
   _results = null;
   _callbacks = null;
}
