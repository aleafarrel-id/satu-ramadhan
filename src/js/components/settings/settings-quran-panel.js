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
   getTranslationLanguage, setTranslationLanguage,
   getAudioMode, setAudioMode,
} from '../../modules/quran/quran-settings.js';
import { t } from '../../core/i18n.js';

// UI Components
import { showLanguageSelectorModal } from '../modal/language-selector-modal.js';
import { showAudioModeSelectorModal } from '../modal/audio-mode-selector-modal.js';

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';

// ─── Mode Labels ──────────────────────────────────────────────────────────────

/** Returns a display label for the given AudioMode value. */
function _getAudioModeLabel(mode) {
   return mode === 'offline'
      ? t('components/modal/audio-mode-selector-modal:mode_offline_label')
      : t('components/modal/audio-mode-selector-modal:mode_streaming_label');
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function render(container) {
   const tajweedChecked = getTajweedEnabled();
   const transliterationChecked = getTransliterationEnabled();
   const savedLang = getTranslationLanguage();
   const savedLangLabel = QURAN_LANGUAGES.find(l => l.code === savedLang)?.label || savedLang;

   // Audio Mode is only available on native — web is always streaming.
   const isNative = Capacitor.isNativePlatform();
   const currentAudioMode = isNative ? getAudioMode() : 'streaming';
   const audioModeLabel = _getAudioModeLabel(currentAudioMode);

   container.innerHTML = `
      <div class="card settings-card settings-card-spacing" data-focus-group="quran-settings" data-focus-direction="vertical">
         <div class="settings-card-header">
            <div class="settings-card-title">${t('components/settings/settings-quran-panel:section')}</div>
         </div>
         ${isNative ? `
         <div class="settings-item" id="quran-audio-mode-item" data-focus-item style="cursor: pointer;">
            <div class="settings-item-info">
               <i class='bx bx-headphone'></i>
               <span>${t('components/settings/settings-quran-panel:audio_mode')}</span>
            </div>
            <div class="settings-select-trigger" style="pointer-events: none;">
               <span id="audio-mode-select-label">${audioModeLabel}</span>
            </div>
         </div>
         <div class="settings-divider"></div>
         ` : ''}
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

   _bindEvents(container);
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

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

   // Translation language selector
   const translationItem = container.querySelector('#quran-translation-item');
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
                  setTranslationLanguage(value);
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

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function destroy() {
   // No persistent listeners — all bound to container innerHTML
}
