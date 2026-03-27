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
import panzoom from 'panzoom';
import * as MushafApi from './mushaf-api.js';
import * as MushafUI from './mushaf-ui.js';
import * as QuranDock from '../../../components/quran/quran-dock.js';
import { createSurahCard } from '../../../components/quran/quran-card.js';
import { openPicker, closePicker, isOpen as isPickerOpen, destroyPicker } from '../../../components/quran/quran-picker.js';
import { initTooltip, dismissTooltip } from '../../../utils/tooltip.js';
import { makeAccessibleBtn } from '../../../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../system/back-handler.js';
import { showMushafGuideModal } from '../../../components/modal/mushaf-guide-modal.js';

/* ─── Constants ─── */

const TOTAL_PAGES = MushafApi.getTotalPages();
const INITIAL_WINDOW = 4;
const EXPAND_MARGIN = 2;
const EXPAND_SIZE = 6;

/* ─── State ─── */

let _isOpen = false;
let _isClosing = false;
let _currentPage = 1;
let _currentSurahIndex = 1;

let _overlay = null;
let _viewportContainer = null;
let _bookContainer = null;
let _pageCounterEl = null;
let _menuBtnEl = null;
let _zoomBtnEl = null;

/** @type {ReturnType<typeof panzoom>|null} */
let _panzoomInstance = null;
let _isZoomMode = false;

let _quranPage = null;
let _backdropEl = null;
let _onCloseCallback = null;

/** @type {PageFlip|null} */
let _pageFlip = null;

let _mushafIndex = null;

let _windowStart = 1;
let _windowEnd = 1;
let _isExpanding = false;
let _isReloading = false;
let _resizeTimeout = null;
let _lastVisibilityPage = null;
let _buildGeneration = 0;
let _cachedPageHPad = 32;
const _transitionManager = {
   timers: [],
   add(t) { this.timers.push(t); },
   clear() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
   }
};

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
   _menuBtnEl = null;
   _zoomBtnEl = null;

   _panzoomInstance = null;
   _isZoomMode = false;

   _backdropEl = null;
   _onCloseCallback = null;
   _quranPage = null;
   _windowStart = 1;
   _windowEnd = 1;
   _isExpanding = false;
   _isReloading = false;
   _resizeTimeout = null;
   _buildGeneration = 0;
   _cachedPageHPad = 32;
   _transitionManager.clear();
}

/** Removes all event listeners and cleans up picker. */
function _detachListeners() {
   unregisterModalDismiss(close);
   window.removeEventListener('resize', _onWindowResize);
   document.removeEventListener('visibilitychange', _onVisibilityChange);
   _detachSwipeHandlers();
   if (_resizeTimeout) clearTimeout(_resizeTimeout);
   closePicker();
}

/** Removes overlay elements from the DOM. */
function _removeOverlays() {
   if (_overlay?.parentNode) _overlay.parentNode.removeChild(_overlay);
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
   if (surah) _currentSurahIndex = surah.surah;
}

function _updatePageCounter() {
   if (_pageCounterEl) {
      _pageCounterEl.textContent = _toArabicDigits(_currentPage);
   }
}

/* ─── Public API ─── */

