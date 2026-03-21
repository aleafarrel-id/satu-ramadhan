/**
 * Mushaf Reader — Full-screen Quran page viewer with page-flip effects.
 *
 * RTL Strategy: Uses PageFlip in landscape mode (usePortrait: false) so the
 * book is 2 pages wide with the binding in the center. The viewport is 1 page
 * wide, showing only the left page. This makes the left edge the free edge,
 * perfectly mimicking an Arabic book. Even indices hold Quran pages; odd
 * indices hold empty backing pages.
 */

import { PageFlip } from 'page-flip';
import * as MushafApi from './mushaf-api.js';
import * as MushafUI from './mushaf-ui.js';
import * as QuranDock from '../../../components/quran/quran-dock.js';
import { createSurahCard, createSurahList } from '../../../components/quran/quran-card.js';
import { makeAccessibleBtn } from '../../../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../system/back-handler.js';

/* ─── Constants ─── */

const TOTAL_PAGES = MushafApi.getTotalPages();
const INITIAL_WINDOW = 10;
const EXPAND_MARGIN = 3;
const EXPAND_SIZE = 10;

/* ─── State ─── */

let _isOpen = false;
let _currentPage = 1;
let _currentSurahIndex = 1;

let _overlay = null;
let _viewportContainer = null;
let _bookContainer = null;
let _pageCounterEl = null;
let _surahTitleEl = null;
let _surahChevronEl = null;
let _titleWrapper = null;
let _quranPage = null;
let _pickerOverlay = null;
let _backdropEl = null;
let _onCloseCallback = null;
let _isPickerOpen = false;

/** @type {PageFlip|null} */
let _pageFlip = null;

let _mushafIndex = null;

let _windowStart = 1;
let _windowEnd = 1;
let _isExpanding = false;
let _isReloading = false;
let _resizeTimeout = null;

/* ─── Internal Helpers ─── */

/**
 * Safely destroys PageFlip and re-creates _bookContainer.
 * PageFlip.destroy() removes the root element from DOM; we must
 * re-create it when the viewport should stay alive.
 */
function _destroyPageFlip(recreate = true) {
   if (!_pageFlip) return;
   const parent = _bookContainer?.parentNode;
   _pageFlip.destroy();
   _pageFlip = null;

   if (recreate && parent && _viewportContainer) {
      _bookContainer = document.createElement('div');
      _bookContainer.className = 'mushaf-book-container';
      _bookContainer.id = 'mushaf-book';
      parent.insertBefore(_bookContainer, parent.firstChild);
   }
}

/** Resets all module state to defaults. */
function _resetState() {
   _overlay = null;
   _viewportContainer = null;
   _bookContainer = null;
   _pageCounterEl = null;
   _surahTitleEl = null;
   _surahChevronEl = null;
   _titleWrapper = null;
   _pickerOverlay = null;
   _backdropEl = null;
   _onCloseCallback = null;
   _quranPage = null;
   _windowStart = 1;
   _windowEnd = 1;
   _isExpanding = false;
   _isReloading = false;
   _isPickerOpen = false;
   _resizeTimeout = null;
}

/** Removes all event listeners and cleans up picker. */
function _detachListeners() {
   unregisterModalDismiss(close);
   window.removeEventListener('resize', _onWindowResize);
   document.removeEventListener('visibilitychange', _onVisibilityChange);
   if (_resizeTimeout) clearTimeout(_resizeTimeout);
   _closePicker();
}

/** Removes overlay elements from the DOM. */
function _removeOverlays() {
   if (_overlay?.parentNode) _overlay.parentNode.removeChild(_overlay);
   if (_pickerOverlay?.parentNode) _pickerOverlay.parentNode.removeChild(_pickerOverlay);
   if (_backdropEl?.parentNode) _backdropEl.parentNode.removeChild(_backdropEl);
}

function _toArabicDigits(num) {
   const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
   return num.toString().split('').map(c => digits[parseInt(c)]).join('');
}

/** Sets _windowStart/_windowEnd centered around targetPage. */
function _calcWindow(targetPage) {
   _windowStart = Math.max(1, targetPage - Math.floor(INITIAL_WINDOW / 2));
   _windowEnd = Math.min(TOTAL_PAGES, _windowStart + INITIAL_WINDOW - 1);
   if (_windowEnd === TOTAL_PAGES) _windowStart = Math.max(1, TOTAL_PAGES - INITIAL_WINDOW + 1);
}

/* ─── Surah Data ─── */

