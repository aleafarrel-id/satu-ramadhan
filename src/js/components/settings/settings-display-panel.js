/**
 * Settings Display Panel Component
 * Renders the Display settings card.
 */

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { store } from '../../core/store.js';
import { getLanguageLabel, getLanguageByCode } from '../../config/languages.js';
import * as Notif from '../../modules/notification/notification.js';

export async function render(container) {
   await loadNS('components/settings/settings-display-panel');
   await loadNS('components/modal/app-theme-modal');

   container.dataset.themeUnsub = store.subscribe('settings.theme', (newTheme) => {
      const label = container.querySelector('#app-theme-select-label');
      if (label) label.textContent = t(`components/modal/app-theme-modal:theme_${newTheme}`);
   });

   container.dataset.langUnsub = store.subscribe('settings.language', (newLang) => {
      const label = container.querySelector('#app-language-select-label');
      if (label) label.textContent = getLanguageLabel(newLang);
   });

   const savedLang = store.getState('settings.language') ?? 'auto';
   const langLabel = getLanguageLabel(savedLang);

   const savedTheme = store.getState('settings.theme') ?? 'auto';
   const themeLabel = t(`components/modal/app-theme-modal:theme_${savedTheme}`);

   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="display-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">${t('components/settings/settings-display-panel:section')}</div>
         </div>
         <div class="settings-item" id="app-language-item" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-font-family'></i>
               <span>${t('components/settings/settings-display-panel:language')}</span>
            </div>
            
            <div class="settings-select-trigger u-pointer-none">
               <span id="app-language-select-label">${langLabel}</span>
            </div>
         </div>
         <div class="settings-divider"></div>
         <div class="settings-item" id="app-theme-item" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-palette'></i>
               <span>${t('components/settings/settings-display-panel:theme')}</span>
            </div>
            
            <div class="settings-select-trigger u-pointer-none">
               <span id="app-theme-select-label" class="u-text-capitalize">${themeLabel}</span>
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
                  // Wait for language resources to load and switch over
                  const { changeLanguage } = await import('../../core/i18n.js');
                  await changeLanguage(langCode);

                  // Notify user of success using the newly loaded namespace and language
                  await loadNS('components/modal/app-language-modal');
                  const langEntry = getLanguageByCode(langCode);
                  const label = langCode === 'auto'
                     ? t('components/modal/app-language-modal:auto')
                     : (langEntry?.nativeLabel || langCode);

                  Notif.show(t('components/settings/settings-display-panel:language_changed', { label }), 'success');
               }
            }
         });
      });
   }

   const appThemeItem = container.querySelector('#app-theme-item');
   if (appThemeItem) {
      makeAccessibleBtn(appThemeItem, async (e) => {
         e.stopPropagation();
         const { showAppThemeModal } = await import('../modal/app-theme-modal.js');
         showAppThemeModal();
      });
   }
}

export function destroy(container) {
   if (container?.dataset?.themeUnsub) store.unsubscribe(container.dataset.themeUnsub);
   if (container?.dataset?.langUnsub) store.unsubscribe(container.dataset.langUnsub);
}