export async function open(startPage = 1, options = {}) {
   if (_isClosing) {
      // Wait for the close animation to finish completely before re-opening
      await new Promise(resolve => {
         const checkInterval = setInterval(() => {
            if (!_isClosing && !_isOpen) {
               clearInterval(checkInterval);
               resolve();
            }
         }, 50);
      });
   } else if (_isOpen) {
      return;
   }
   _isOpen = true;
   _currentPage = MushafApi.clampPage(startPage);
   _onCloseCallback = options.onClose;

   // Pre-emptive cleanup of any previous residues (crucial for rapid navigation)
   _transitionManager.clear();
   _removeOverlays();

   _quranPage = document.querySelector('.quran-page');
   if (!_quranPage) return;

   _mushafIndex = await MushafApi.getMushafIndex();

   QuranDock.hide();

   // ── Phase 1: Build EMPTY overlay shell ──
   // ── Phase 1: Build the OVERLAY first (it will act as the container) ──
   _buildOverlay();
   _updateSurahHeader();

   // ── Phase 2: Build BACKDROP nested inside the overlay ──
   _buildBackdrop('Memuat Mushaf', _overlay);
   if (_backdropEl) {
      _backdropEl.classList.add('active'); // Hidden because overlay is at 100% Y
   }

   QuranDock.hide();

   registerModalDismiss(close);
   window.addEventListener('resize', _onWindowResize);
   document.addEventListener('visibilitychange', _onVisibilityChange);
   _attachSwipeHandlers();

   // Lock body scroll
   document.body.style.overscrollBehavior = 'none';

   // Initialize tooltip delegation for interaction
   initTooltip(_viewportContainer, '.tj');

   // ── Phase 3: Trigger the slide-up animation ──
   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (!_isOpen) return;
         if (_overlay) _overlay.classList.add('active');
         if (_quranPage) _quranPage.classList.add('is-reading');
      });
   });

   // Wait for slide animation (0.6s)
   await new Promise(r => setTimeout(r, 650));
   if (!_isOpen) return;

   // ── Phase 4: Build content behind the backdrop ──
   _buildGeneration++; // Invalidate any prior stale build
   _calcWindow(_currentPage);
   await _buildAndMountPageFlip(_currentPage);
   if (!_isOpen) return;

   // ── Phase 5: Reveal — fade out the backdrop nested inside ──
   await new Promise(r => setTimeout(r, 100));
   if (_backdropEl) {
      _backdropEl.classList.remove('active');
      // No need to remove yet, it's part of overlay
   }
}

export async function close() {
   // Dispose panzoom before any teardown to prevent stale listeners
   _disposePanzoom();
   if (!_isOpen || _isClosing) return;
   _isClosing = true;

   dismissTooltip();
   _detachListeners();
   destroyPicker();

   // 1. Fade in loading backdrop inside the overlay to hide Mushaf text
   if (_backdropEl) {
      _backdropEl.classList.add('active');
      const label = _backdropEl.querySelector('p');
      if (label) label.textContent = '';
   }

   // Abort any in-flight build immediately so it doesn't race with teardown
   _buildGeneration++;

   // Wait for fade in
   await new Promise(r => requestAnimationFrame(() => setTimeout(r, 300)));

   // 2. Clear heavy PageFlip DOM to free memory while obscured
   if (_pageFlip) {
      _pageFlip.destroy();
      _pageFlip = null;
   }
   if (_bookContainer) _bookContainer.innerHTML = '';
   _bookContainer = null;

   // 3. Command the background to rebuild (quran-page loadSubPage)
   if (_onCloseCallback) {
      try {
         await _onCloseCallback();
         // Native text re-flow can sometimes cause a tiny micro-stutter
         await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
      } catch (e) {
         console.error('Error during Mushaf close callback:', e);
      }
   }

   // 4. Show dock and slide the overlay down
   QuranDock.show();

   if (_overlay) _overlay.classList.remove('active');
   if (_quranPage) _quranPage.classList.remove('is-reading');
   document.body.style.overscrollBehavior = '';

   // Wait for overlay completely sliding down (CSS transition is 0.6s)
   await new Promise(r => setTimeout(r, 600));

   // 5. Safe full cleanup
   if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);

   _isOpen = false;
   _isClosing = false;
   _resetState();
}

export function destroy() {
   if (_isClosing) return; // Prevent abrupt structural interference while animating close
   _isOpen = false;
   _buildGeneration++; // Cancel any in-flight build

   dismissTooltip();
   _disposePanzoom();
   _transitionManager.clear();
   _detachListeners();
   _destroyPageFlip(false);
   _removeOverlays();
   if (_quranPage) _quranPage.classList.remove('is-reading');
   document.body.style.overscrollBehavior = '';
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
      // Only reload if the page has changed or PageFlip is missing
      if (_lastVisibilityPage !== _currentPage || !_pageFlip) {
         _lastVisibilityPage = _currentPage;
         _reloadWindow(_currentPage);
      }
   }
}

/* ─── Swipe & Interaction Handlers ─── */