function _getSurahForPage(pageNumber) {
   return MushafApi.getSurahForPage(pageNumber);
}

function _updateSurahHeader() {
   const surah = _getSurahForPage(_currentPage);
   if (surah && _surahTitleEl) {
      _currentSurahIndex = surah.surah;
      _surahTitleEl.textContent = `${surah.surah}. ${surah.title}`;
   }
}

function _updatePageCounter() {
   if (_pageCounterEl) {
      _pageCounterEl.textContent = _toArabicDigits(_currentPage);
   }
}

/* ─── Public API ─── */

export async function open(startPage = 1, options = {}) {
   if (_isOpen) return;
   _isOpen = true;
   _currentPage = MushafApi.clampPage(startPage);
   _onCloseCallback = options.onClose;

   _quranPage = document.querySelector('.quran-page');
   if (!_quranPage) return;

   _mushafIndex = await MushafApi.getMushafIndex();

   QuranDock.hide();
   _buildBackdrop();
   _buildOverlay();
   _updateSurahHeader();

   registerModalDismiss(close);
   window.addEventListener('resize', _onWindowResize);
   document.addEventListener('visibilitychange', _onVisibilityChange);

   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_overlay) _overlay.classList.add('active');
         if (_quranPage) _quranPage.classList.add('is-reading');
      });
   });

   _calcWindow(_currentPage);
   await _buildAndMountPageFlip(_currentPage);
}

export function close() {
   if (!_isOpen) return;
   _isOpen = false;

   if (_onCloseCallback) _onCloseCallback();

   _detachListeners();
   _destroyPageFlip(false);

   // Show backdrop immediately (same pattern as Al-Quran exit)
   if (_backdropEl) _backdropEl.classList.add('active');

   if (_overlay) _overlay.classList.remove('active');
   if (_quranPage) _quranPage.classList.remove('is-reading');
   QuranDock.show();

   // Hide backdrop after 600ms (matching Al-Quran exit timing)
   setTimeout(() => {
      if (_backdropEl) _backdropEl.classList.remove('active');
   }, 600);

   // Full cleanup after 800ms (matching Al-Quran exit timing)
   setTimeout(() => {
      _removeOverlays();
      _resetState();
   }, 800);
}

export function destroy() {
   if (!_isOpen) return;
   _isOpen = false;

   _detachListeners();
   _destroyPageFlip(false);
   _removeOverlays();
   if (_quranPage) _quranPage.classList.remove('is-reading');
   QuranDock.show();

   _resetState();
}

export async function goToPage(pageNumber) {
   if (!_isOpen || !_pageFlip) return;
   const target = MushafApi.clampPage(pageNumber);

   if (target >= _windowStart && target <= _windowEnd) {
      const index = (_windowEnd - target) * 2;
      _pageFlip.turnToPage(index);
   } else {
      _currentPage = target;
      await _reloadWindow(target);
   }
}

export function isOpen() { return _isOpen; }

/* ─── Event Handlers ─── */

function _onWindowResize() {
   clearTimeout(_resizeTimeout);
   _resizeTimeout = setTimeout(() => {
      if (_isOpen && _currentPage) _reloadWindow(_currentPage);
   }, 300);
}

function _onVisibilityChange() {
   if (document.visibilityState === 'visible' && _isOpen && _currentPage) {
      _reloadWindow(_currentPage);
   }
}

/* ─── DOM Construction ─── */

function _buildBackdrop() {
   _backdropEl = document.createElement('div');
   _backdropEl.className = 'mushaf-backdrop';
   _backdropEl.id = 'mushaf-backdrop';

   const content = document.createElement('div');
   content.className = 'mushaf-backdrop-content';

   const icon = document.createElement('i');
   icon.className = 'bx bx-book-reader';

   const label = document.createElement('span');
   label.textContent = 'Mushaf';

   content.appendChild(icon);
   content.appendChild(label);
   _backdropEl.appendChild(content);
   _quranPage.appendChild(_backdropEl);
}

function _buildOverlay() {
   _overlay = document.createElement('div');
   _overlay.className = 'mushaf-overlay';
   _overlay.id = 'mushaf-overlay';

   const header = _buildHeader();
   _viewportContainer = _buildViewport();

   _overlay.appendChild(header);
   _overlay.appendChild(_viewportContainer);
   _quranPage.appendChild(_overlay);
}

