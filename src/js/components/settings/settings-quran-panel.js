/**
 * Settings Quran Panel Component
 * Renders the Al-Quran settings card.
 */

// Core & Libraries
import { QURAN_LANGUAGES } from '../../config/quran-languages.js';
import { impact } from '../../modules/system/haptic.js';
import * as Notif from '../../modules/notification/notification.js';
import {
   getTajweedEnabled, setTajweedEnabled,
   getTransliterationEnabled, setTransliterationEnabled,
   getTranslationLanguage, setTranslationLanguage
} from '../../modules/quran/quran-settings.js';
import { t } from '../../core/i18n.js';

// UI Components
import { showLanguageSelectorModal } from '../modal/language-selector-modal.js';

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';

export function render(container) {
   const tajweedChecked = getTajweedEnabled();
   const transliterationChecked = getTransliterationEnabled();
   const savedLang = getTranslationLanguage();

   const savedLangLabel = QURAN_LANGUAGES.find(l => l.code === savedLang)?.label || savedLang;

   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="quran-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">${t('components/settings/settings-quran-panel:section')}</div>
         </div>
         <label class="settings-item" for="toggle-tajweed" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-font-color'></i>
               <span>${t('components/settings/settings-quran-panel:tajweed')}</span>
            </div>
            <div class="switch-toggle">
               <input type="checkbox" id="toggle-tajweed"${tajweedChecked ? ' checked' : ''}>
               <span class="slider"></span>
            </div>
         </label>
         <div class="settings-divider"></div>
         <label class="settings-item" for="toggle-transliteration" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-italic'></i>
               <span>${t('components/settings/settings-quran-panel:transliteration')}</span>
            </div>
            <div class="switch-toggle">
               <input type="checkbox" id="toggle-transliteration"${transliterationChecked ? ' checked' : ''}>
               <span class="slider"></span>
            </div>
         </label>
         <div class="settings-divider"></div>
         <div class="settings-item" id="quran-translation-item" data-focus-item style="cursor: pointer;">
            <div class="settings-item-info">
               <i class='bx bx-transfer-alt'></i>
               <span>${t('components/settings/settings-quran-panel:translation')}</span>
            </div>
            
            <div class="settings-select-trigger" style="pointer-events: none;">
               <span id="translation-select-label">${savedLangLabel}</span>
            </div>
         </div>
      </div>
   `;

   const tajweedToggle = container.querySelector('#toggle-tajweed');
   tajweedToggle?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTajweedEnabled(enabled);
      Notif.show(
         enabled ? t('components/settings/settings-quran-panel:tajweed_on') : t('components/settings/settings-quran-panel:tajweed_off'),
         enabled ? 'success' : 'info'
      );
   });

   const transliterationToggle = container.querySelector('#toggle-transliteration');
   transliterationToggle?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTransliterationEnabled(enabled);
      Notif.show(
         enabled ? t('components/settings/settings-quran-panel:translit_on') : t('components/settings/settings-quran-panel:translit_off'),
         enabled ? 'success' : 'info'
      );
   });

   const quranTranslationItem = container.querySelector('#quran-translation-item');
   const labelSpan = container.querySelector('#translation-select-label');

   if (quranTranslationItem) {
      makeAccessibleBtn(quranTranslationItem, async (e) => {
         e.stopPropagation();

         const currentLang = getTranslationLanguage();

         showLanguageSelectorModal({
            currentLang,
            onSelect: (value) => {
               const langData = QURAN_LANGUAGES.find(l => l.code === value);
               if (langData) {
                  // Update UI
                  labelSpan.textContent = langData.label;

                  // Save & Notify
                  setTranslationLanguage(value);
                  Notif.show(t('components/settings/settings-quran-panel:translation_changed', { label: langData.label }), 'success');
               }
            }
         });
      });
   }
}

export function destroy() {
   // Any cleanup needed
}