let _swipeStartX = 0;
let _swipeStartY = 0;
let _isSwiping = false;
let _swipeStartTime = 0;

function _attachSwipeHandlers() {
   if (!_viewportContainer) return;
   _viewportContainer.addEventListener('pointerdown', _onPointerDown);
   _viewportContainer.addEventListener('pointerup', _onPointerUp);
   _viewportContainer.addEventListener('pointercancel', _onPointerCancel);
}

function _detachSwipeHandlers() {
   if (!_viewportContainer) return;
   _viewportContainer.removeEventListener('pointerdown', _onPointerDown);
   _viewportContainer.removeEventListener('pointerup', _onPointerUp);
   _viewportContainer.removeEventListener('pointercancel', _onPointerCancel);
}

function _onPointerDown(e) {
   if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;

   dismissTooltip();

   _isSwiping = true;
   _swipeStartX = e.clientX;
   _swipeStartY = e.clientY;
   _swipeStartTime = Date.now();

   // Hint browser to promote the next pages into compositor layers before the flip starts
   _promoteAdjacentPages();
}

function _promoteAdjacentPages() {
   if (!_bookContainer) return;
   const pages = _bookContainer.querySelectorAll('.mushaf-page:not(.mushaf-page-empty)');
   pages.forEach(p => { p.style.willChange = 'transform'; });
   const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
   schedule(() => {
      pages.forEach(p => { p.style.willChange = ''; });
   }, { timeout: 1200 });
}

function _onPointerUp(e) {
   if (!_isSwiping || !_pageFlip || _isExpanding) return;
   _isSwiping = false;

   const diffX = e.clientX - _swipeStartX;
   const diffY = e.clientY - _swipeStartY;
   const timeDiff = Date.now() - _swipeStartTime;

   // Detect active horizontal swipe
   if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0 && _currentPage < TOTAL_PAGES) {
         _pageFlip.flipPrev('bottom'); // Navigate forward
      } else if (diffX < 0 && _currentPage > 1) {
         _pageFlip.flipNext('bottom'); // Navigate backward
      }
   }
   // Detect quick tap interaction
   else if (Math.abs(diffX) < 15 && Math.abs(diffY) < 15 && timeDiff < 300) {
      const vWidth = _viewportContainer.clientWidth || window.innerWidth;

      if (e.clientX < vWidth * 0.3 && _currentPage < TOTAL_PAGES) {
         _pageFlip.flipPrev('bottom');
      } else if (e.clientX > vWidth * 0.7 && _currentPage > 1) {
         _pageFlip.flipNext('bottom');
      }
   }
}

function _onPointerCancel(e) {
   _isSwiping = false;
}

/* ─── DOM Construction ─── */

function _buildBackdrop(label = 'Mushaf', parent = null) {
   // Reuse existing backdrop if available to prevent accumulation
   _backdropEl = document.getElementById('mushaf-backdrop');
   if (!_backdropEl) {
      _backdropEl = document.createElement('div');
      _backdropEl.className = 'mushaf-backdrop';
      _backdropEl.id = 'mushaf-backdrop';

      const target = parent || _quranPage;
      if (target) target.appendChild(_backdropEl);
   }

   _backdropEl.innerHTML = ''; // Clear previous content

   const content = document.createElement('div');
   content.className = 'mushaf-backdrop-content';

   const icon = document.createElement('i');
   icon.className = 'bx bx-book-reader';

   const labelEl = document.createElement('p');
   labelEl.textContent = label;

   content.appendChild(icon);
   content.appendChild(labelEl);
   _backdropEl.appendChild(content);
}