function _buildHeader() {
   const header = document.createElement('div');
   header.className = 'mushaf-header';

   const backBtn = document.createElement('button');
   backBtn.className = 'mushaf-back-btn';
   backBtn.setAttribute('aria-label', 'Kembali');
   backBtn.innerHTML = `<i class='bx bx-chevron-left'></i>`;
   makeAccessibleBtn(backBtn, close);

   _pageCounterEl = document.createElement('span');
   _pageCounterEl.className = 'mushaf-page-counter';
   _updatePageCounter();

   _titleWrapper = document.createElement('div');
   _titleWrapper.className = 'mushaf-title-wrapper';
   _titleWrapper.setAttribute('role', 'button');
   _titleWrapper.setAttribute('tabindex', '0');

   _surahTitleEl = document.createElement('span');
   _surahTitleEl.className = 'mushaf-surah-title';

   _surahChevronEl = document.createElement('i');
   _surahChevronEl.className = 'bx bx-chevron-down mushaf-title-chevron';

   _titleWrapper.appendChild(_surahTitleEl);
   _titleWrapper.appendChild(_surahChevronEl);
   _titleWrapper.addEventListener('click', _togglePicker);

   header.appendChild(backBtn);
   header.appendChild(_titleWrapper);
   header.appendChild(_pageCounterEl);

   return header;
}

function _buildViewport() {
   const viewport = document.createElement('div');
   viewport.className = 'mushaf-viewport';
   viewport.id = 'mushaf-viewport';

   _bookContainer = document.createElement('div');
   _bookContainer.className = 'mushaf-book-container';
   _bookContainer.id = 'mushaf-book';
   viewport.appendChild(_bookContainer);

   const rightNav = document.createElement('div');
   rightNav.className = 'mushaf-nav-right';
   rightNav.addEventListener('click', () => {
      if (_pageFlip && !_isExpanding && _currentPage > 1) {
         _pageFlip.flipNext('bottom');
      }
   });
   viewport.appendChild(rightNav);

   return viewport;
}

/* ─── PageFlip Lifecycle ─── */

function _getPageFlipConfig() {
   const pw = _viewportContainer.clientWidth || window.innerWidth;
   const ph = _viewportContainer.clientHeight || (window.innerHeight - 50);

   // Expose actual page height to CSS for accurate font scaling
   _viewportContainer.style.setProperty('--mushaf-page-h', `${ph}px`);

   return {
      width: pw,
      height: ph,
      size: 'fixed',
      usePortrait: false,
      drawShadow: true,
      maxShadowOpacity: 0.25,
      flippingTime: 900,
      mobileScrollSupport: false,
   };
}

async function _fetchPageRange(start, end) {
   const promises = [];
   for (let i = start; i <= end; i++) promises.push(MushafApi.getPage(i));
   return Promise.all(promises);
}

/** Populates _bookContainer with page elements and initializes PageFlip. */
async function _buildAndMountPageFlip(targetPage) {
   const pages = await _fetchPageRange(_windowStart, _windowEnd);
   if (!_isOpen || !_bookContainer) return;

   for (let i = pages.length - 1; i >= 0; i--) {
      _bookContainer.appendChild(MushafUI.buildPageElement(pages[i]));
      _bookContainer.appendChild(MushafUI.buildEmptyPageElement());
   }

   _pageFlip = new PageFlip(_bookContainer, _getPageFlipConfig());
   _pageFlip.loadFromHTML(_bookContainer.querySelectorAll('.mushaf-page'));

   const targetIndex = (_windowEnd - targetPage) * 2;
   if (targetIndex > 0) _pageFlip.turnToPage(targetIndex);

   _pageFlip.on('flip', _onPageFlip);
   _updatePageCounter();
   _updateSurahHeader();
}

function _onPageFlip(e) {
   const flipIndex = e.data;
   _currentPage = _windowEnd - (flipIndex / 2);
   _updatePageCounter();
   _updateSurahHeader();
   _checkAndExpand(flipIndex);
}

/* ─── Page Window Management ─── */

