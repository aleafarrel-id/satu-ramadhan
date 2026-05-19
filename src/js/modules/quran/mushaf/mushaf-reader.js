/**
 * Mushaf Reader Module
 */

// Core & Libraries
import { PageFlip } from 'page-flip';
import panzoom from 'panzoom';

// API & Services
import * as MushafApi from './mushaf-api.js';
import { t, loadNS } from '../../../core/i18n.js';

// UI Components
import * as MushafUI from './mushaf-ui.js';
import * as QuranDock from '../../../components/quran/quran-dock.js';
import { createSurahCard } from '../../../components/quran/quran-card.js';
import { openPicker, closePicker, isOpen as isPickerOpen, destroyPicker } from '../../../components/quran/quran-picker.js';
import { showMushafGuideModal } from '../../../components/modal/mushaf-guide-modal.js';
import { showMushafJumpModal } from '../../../components/modal/mushaf-jump-modal.js';
import * as Notif from '../../notification/notification.js';

// Utilities & Helpers
import { initTooltip, dismissTooltip } from '../../../utils/tooltip.js';
import { makeAccessibleBtn } from '../../../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../system/back-handler.js';
import { store } from '../../../core/store.js';
import { logError } from '../../../utils/error-boundary.js';
import { setStatusBarOverride, clearStatusBarOverride } from '../../../core/theme.js';

const TOTAL_PAGES = MushafApi.getTotalPages();
const INITIAL_WINDOW = 4;
const EXPAND_MARGIN = 2;
const EXPAND_SIZE = 6;

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
let _tajweedSubId = null;

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
let _isTwoPageView = false;
const _transitionManager = {
   timers: [],
   add(t) { this.timers.push(t); },
   clear() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
   }
};

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
   _isTwoPageView = false;
   _transitionManager.clear();
}

/** Removes all event listeners and cleans up picker. */
function _detachListeners() {
   if (_tajweedSubId) {
      store.unsubscribe(_tajweedSubId);
      _tajweedSubId = null;
   }
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

function _getSurahForPage(pageNumber) {
   return MushafApi.getSurahForPage(pageNumber);
}

function _updateSurahHeader() {
   const surah = _getSurahForPage(_currentPage);
   if (surah) _currentSurahIndex = surah.surah;
}

function _updatePageCounter() {
   if (!_pageCounterEl) return;

   if (_isTwoPageView) {
      const rightPage = _currentPage;
      const leftPage = Math.min(_currentPage + 1, TOTAL_PAGES);
      _pageCounterEl.textContent = rightPage === leftPage
         ? _toArabicDigits(rightPage)
         : `${_toArabicDigits(rightPage)} - ${_toArabicDigits(leftPage)}`;
   } else {
      _pageCounterEl.textContent = _toArabicDigits(_currentPage);
   }
}

export async function open(startPage = 1, options = {}) {
   if (_isClosing) {
      // Wait for the close animation to finish completely before re-opening
      await new Promise(resolve => {
         const checkInterval = setInterval(() => {
            if (!_isClosing) {
               clearInterval(checkInterval);
               resolve();
            }
         }, 50);
      });
      // Safety check: if user navigated away while waiting, abort
      const qPage = document.querySelector('.quran-page');
      if (qPage && !qPage.classList.contains('quran-modal-active')) return;
   } else if (_isOpen) {
      return;
   }

   // Set the flag after the await checks have fully passed
   _isOpen = true;
   _currentPage = MushafApi.clampPage(startPage);
   _onCloseCallback = options.onClose;

   // Mushaf has a white/cream paper background — switch status bar icons to dark
   // so they are readable. Only takes effect in teal (light) theme; dark ignores it.
   setStatusBarOverride(true);

   await loadNS('modules/quran/mushaf/mushaf-reader');

   // Pre-emptive cleanup of any previous residues (crucial for rapid navigation)
   _transitionManager.clear();
   _removeOverlays();

   _quranPage = document.querySelector('.quran-page');
   if (!_quranPage) return;

   _mushafIndex = await MushafApi.getMushafIndex();

   QuranDock.hide();

   // ── Build EMPTY overlay shell ──
   // ── Build the OVERLAY first (it will act as the container) ──
   _buildOverlay();
   _updateSurahHeader();

   if (!_tajweedSubId) {
      _tajweedSubId = store.subscribe('settings.quran.tajweed', () => {
         if (_isOpen && !_isClosing && _currentPage) {
            _reloadWindow(_currentPage);
         }
      });
   }

   // ── Build BACKDROP nested inside the overlay ──
   _buildBackdrop(t('modules/quran/mushaf/mushaf-reader:loading'), _overlay);
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

   // ── Trigger the slide-up animation ──
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

   // ── Build content behind the backdrop ──
   _buildGeneration++; // Invalidate any prior stale build
   _calcWindow(_currentPage);
   await _buildAndMountPageFlip(_currentPage);
   if (!_isOpen) return;

   // ── Reveal — fade out the backdrop nested inside ──
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

   // Restore status bar icons to the normal theme style when leaving Mushaf.
   clearStatusBarOverride();

   dismissTooltip();
   _detachListeners();
   destroyPicker();

   // Fade in loading backdrop inside the overlay to hide Mushaf text
   if (_backdropEl) {
      _backdropEl.classList.add('active');
      const label = _backdropEl.querySelector('p');
      if (label) label.textContent = '';
   }

   // Abort any in-flight build immediately so it doesn't race with teardown
   _buildGeneration++;

   // Wait for fade in
   await new Promise(r => requestAnimationFrame(() => setTimeout(r, 300)));

   // Clear heavy PageFlip DOM to free memory while obscured
   if (_pageFlip) {
      _pageFlip.destroy();
      _pageFlip = null;
   }
   if (_bookContainer) _bookContainer.innerHTML = '';
   _bookContainer = null;

   // Command the background to rebuild (quran-page loadSubPage)
   if (_onCloseCallback) {
      try {
         await _onCloseCallback();
         // Native text re-flow can sometimes cause a tiny micro-stutter
         await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
      } catch (e) {
         logError('[Mushaf]', e);
      }
   }

   // Show dock and slide the overlay down
   QuranDock.show();

   if (_overlay) _overlay.classList.remove('active');
   if (_quranPage) _quranPage.classList.remove('is-reading');
   document.body.style.overscrollBehavior = '';

   // Wait for overlay completely sliding down (CSS transition is 0.6s)
   await new Promise(r => setTimeout(r, 600));

   // Safe full cleanup
   if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);

   _isOpen = false;
   _isClosing = false;
   _resetState();
}