function _buildOverlay() {
   // Ensure old overlay is gone before creating new one
   const oldOverlay = document.getElementById('mushaf-overlay');
   if (oldOverlay) oldOverlay.remove();

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

   const leftWrap = document.createElement('div');
   leftWrap.className = 'mushaf-header-left';

   const backBtn = document.createElement('button');
   backBtn.className = 'mushaf-back-btn';
   backBtn.setAttribute('aria-label', 'Kembali');
   backBtn.innerHTML = `<i class='bx bx-chevron-left'></i>`;
   makeAccessibleBtn(backBtn, close);

   const infoBtn = document.createElement('button');
   infoBtn.className = 'mushaf-back-btn mushaf-info-btn';
   infoBtn.setAttribute('aria-label', 'Panduan Mushaf');
   infoBtn.innerHTML = `<i class='bx bx-info-circle'></i>`;
   makeAccessibleBtn(infoBtn, showMushafGuideModal);

   leftWrap.appendChild(backBtn);
   leftWrap.appendChild(infoBtn);

   _pageCounterEl = document.createElement('span');
   _pageCounterEl.className = 'mushaf-page-counter';
   _updatePageCounter();

   // Actions wrapper (right side: zoom + menu)
   const actionsWrap = document.createElement('div');
   actionsWrap.className = 'mushaf-header-actions';

   _zoomBtnEl = document.createElement('button');
   _zoomBtnEl.className = 'mushaf-back-btn mushaf-zoom-btn';
   _zoomBtnEl.id = 'mushaf-zoom-toggle';
   _zoomBtnEl.setAttribute('aria-label', 'Mode Zoom');
   _zoomBtnEl.innerHTML = `<i class='bx bx-zoom-in'></i>`;
   makeAccessibleBtn(_zoomBtnEl, _toggleZoomMode);

   _menuBtnEl = document.createElement('button');
   _menuBtnEl.className = 'mushaf-back-btn';
   _menuBtnEl.setAttribute('aria-label', 'Menu');
   _menuBtnEl.innerHTML = `<i class='bx bx-menu'></i>`;
   makeAccessibleBtn(_menuBtnEl, _togglePicker);

   actionsWrap.appendChild(_zoomBtnEl);
   actionsWrap.appendChild(_menuBtnEl);

   header.appendChild(leftWrap);
   header.appendChild(_pageCounterEl);
   header.appendChild(actionsWrap);

   return header;
}

function _buildViewport() {
   const viewport = document.createElement('div');
   viewport.className = 'mushaf-viewport';
   viewport.id = 'mushaf-viewport';
   viewport.style.touchAction = 'pan-y'; // Prevent browser horizontal swipe if present

   _bookContainer = document.createElement('div');
   _bookContainer.className = 'mushaf-book-container';
   _bookContainer.id = 'mushaf-book';
   viewport.appendChild(_bookContainer);

   return viewport;
}

/* ─── Panzoom Toggle ─── */

function _toggleZoomMode() {
   _isZoomMode ? _exitZoomMode() : _enterZoomMode();
}

function _enterZoomMode() {
   if (_isZoomMode || !_bookContainer || !_viewportContainer) return;
   _isZoomMode = true;

   dismissTooltip();
   _detachSwipeHandlers();

   if (_zoomBtnEl) {
      _zoomBtnEl.classList.add('is-active');
      _zoomBtnEl.innerHTML = `<i class='bx bx-zoom-out'></i>`;
   }
   if (_overlay) _overlay.classList.add('is-zoom-mode');

   // Disable native viewport swipe to allow panzoom manipulation
   _viewportContainer.style.touchAction = 'none';

   // Strip GPU caching via CSS to prevent scaled text blurring
   _bookContainer.classList.add('is-zoom-active');

   _panzoomInstance = panzoom(_bookContainer, {
      maxZoom: 5,
      minZoom: 1,
      smoothScroll: false,
      beforeWheel: () => true, // Disable desktop wheel zoom
      initialZoom: 1,
   });
}

function _exitZoomMode() {
   if (!_isZoomMode) return;
   _isZoomMode = false;

   _disposePanzoom();

   if (_zoomBtnEl) {
      _zoomBtnEl.classList.remove('is-active');
      _zoomBtnEl.innerHTML = `<i class='bx bx-zoom-in'></i>`;
   }
   if (_overlay) _overlay.classList.remove('is-zoom-mode');

   if (_viewportContainer) _viewportContainer.style.touchAction = 'pan-y';

   _attachSwipeHandlers();
}

/** Safely disposes panzoom and restores GPU compositing CSS. */
function _disposePanzoom() {
   if (!_panzoomInstance) return;
   _panzoomInstance.dispose();
   _panzoomInstance = null;

   if (_bookContainer) {
      _bookContainer.style.transform = '';
      _bookContainer.classList.remove('is-zoom-active');
   }
}

