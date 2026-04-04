/**
 * Settings Display Panel Component
 * Renders the Display settings card.
 */

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';

export function render(container) {
   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="display-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">TAMPILAN</div>
         </div>
         <div class="settings-item" id="app-language-item" data-focus-item style="cursor: pointer;">
            <div class="settings-item-info">
               <i class='bx bx-font-family'></i>
               <span>Bahasa</span>
            </div>
            
            <div class="settings-select-trigger" style="pointer-events: none;">
               <span id="app-language-select-label">Indonesia</span>
            </div>
         </div>
      </div>
   `;

   const appLanguageItem = container.querySelector('#app-language-item');
   
   if (appLanguageItem) {
      makeAccessibleBtn(appLanguageItem, (e) => {
         e.stopPropagation();
         // UI placeholder: currently no functionality implemented.
         console.log('App Language modal trigger clicked (UI Only)');
      });
   }
}

export function destroy() {
   // Any cleanup needed
}