async function _checkAndExpand(flipIndex) {
   if (_isExpanding || !_pageFlip || !_isOpen) return;

   const pagesInWindow = _windowEnd - _windowStart + 1;
   const distFromHighest = flipIndex / 2;
   const distFromLowest = pagesInWindow - 1 - distFromHighest;

   // Expand towards higher Quran page numbers (prepend)
   if (distFromHighest <= Math.floor(EXPAND_MARGIN / 2) && _windowEnd < TOTAL_PAGES) {
      _isExpanding = true;
      const newEnd = Math.min(TOTAL_PAGES, _windowEnd + EXPAND_SIZE);
      const pages = await _fetchPageRange(_windowEnd + 1, newEnd);

      if (!_isOpen || !_bookContainer || !_pageFlip) { _isExpanding = false; return; }

      const firstChild = _bookContainer.firstChild;
      const addedPairs = newEnd - _windowEnd;

      for (let i = pages.length - 1; i >= 0; i--) {
         const el = MushafUI.buildPageElement(pages[i]);
         const empty = MushafUI.buildEmptyPageElement();
         _bookContainer.insertBefore(empty, firstChild);
         _bookContainer.insertBefore(el, empty);
      }

      _windowEnd = newEnd;
      _pageFlip.updateFromHtml(_bookContainer.querySelectorAll('.mushaf-page'));
      _pageFlip.turnToPage(flipIndex + addedPairs * 2);
      _isExpanding = false;
   }

   // Expand towards lower Quran page numbers (append)
   if (distFromLowest <= Math.floor(EXPAND_MARGIN / 2) && _windowStart > 1) {
      _isExpanding = true;
      const newStart = Math.max(1, _windowStart - EXPAND_SIZE);
      const pages = await _fetchPageRange(newStart, _windowStart - 1);

      if (!_isOpen || !_bookContainer || !_pageFlip) { _isExpanding = false; return; }

      for (let i = pages.length - 1; i >= 0; i--) {
         _bookContainer.appendChild(MushafUI.buildPageElement(pages[i]));
         _bookContainer.appendChild(MushafUI.buildEmptyPageElement());
      }

      _windowStart = newStart;
      _pageFlip.updateFromHtml(_bookContainer.querySelectorAll('.mushaf-page'));
      _isExpanding = false;
   }
}

async function _reloadWindow(targetPage) {
   if (!_bookContainer || !_isOpen || _isReloading) return;
   _isReloading = true;

   _destroyPageFlip(true);
   _calcWindow(targetPage);

   await _buildAndMountPageFlip(targetPage);
   _isReloading = false;
}

/* ─── Surah Picker ─── */

function _togglePicker() { _isPickerOpen ? _closePicker() : _openPicker(); }

function _openPicker() {
   if (_isPickerOpen || !_mushafIndex) return;
   _isPickerOpen = true;

   if (!_pickerOverlay) {
      _pickerOverlay = document.createElement('div');
      _pickerOverlay.className = 'mushaf-picker-overlay';

      const pickerHeader = document.createElement('div');
      pickerHeader.className = 'mushaf-picker-header';

      const closePickerBtn = document.createElement('button');
      closePickerBtn.className = 'mushaf-back-btn';
      closePickerBtn.setAttribute('aria-label', 'Tutup');
      closePickerBtn.innerHTML = `<i class='bx bx-x'></i>`;
      makeAccessibleBtn(closePickerBtn, _closePicker);

      const pickerTitle = document.createElement('div');
      pickerTitle.className = 'mushaf-picker-title';
      pickerTitle.textContent = 'Pilih Surah';

      const pickerSpacer = document.createElement('div');
      pickerSpacer.style.width = '36px';

      pickerHeader.appendChild(closePickerBtn);
      pickerHeader.appendChild(pickerTitle);
      pickerHeader.appendChild(pickerSpacer);

      const pickerContent = document.createElement('div');
      pickerContent.className = 'mushaf-picker-content';

      const surahListContainer = createSurahList();

      _mushafIndex.forEach(entry => {
         const item = createSurahCard(entry, () => {
            _closePicker();
            goToPage(entry.startPage);
         });

         if (entry.surah === _currentSurahIndex) {
            item.classList.add('mushaf-picker-active');
         }

         surahListContainer.appendChild(item);
      });

      pickerContent.appendChild(surahListContainer);
      _pickerOverlay.appendChild(pickerHeader);
      _pickerOverlay.appendChild(pickerContent);
      _quranPage.appendChild(_pickerOverlay);
   }

   registerModalDismiss(_closePicker);

   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_pickerOverlay) _pickerOverlay.classList.add('active');
         const activeItem = _pickerOverlay.querySelector('.mushaf-picker-item.active');
         if (activeItem) activeItem.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
   });
}

function _closePicker() {
   if (!_isPickerOpen) return;
   _isPickerOpen = false;
   unregisterModalDismiss(_closePicker);

   if (_pickerOverlay) {
      _pickerOverlay.classList.remove('active');
      setTimeout(() => {
         if (_pickerOverlay?.parentNode) _pickerOverlay.parentNode.removeChild(_pickerOverlay);
         _pickerOverlay = null;
      }, 350);
   }
}