/* ─── PageFlip Lifecycle ─── */

function _getPageFlipConfig() {
   const pw = _viewportContainer.clientWidth || window.innerWidth;
   const ph = _viewportContainer.clientHeight || (window.innerHeight - 50);
   const contentW = Math.max(160, pw - _cachedPageHPad);

   _viewportContainer.style.setProperty('--mushaf-page-h', `${ph}px`);
   _viewportContainer.style.setProperty('--mushaf-page-w', `${contentW}px`);

   return {
      width: pw,
      height: ph,
      size: 'fixed',
      usePortrait: false,
      useMouseEvents: false,
      drawShadow: false,
      maxShadowOpacity: 0,
      flippingTime: 350,
      mobileScrollSupport: false,
      swipeDistance: 10,
      showCover: false,
   };
}

async function _fetchPageRange(start, end) {
   const promises = [];
   for (let i = start; i <= end; i++) promises.push(MushafApi.getPage(i));
   return Promise.all(promises);
}

/**
 * Fetches tajweed data for all surahs present in the given pages.
 * Returns a map: surahNum → tajweedData (or null if unavailable).
 * @param {Array} pages - Array of page data objects
 * @returns {Promise<Object>} tajweedMap
 */
async function _fetchTajweedForPages(pages) {
   const surahSet = new Set();
   for (const page of pages) {
      const surahs = MushafApi.getSurahsInPage(page);
      for (const s of surahs) surahSet.add(s);
   }

   const surahNums = [...surahSet];
   const tajweedResults = await Promise.all(
      surahNums.map(s => MushafApi.getTajweed(s))
   );

   const tajweedMap = {};
   for (let i = 0; i < surahNums.length; i++) {
      if (tajweedResults[i]) tajweedMap[surahNums[i]] = tajweedResults[i];
   }
   return tajweedMap;
}