export function destroy() {
   if (_isClosing) return; // Prevent abrupt structural interference while animating close
   _isOpen = false;
   _buildGeneration++; // Cancel any in-flight build

   // Restore status bar icons (mirrors close() cleanup for the forced-destroy path).
   clearStatusBarOverride();

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
   const mul = _isTwoPageView ? 1 : 2;

   if (target >= _windowStart && target <= _windowEnd) {
      const index = (_windowEnd - target) * mul;
      _pageFlip.turnToPage(index);
   } else {
      _currentPage = target;
      await _reloadWindow(target);
   }
}

export function isOpen() { return _isOpen; }

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
   const pagesToPromote = [];
   for (let delta = -1; delta <= 1; delta++) {
      const target = _currentPage + delta;
      if (target < _windowStart || target > _windowEnd) continue;
      const el = _bookContainer.querySelector(`.mushaf-page[data-page="${target}"]`);
      if (el) pagesToPromote.push(el);
   }

   pagesToPromote.forEach(p => { p.style.willChange = 'transform'; });
   const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
   schedule(() => {
      pagesToPromote.forEach(p => { p.style.willChange = ''; });
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

   _pageCounterEl = document.createElement('button');
   _pageCounterEl.className = 'mushaf-page-counter';
   _pageCounterEl.setAttribute('aria-label', 'Lompat ke halaman');
   makeAccessibleBtn(_pageCounterEl, () => {
      showMushafJumpModal({ current: _currentPage, onJump: goToPage });
   });
   _updatePageCounter();

   // Actions wrapper (right side: zoom + menu)
   const actionsWrap = document.createElement('div');
   actionsWrap.className = 'mushaf-header-actions';

   _zoomBtnEl = document.createElement('button');
   _zoomBtnEl.className = 'mushaf-back-btn mushaf-zoom-btn';
   _zoomBtnEl.id = 'mushaf-zoom-toggle';
   _zoomBtnEl.setAttribute('aria-label', 'Mode Zoom');
   _zoomBtnEl.innerHTML = `<i class='bx bx-expand-alt'></i>`;
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
      _zoomBtnEl.innerHTML = `<i class='bx bx-collapse-alt'></i>`;
   }
   
   Notif.show(t('modules/quran/mushaf/mushaf-reader:zoom_toast'), 'info');
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
      _zoomBtnEl.innerHTML = `<i class='bx bx-expand-alt'></i>`;
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

function _getPageFlipConfig() {
   const pw = _viewportContainer.clientWidth || window.innerWidth;
   const ph = _viewportContainer.clientHeight || (window.innerHeight - 50);

   _isTwoPageView = pw >= 600 && ph >= 500;

   const pageW = _isTwoPageView ? Math.floor(pw / 2) : pw;
   const contentW = Math.max(160, pageW - _cachedPageHPad);

   _viewportContainer.style.setProperty('--mushaf-page-h', `${ph}px`);
   _viewportContainer.style.setProperty('--mushaf-page-w', `${contentW}px`);

   if (_bookContainer) {
      _bookContainer.style.width = _isTwoPageView ? '100%' : '200%';
   }

   return {
      width: pageW,
      height: ph,
      size: 'fixed',
      usePortrait: false,
      useMouseEvents: false,
      drawShadow: _isTwoPageView,
      maxShadowOpacity: _isTwoPageView ? 0.15 : 0,
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

   // Detect two-page mode BEFORE building HTML so the DOM structure matches
   const pw = _viewportContainer.clientWidth || window.innerWidth;
   const ph = _viewportContainer.clientHeight || (window.innerHeight - 50);
   _isTwoPageView = pw >= 600 && ph >= 500;

   const mul = _isTwoPageView ? 1 : 2;

   let html = '';
   for (let i = pages.length - 1; i >= 0; i--) {
      html += MushafUI.buildPageHTML(pages[i], hasTajweed);
      if (!_isTwoPageView) html += MushafUI.buildEmptyPageHTML();
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

   const targetIndex = (_windowEnd - targetPage) * mul;
   if (targetIndex > 0) _pageFlip.turnToPage(targetIndex);

   _pageFlip.on('flip', _onPageFlip);
   _updatePageCounter();
   _updateSurahHeader();
}

function _onPageFlip(e) {
   dismissTooltip();
   const flipIndex = e.data;
   // In tablet mode flipIndex points to the LEFT page of the spread;
   // _currentPage must be the RIGHT page (read-first in RTL mushaf).
   _currentPage = _isTwoPageView
      ? _windowEnd - flipIndex - 1
      : _windowEnd - (flipIndex / 2);
   _updatePageCounter();
   _updateSurahHeader();

   if (_isExpanding) return;

   setTimeout(_checkAndExpand, 500);
   _prefetchAdjacent();
}

async function _checkAndExpand() {
   if (_isExpanding || !_pageFlip || !_isOpen) return;

   // Compute flipIndex from live state so it's always accurate
   // Inverse of _onPageFlip formula for each mode
   const flipIndex = _isTwoPageView
      ? (_windowEnd - _currentPage - 1)
      : (_windowEnd - _currentPage) * 2;
   const pagesInWindow = _windowEnd - _windowStart + 1;
   const distFromHighest = _isTwoPageView
      ? (flipIndex + 1) / 1
      : flipIndex / 2;
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
         if (!_isTwoPageView) html += MushafUI.buildEmptyPageHTML();
      }
      _bookContainer.insertAdjacentHTML('afterbegin', html);

      // Re-compute flipIndex after DOM change for accurate positioning
      const newFlipIndex = _isTwoPageView
         ? (_windowEnd - _currentPage - 1)
         : (_windowEnd - _currentPage) * 2;
      const addedElements = _isTwoPageView ? addedPairs : addedPairs * 2;
      _windowEnd = newEnd;
      _pageFlip.updateFromHtml(_bookContainer.querySelectorAll('.mushaf-page'));
      _pageFlip.turnToPage(newFlipIndex + addedElements);

      setTimeout(() => { _isExpanding = false; }, 400);
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
         if (!_isTwoPageView) html += MushafUI.buildEmptyPageHTML();
      }
      _bookContainer.insertAdjacentHTML('beforeend', html);

      _windowStart = newStart;
      _pageFlip.updateFromHtml(_bookContainer.querySelectorAll('.mushaf-page'));
      setTimeout(() => { _isExpanding = false; }, 400);
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

function _togglePicker() { isPickerOpen() ? closePicker() : _openPicker(); }

function _openPicker() {
   if (!_mushafIndex) return;

   openPicker({
      title: t('modules/quran/mushaf/mushaf-reader:select_surah') || 'Pilih Surah',
      data: _mushafIndex,
      createCardFn: createSurahCard,
      isActiveFn: (item) => item.surah === _currentSurahIndex,
      activeClass: 'mushaf-picker-active',
      onSelect: (item) => goToPage(item.startPage),
      container: _quranPage
   });
}
