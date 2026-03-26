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

/**
 * Builds the custom dropdown options HTML.
 */
function _buildCustomOptions(selectedCode) {
   return QURAN_LANGUAGES.map(
      (lang) =>
         `<div class="custom-option${lang.code === selectedCode ? ' selected' : ''}" data-value="${lang.code}">${lang.label}</div>`
   ).join('');
}

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
         <div class="settings-item" id="quran-translation-item" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-transfer-alt'></i>
               <span>Terjemahan</span>
            </div>
            
            <div class="custom-select" id="translation-custom-select">
               <div class="custom-select-trigger">
                  <span id="translation-select-label">${savedLangLabel}</span>
                  <i class='bx bx-chevron-down'></i>
               </div>
               <div class="custom-options">
                  ${_buildCustomOptions(savedLang)}
               </div>
            </div>
         </div>
      </div>
   `;

   /* --- Tajweed Toggle --- */
   const tajweedToggle = document.getElementById('toggle-tajweed');
   tajweedToggle?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTajweedEnabled(enabled);
      Notif.show(
         enabled ? 'Tajweed diaktifkan' : 'Tajweed dimatikan',
         enabled ? 'success' : 'info'
      );
   });

   /* --- Custom Dropdown Logic --- */
   const customSelect = document.getElementById('translation-custom-select');
   const trigger = customSelect?.querySelector('.custom-select-trigger');
   const options = customSelect?.querySelectorAll('.custom-option');
   const labelSpan = document.getElementById('translation-select-label');

   if (customSelect && trigger) {
      // Toggle dropdown open/close
      trigger.addEventListener('click', async (e) => {
         e.stopPropagation();
         const isOpen = customSelect.classList.contains('open');
         if (!isOpen) await impact('light');

         // Close all other styling selects if any exist, then toggle this one
         document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== customSelect) el.classList.remove('open');
         });

         customSelect.classList.toggle('open');
      });

      // Handle option selection
      options?.forEach(option => {
         option.addEventListener('click', async (e) => {
            e.stopPropagation();
            const value = option.getAttribute('data-value');
            const label = option.textContent;

            // Update UI
            labelSpan.textContent = label;
            customSelect.classList.remove('open');

            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            // Save & Notify
            await impact('light');
            setTranslationLanguage(value);
            Notif.show(`Al-Qur'an Terjemahan: ${label}`, 'success');
         });
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
         if (!customSelect.contains(e.target)) {
            customSelect.classList.remove('open');
         }
      });
   }
}

export function destroy() {
   // Any cleanup needed
}