async function _buildAndMountPageFlip(targetPage) {
   const myGeneration = _buildGeneration;

   const pages = await _fetchPageRange(_windowStart, _windowEnd);

   if (myGeneration !== _buildGeneration || !_isOpen || !_bookContainer) return;

   // Fetch tajweed data in parallel (non-blocking if disabled)
   const tajweedMap = await _fetchTajweedForPages(pages);

   if (myGeneration !== _buildGeneration || !_isOpen || !_bookContainer) return;

   const hasTajweed = Object.keys(tajweedMap).length > 0 ? tajweedMap : null;

   let html = '';
   for (let i = pages.length - 1; i >= 0; i--) {
      html += MushafUI.buildPageHTML(pages[i], hasTajweed);
      html += MushafUI.buildEmptyPageHTML();
   }
   _bookContainer.innerHTML = html;

   if (myGeneration !== _buildGeneration || !_isOpen || !_bookContainer) return;

   // Read padding once after DOM is populated — single forced reflow at build time only
   const firstPage = _bookContainer.querySelector('.mushaf-page');
   if (firstPage) {
      const cs = getComputedStyle(firstPage);
      _cachedPageHPad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
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
   dismissTooltip();
   if (_isExpanding) return;
   const flipIndex = e.data;
   _currentPage = _windowEnd - (flipIndex / 2);
   _updatePageCounter();
   _updateSurahHeader();

   setTimeout(() => _checkAndExpand(flipIndex), 360);
   _prefetchAdjacent();
}

/* ─── Page Window Management ─── */

async function _checkAndExpand(flipIndex) {
   if (_isExpanding || !_pageFlip || !_isOpen) return;

   const pagesInWindow = _windowEnd - _windowStart + 1;
   const distFromHighest = flipIndex / 2;
   const distFromLowest = pagesInWindow - 1 - distFromHighest;

   if (distFromHighest <= Math.floor(EXPAND_MARGIN / 2) && _windowEnd < TOTAL_PAGES) {
      _isExpanding = true;
      const newEnd = Math.min(TOTAL_PAGES, _windowEnd + EXPAND_SIZE);
      const pages = await _fetchPageRange(_windowEnd + 1, newEnd);

      if (!_isOpen || !_bookContainer || !_pageFlip) { _isExpanding = false; return; }

      const tajweedMap = await _fetchTajweedForPages(pages);
      const hasTajweed = Object.keys(tajweedMap).length > 0 ? tajweedMap : null;

      if (!_isOpen || !_bookContainer || !_pageFlip) { _isExpanding = false; return; }

      const addedPairs = newEnd - _windowEnd;

      let html = '';
      for (let i = pages.length - 1; i >= 0; i--) {
         html += MushafUI.buildPageHTML(pages[i], hasTajweed);
         html += MushafUI.buildEmptyPageHTML();
      }
      _bookContainer.insertAdjacentHTML('afterbegin', html);

      _windowEnd = newEnd;
      _pageFlip.updateFromHtml(_bookContainer.querySelectorAll('.mushaf-page'));
      _pageFlip.turnToPage(flipIndex + addedPairs * 2);

      // Hold the lock until the flip animation finishes so spurious flip events
      // emitted by updateFromHtml/turnToPage don't schedule a second expand.
      setTimeout(() => { _isExpanding = false; }, 360);
      return;
   }

   if (distFromLowest <= Math.floor(EXPAND_MARGIN / 2) && _windowStart > 1) {
      _isExpanding = true;
      const newStart = Math.max(1, _windowStart - EXPAND_SIZE);
      const pages = await _fetchPageRange(newStart, _windowStart - 1);

      if (!_isOpen || !_bookContainer || !_pageFlip) { _isExpanding = false; return; }

      const tajweedMap = await _fetchTajweedForPages(pages);
      const hasTajweed = Object.keys(tajweedMap).length > 0 ? tajweedMap : null;

      if (!_isOpen || !_bookContainer || !_pageFlip) { _isExpanding = false; return; }

      let html = '';
      for (let i = pages.length - 1; i >= 0; i--) {
         html += MushafUI.buildPageHTML(pages[i], hasTajweed);
         html += MushafUI.buildEmptyPageHTML();
      }
      _bookContainer.insertAdjacentHTML('beforeend', html);

      _windowStart = newStart;
      _pageFlip.updateFromHtml(_bookContainer.querySelectorAll('.mushaf-page'));
      setTimeout(() => { _isExpanding = false; }, 360);
   }
}

async function _reloadWindow(targetPage) {
   if (!_bookContainer || !_isOpen || _isReloading) return;
   _isReloading = true;
   _buildGeneration++; // Cancel any earlier in-flight build

   // If zoom was active, exit cleanly before rebuilding
   if (_isZoomMode) _exitZoomMode();

   _destroyPageFlip(true);
   _calcWindow(targetPage);

   await _buildAndMountPageFlip(targetPage);
   _isReloading = false;
   _lastVisibilityPage = targetPage;
}

/**
 * Prefetch adjacent pages into cache via idle callback so they're
 * ready before the user swipes to them.
 * @private
 */
function _prefetchAdjacent() {
   const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
   schedule(() => {
      if (!_isOpen) return;
      // Aggressive prefetch: preload up to 10 pages ahead/behind
      const PREFETCH_RANGE = 10;
      const prefetchEnd = Math.min(TOTAL_PAGES, _windowEnd + PREFETCH_RANGE);
      const prefetchStart = Math.max(1, _windowStart - PREFETCH_RANGE);

      for (let i = _windowEnd + 1; i <= prefetchEnd; i++) MushafApi.getPage(i);
      for (let i = prefetchStart; i < _windowStart; i++) MushafApi.getPage(i);
   }, { timeout: 1000 });
}

/* ─── Surah Picker ─── */

function _togglePicker() { isPickerOpen() ? closePicker() : _openPicker(); }

function _openPicker() {
   if (!_mushafIndex) return;

   openPicker({
      title: 'Pilih Surah',
      data: _mushafIndex,
      createCardFn: createSurahCard,
      isActiveFn: (item) => item.surah === _currentSurahIndex,
      activeClass: 'mushaf-picker-active',
      onSelect: (item) => goToPage(item.startPage),
      container: _quranPage
   });
}
