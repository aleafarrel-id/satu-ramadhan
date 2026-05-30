/**
 * Settings Quran Panel Component
 * Renders the Al-Quran settings card.
 */

// Core & Libraries
import { Capacitor } from '@capacitor/core';
import { QURAN_LANGUAGES } from '../../config/quran-languages.js';
import { impact } from '../../modules/system/haptic.js';
import * as Notif from '../../modules/notification/notification.js';
import {
   getTajweedEnabled, setTajweedEnabled,
   getTransliterationEnabled, setTransliterationEnabled,
   getTranslationEnabled, setTranslationEnabled,
   getTranslationLanguage, setTranslationLanguageManual,
   getAudioMode, setAudioMode,
   getQuranFontSize
} from '../../modules/quran/quran-settings.js';
import { t } from '../../core/i18n.js';

// UI Components
import { showLanguageSelectorModal } from '../modal/language-selector-modal.js';
import { showAudioModeSelectorModal } from '../modal/audio-mode-selector-modal.js';
import { showQuranFontModal } from '../modal/quran-font-modal.js';

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';

// Mode Labels

/** Returns a display label for the given AudioMode value. */
function _getAudioModeLabel(mode) {
   return mode === 'offline'
      ? t('components/modal/audio-mode-selector-modal:mode_offline_label')
      : t('components/modal/audio-mode-selector-modal:mode_streaming_label');
}

function _getFontLabel() {
   const arabic = getQuranFontSize('arabic');
   const latin = getQuranFontSize('latin');
   const translation = getQuranFontSize('translation');

   if (arabic === latin && latin === translation) {
      if (arabic === 3) return t('components/modal/quran-font-modal:step_large', { defaultValue: 'Ekstra Besar' });
      if (arabic === 2) return t('components/modal/quran-font-modal:step_medium', { defaultValue: 'Besar' });
      return t('components/modal/quran-font-modal:step_normal', { defaultValue: 'Normal' });
   }

   return t('components/modal/quran-font-modal:custom_size', { defaultValue: 'Kustom' });
}

// Render

export function render(container) {
   const tajweedChecked = getTajweedEnabled();
   const transliterationChecked = getTransliterationEnabled();
   const translationChecked = getTranslationEnabled();
   const savedLang = getTranslationLanguage();
   const savedLangLabel = QURAN_LANGUAGES.find(l => l.code === savedLang)?.label || savedLang;

   // Audio Mode is only available on native — web is always streaming.
   const isNative = Capacitor.isNativePlatform();
   const currentAudioMode = isNative ? getAudioMode() : 'streaming';
   const audioModeLabel = _getAudioModeLabel(currentAudioMode);
   const fontLabel = _getFontLabel();

   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="quran-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">${t('components/settings/settings-quran-panel:section')}</div>
         </div>
         ${isNative ? `
         <div class="settings-item" id="quran-audio-mode-item" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-headphone'></i>
               <span>${t('components/settings/settings-quran-panel:audio_mode')}</span>
            </div>
            <div class="settings-select-trigger">
               <span id="audio-mode-select-label">${audioModeLabel}</span>
            </div>
         </div>
         <div class="settings-divider"></div>
         ` : ''}
         <div class="settings-item" id="quran-font-item" tabindex="0" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-font-size'></i>
               <span>${t('components/settings/settings-quran-panel:font_size')}</span>
            </div>
            <div class="settings-select-trigger">
               <span id="quran-font-select-label">${fontLabel}</span>
            </div>
         </div>
         <div class="settings-divider"></div>
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
         <label class="settings-item" for="toggle-translation" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-text'></i>
               <span>${t('components/settings/settings-quran-panel:translation')}</span>
            </div>
            <div class="switch-toggle">
               <input type="checkbox" id="toggle-translation"${translationChecked ? ' checked' : ''}>
               <span class="slider"></span>
            </div>
         </label>
         <div class="settings-divider"></div>
         <div class="settings-item ${!translationChecked ? 'settings-item--disabled' : ''}" id="quran-translation-item" data-focus-item>
            <div class="settings-item-info">
               <i class='bx bx-transfer-alt'></i>
               <span>${t('components/settings/settings-quran-panel:translation_language')}</span>
            </div>
            <div class="settings-select-trigger">
               <span id="translation-select-label">${savedLangLabel}</span>
            </div>
         </div>
      </div>
   `;

   _bindEvents(container);
}

// Event Bindings

function _bindEvents(container) {
   // Tajweed toggle
   container.querySelector('#toggle-tajweed')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTajweedEnabled(enabled);
      Notif.show(
         enabled
            ? t('components/settings/settings-quran-panel:tajweed_on')
            : t('components/settings/settings-quran-panel:tajweed_off'),
         enabled ? 'success' : 'info'
      );
   });

   // Transliteration toggle
   container.querySelector('#toggle-transliteration')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTransliterationEnabled(enabled);
      Notif.show(
         enabled
            ? t('components/settings/settings-quran-panel:translit_on')
            : t('components/settings/settings-quran-panel:translit_off'),
         enabled ? 'success' : 'info'
      );
   });

   // Translation toggle
   const translationItem = container.querySelector('#quran-translation-item');
   container.querySelector('#toggle-translation')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await impact('medium');
      setTranslationEnabled(enabled);
      if (translationItem) {
         translationItem.classList.toggle('settings-item--disabled', !enabled);
      }
      Notif.show(
         enabled
            ? t('components/settings/settings-quran-panel:translation_on')
            : t('components/settings/settings-quran-panel:translation_off'),
         enabled ? 'success' : 'info'
      );
   });

   // Translation language selector
   const translationLabel = container.querySelector('#translation-select-label');
   if (translationItem) {
      makeAccessibleBtn(translationItem, async (e) => {
         e.stopPropagation();
         showLanguageSelectorModal({
            currentLang: getTranslationLanguage(),
            onSelect: (value) => {
               const langData = QURAN_LANGUAGES.find(l => l.code === value);
               if (langData) {
                  translationLabel.textContent = langData.label;
                  // Mark as manual override and disables auto-sync until next UI language change
                  setTranslationLanguageManual(value);
                  Notif.show(
                     t('components/settings/settings-quran-panel:translation_changed', { label: langData.label }),
                     'success'
                  );
               }
            },
         });
      });
   }

   // Audio Mode selector (native only)
   const audioModeItem = container.querySelector('#quran-audio-mode-item');
   const audioModeLabel = container.querySelector('#audio-mode-select-label');
   const fontSizeItem = container.querySelector('#quran-font-item');
   const fontSelectLabel = container.querySelector('#quran-font-select-label');

   if (fontSizeItem) {
      makeAccessibleBtn(fontSizeItem, () => {
         impact('light');
         showQuranFontModal({
            onSelect: () => {
               if (fontSelectLabel) {
                  fontSelectLabel.textContent = _getFontLabel();
               }
            }
         });
      });
   }

   if (audioModeItem) {
      makeAccessibleBtn(audioModeItem, async (e) => {
         e.stopPropagation();
         showAudioModeSelectorModal({
            currentMode: getAudioMode(),
            onSelect: (value) => {
               setAudioMode(value);
               const label = _getAudioModeLabel(value);
               audioModeLabel.textContent = label;
               Notif.show(
                  t('components/settings/settings-quran-panel:audio_mode_changed', { label }),
                  'success'
               );
            },
         });
      });
   }
}

// Lifecycle

export function destroy() {
   // No persistent listeners — all bound to container innerHTML
}
