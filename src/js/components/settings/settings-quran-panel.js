/**
 * Settings Quran Panel Component
 * Renders the Al-Quran settings card with Tajweed toggle and
 * translation language dropdown.
 */

import { QURAN_LANGUAGES, DEFAULT_LANGUAGE } from '../../config/quran-languages.js';
import { impact } from '../../modules/system/haptic.js';
import * as Notif from '../../modules/notification/notification.js';
import {
   getTajweedEnabled, setTajweedEnabled,
   getTranslationLanguage, setTranslationLanguage
} from '../../modules/quran/quran-settings.js';
import { showLanguageSelectorModal } from '../modal/language-selector-modal.js';
import { makeAccessibleBtn } from '../../utils/a11y.js';



export function render(container) {
   const tajweedChecked = getTajweedEnabled();
   const savedLang = getTranslationLanguage();

   const savedLangLabel = QURAN_LANGUAGES.find(l => l.code === savedLang)?.label || savedLang;

   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="quran-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">AL-QUR'AN</div>
         </div>
         <label class="settings-item" for="toggle-tajweed" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-font-color'></i>
               <span>Hidupkan Tajweed</span>
            </div>
            <div class="switch-toggle">
               <input type="checkbox" id="toggle-tajweed"${tajweedChecked ? ' checked' : ''}>
               <span class="slider"></span>
            </div>
         </label>
         <div class="settings-divider"></div>
         <div class="settings-item" id="quran-translation-item" data-focus-item style="cursor: pointer;">
            <div class="settings-item-info">
               <i class='bx bx-transfer-alt'></i>
               <span>Terjemahan</span>
            </div>
            
            <div class="settings-select-trigger" style="pointer-events: none;">
               <span id="translation-select-label">${savedLangLabel}</span>
            </div>
         </div>
      </div>
   `;

   /* --- Tajweed Toggle --- */
   const tajweedToggle = container.querySelector('#toggle-tajweed');
   tajweedToggle?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTajweedEnabled(enabled);
      Notif.show(
         enabled ? 'Tajweed diaktifkan' : 'Tajweed dimatikan',
         enabled ? 'success' : 'info'
      );
   });

   /* --- Language Modal Logic --- */
   const quranTranslationItem = container.querySelector('#quran-translation-item');
   const labelSpan = container.querySelector('#translation-select-label');

   if (quranTranslationItem) {
      makeAccessibleBtn(quranTranslationItem, async (e) => {
         e.stopPropagation();
         await impact('light');
         
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
                  Notif.show(`Al-Qur'an Terjemahan: ${langData.label}`, 'success');
               }
            }
         });
      });
   }
}

export function destroy() {
   // Any cleanup needed
}
