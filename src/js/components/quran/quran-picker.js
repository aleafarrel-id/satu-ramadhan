import * as QuranHeader from './quran-header.js';
import * as QuranCard from './quran-card.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

let _pickerOverlay = null;
let _pickerHeaderInstance = null;
let _isOpen = false;

/**
 * Unified Picker overlay for displaying and selecting Surahs or Juz.
 * @param {Object} options
 * @param {string} options.title - Header title
 * @param {Promise<Array>|Array} options.data - The data list
 * @param {Function} options.createCardFn - (item, onSelectCallback) => HTMLElement
 * @param {Function} options.isActiveFn - (item) => boolean
 * @param {string} options.activeClass - e.g. 'active-surah'
 * @param {Function} options.onSelect - (item) => void
 * @param {HTMLElement} [options.container] - defaults to document.body
 */
export function openPicker(options) {
   if (_isOpen) return;
   _isOpen = true;

   _pickerOverlay = document.createElement('div');
   _pickerOverlay.className = 'quran-reader-picker-overlay';

   _pickerHeaderInstance = QuranHeader.createHeader({
      title: options.title,
      onBack: closePicker,
      backAriaLabel: 'Tutup daftar'
   });

   const content = document.createElement('div');
   content.className = 'quran-reader-picker-content';

   const listContainer = document.createElement('div');
   listContainer.className = 'surah-list';

   _pickerOverlay.appendChild(_pickerHeaderInstance.element);
   _pickerOverlay.appendChild(content);
   content.appendChild(listContainer);

   const container = options.container || document.querySelector('.quran-page') || document.body;
   container.appendChild(_pickerOverlay);

   Promise.resolve(options.data).then(listData => {
      listContainer.innerHTML = '';
      listData.forEach(item => {
         const card = options.createCardFn(item, () => {
            closePicker();
            options.onSelect(item);
         });

         if (options.isActiveFn(item)) {
            card.classList.add(options.activeClass);
         }

         listContainer.appendChild(card);
      });

      requestAnimationFrame(() => {
         requestAnimationFrame(() => {
            if (!_pickerOverlay) return;
            const activeCard = _pickerOverlay.querySelector(`.${options.activeClass}`);
            if (activeCard) {
               activeCard.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
         });
      });
   }).catch(err => {
      console.error('[QuranPicker] Error loading data:', err);
      QuranCard.renderErrorState(content, "Gagal memuat daftar");
   });

   registerModalDismiss(closePicker);

   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_pickerOverlay) _pickerOverlay.classList.add('active');
      });
   });
}

export function closePicker() {
   if (!_isOpen) return;
   _isOpen = false;
   unregisterModalDismiss(closePicker);

   if (_pickerOverlay) {
      _pickerOverlay.classList.remove('active');
      const overlayRef = _pickerOverlay;
      const headerRef = _pickerHeaderInstance;
      
      _pickerOverlay = null;
      _pickerHeaderInstance = null;

      setTimeout(() => {
         if (overlayRef?.parentNode) overlayRef.parentNode.removeChild(overlayRef);
         if (headerRef) headerRef.destroy();
      }, 350);
   }
}

export function destroyPicker() {
   if (!_isOpen) return;
   _isOpen = false;
   unregisterModalDismiss(closePicker);
   if (_pickerOverlay?.parentNode) _pickerOverlay.parentNode.removeChild(_pickerOverlay);
   if (_pickerHeaderInstance) _pickerHeaderInstance.destroy();
   _pickerOverlay = null;
   _pickerHeaderInstance = null;
}

export function isOpen() {
   return _isOpen;
}
