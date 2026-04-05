/**
 * Settings Display Panel Component
 * Renders the Display settings card.
 */

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { store } from '../../core/store.js';
import { getLanguageLabel } from '../../config/languages.js';

export async function render(container) {
   await loadNS('components/settings/settings-display-panel');
   
   const savedLang = store.getState('settings.language') ?? 'auto';
   const langLabel = getLanguageLabel(savedLang);
   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="display-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">${t('components/settings/settings-display-panel:section')}</div>
         </div>
         <div class="settings-item" id="app-language-item" data-focus-item style="cursor: pointer;">
            <div class="settings-item-info">
               <i class='bx bx-font-family'></i>
               <span>${t('components/settings/settings-display-panel:language')}</span>
            </div>
            
            <div class="settings-select-trigger" style="pointer-events: none;">
               <span id="app-language-select-label">${langLabel}</span>
            </div>
         </div>
      </div>
   `;

   const appLanguageItem = container.querySelector('#app-language-item');
   
   if (appLanguageItem) {
      makeAccessibleBtn(appLanguageItem, async (e) => {
         e.stopPropagation();

         const { showAppLanguageModal } = await import('../modal/app-language-modal.js');
         const currentLang = store.getState('settings.language') ?? 'auto';

         showAppLanguageModal({
            currentLang,
            onSelect: async (langCode) => {
               if (langCode !== currentLang) {
                   // Just use the store. app.js will listen to this,
                   // apply the language change, and softly reload the current view.
                   store.setState('settings.language', langCode);
               }
            }
         });
      });
   }
}

export function destroy() {
   // Any cleanup needed
}
