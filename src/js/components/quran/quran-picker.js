/**
 * Quran Picker Component
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { normalizeSearchText } from '../../modules/quran/quran-utility.js';

// UI Components
import * as QuranHeader from './quran-header.js';
import * as QuranCard from './quran-card.js';
import { t } from '../../core/i18n.js';

let _pickerOverlay = null;
let _pickerHeaderInstance = null;
let _isOpen = false;
let _pickerOptions = null;
let _isPickerSearchActive = false;
let _currentListData = [];
let _listContainer = null;
let _searchDebounceTimer = null;

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
   _pickerOptions = options;

   _pickerOverlay = document.createElement('div');
   _pickerOverlay.className = 'quran-reader-picker-overlay';

   _pickerHeaderInstance = QuranHeader.createHeader({
      title: options.title,
      onBack: closePicker,
      backAriaLabel: t('components/quran/quran-search:close_search') || 'Tutup daftar',
      hasSearchInput: true,
      searchPlaceholder: t('components/quran/quran-search:placeholder') || 'Cari...',
      searchInputType: 'text',
      searchInputMode: 'search',
      onSearchInput: _onSearchInput,
      rightBtnIcon: 'bx-search',
      rightBtnAriaLabel: 'Cari',
      onRightBtnClick: _togglePickerSearch
   });

   const content = document.createElement('div');
   content.className = 'quran-reader-picker-content';

   _listContainer = document.createElement('div');
   _listContainer.className = 'surah-list';

   _pickerOverlay.appendChild(_pickerHeaderInstance.element);
   _pickerOverlay.appendChild(content);
   content.appendChild(_listContainer);

   const container = options.container || document.querySelector('.quran-page') || document.body;
   container.appendChild(_pickerOverlay);

   Promise.resolve(options.data).then(listData => {
      _currentListData = listData;
      _renderList(listData);
   }).catch(err => {
      console.error('[QuranPicker] Error loading data:', err);
      QuranCard.renderErrorState(content, t('components/quran/quran-card:error_load'));
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
   unregisterModalDismiss(_exitPickerSearch);

   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   _isPickerSearchActive = false;

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

function _renderList(listData) {
   if (!_listContainer) return;
   _listContainer.innerHTML = '';

   if (!listData || listData.length === 0) {
      _listContainer.innerHTML = `
         <div class="quran-reader-no-results">
            <i class='bx bx-search-alt'></i>
            <p>${t('components/quran/quran-search:not_found_basic')}</p>
         </div>
      `;
      return;
   }

   listData.forEach(item => {
      const card = _pickerOptions.createCardFn(item, () => {
         closePicker();
         _pickerOptions.onSelect(item);
      });

      if (_pickerOptions.isActiveFn(item)) {
         card.classList.add(_pickerOptions.activeClass);
      }

      _listContainer.appendChild(card);
   });

   if (!_isPickerSearchActive) {
      requestAnimationFrame(() => {
         requestAnimationFrame(() => {
            if (!_pickerOverlay) return;
            const activeCard = _pickerOverlay.querySelector(`.${_pickerOptions.activeClass}`);
            if (activeCard) {
               activeCard.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
         });
      });
   }
}

function _togglePickerSearch() {
   if (_isPickerSearchActive) {
      _exitPickerSearch();
   } else {
      _enterPickerSearch();
   }
}

function _enterPickerSearch() {
   if (_isPickerSearchActive) return;
   _isPickerSearchActive = true;

   if (_pickerHeaderInstance) {
      _pickerHeaderInstance.toggleSearchMode(true);
      _pickerHeaderInstance.setRightIcon('bx-x');
      const input = _pickerHeaderInstance.getSearchInput();
      if (input) {
         setTimeout(() => input.focus(), 300);
      }
   }

   registerModalDismiss(_exitPickerSearch);
}

function _exitPickerSearch() {
   if (!_isPickerSearchActive) return;
   _isPickerSearchActive = false;

   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   unregisterModalDismiss(_exitPickerSearch);

   if (_pickerHeaderInstance) {
      _pickerHeaderInstance.toggleSearchMode(false);
      _pickerHeaderInstance.setRightIcon('bx-search');
      const input = _pickerHeaderInstance.getSearchInput();
      if (input) input.value = '';
   }

   _renderList(_currentListData);
}

function _onSearchInput(e) {
   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   const query = e.target.value.trim().toLowerCase();

   _searchDebounceTimer = setTimeout(() => {
      _filterList(query);
   }, 250);
}

function _filterList(query) {
   if (!query) {
      _renderList(_currentListData);
      return;
   }

   const normalizedQuery = normalizeSearchText(query);

   const filtered = _currentListData.filter(item => {
      // Name Match
      const normalizedTitle = item.title ? normalizeSearchText(item.title) : '';
      const matchTitle = normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery);
      const matchTitleAr = item.titleAr && item.titleAr.includes(query);

      // Index Match
      const sIndexNum = item.index ? item.index.toString() : (item.surah ? item.surah.toString() : '');
      const matchIndex = sIndexNum === query || sIndexNum === normalizedQuery;

      // Type Match (Makkiyah/Madaniyah)
      const lowerType = item.type ? item.type.toLowerCase() : '';
      const matchType = lowerType.includes(query) || (normalizedQuery.length > 0 && lowerType.includes(normalizedQuery));

      // Ayah Count Match
      const sCountStr = item.count ? item.count.toString() : '';
      const matchCount = sCountStr === query || sCountStr === normalizedQuery || `${sCountStr}ayat` === normalizedQuery;

      // Juz Names Match (if Juz list)
      const normalizedStartName = item.start && item.start.name ? normalizeSearchText(item.start.name) : '';
      const normalizedEndName = item.end && item.end.name ? normalizeSearchText(item.end.name) : '';
      const matchJuzName = normalizedQuery.length > 0 && (normalizedStartName.includes(normalizedQuery) || normalizedEndName.includes(normalizedQuery));
      const matchJuzText = `juz${sIndexNum}` === normalizedQuery;

      return matchTitle || matchTitleAr || matchIndex || matchType || matchCount || matchJuzName || matchJuzText;
   });

   _renderList(filtered);
}

