/**
 * Reader Module
 * Manages the overlay for reading Arabic text and translation.
 * Supports reading per Surah and per Juz.
 */

import * as QuranDock from '../../components/quran/quran-dock.js';
import * as QuranCard from '../../components/quran/quran-card.js';
import * as QuranHeader from '../../components/quran/quran-header.js';
import { renderBatchedList, createRenderContext } from './quran-utility.js';
import { registerModalDismiss, unregisterModalDismiss } from '../system/back-handler.js';
import { buildTajweedFragment, getVerseRules } from './quran-tajweed.js';
import { initTooltip, dismissTooltip } from '../../utils/tooltip.js';
import { getSurahList, getFullSurahPayload, getJuzList } from './quran-api.js';
import { openPicker, closePicker, destroyPicker } from '../../components/quran/quran-picker.js';
import * as BookmarkManager from './bookmark-manager.js';
import * as Notification from '../notification/notification.js';

/* Internal State */

let _isOpen = false;
let _currentItem = null;
let _currentType = 'surah';
let _overlay = null;
let _readerHeaderInstance = null;
let _scrollContainer = null;
let _quranPage = null;
let _onCloseCallback = null;
const _renderCtx = createRenderContext();

/* Verse Search State */

let _isReaderSearchActive = false;
let _currentReaderData = [];
let _searchDebounceTimer = null;
let _targetVerseNumber = null;

/* Public Interface */

/**
 * Opens the reader overlay for a given item (surah or juz).
 * @param {Object} item - Data object of the surah or juz
 * @param {string} type - 'surah' | 'juz'
 * @param {number|null} targetVerseNumber - Verse to scroll to on open (for bookmarks)
 */
export async function open(item, type = 'surah', targetVerseNumber = null, options = {}) {
   if (_isOpen) return;
   _isOpen = true;
   _currentItem = item;
   _currentType = type;
   _targetVerseNumber = targetVerseNumber;
   _onCloseCallback = options?.onClose || null;

   _quranPage = document.querySelector('.quran-page');
   if (!_quranPage) return;

   // Hide dock
   QuranDock.hide();

   // Build & mount overlay
   _buildOverlay(item);

   // Register back handler
   registerModalDismiss(close);

   // Pre-fetch list for dropdown natively handled by API
   if (type === 'juz') {
      getJuzList().catch(err => console.warn('[QuranReader] Failed to load juz list', err));
   } else {
      getSurahList().catch(err => console.warn('[QuranReader] Failed to load surah list', err));
   }

   // Animate in
   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_overlay) _overlay.classList.add('active');
         // Add class to hide main quran content behind
         _quranPage.classList.add('is-reading');
         // Initialize tooltip delegation for mobile tap support
         initTooltip(_scrollContainer, '.tj');
      });
   });

   // Fetch and render data
   await _fetchAndRender(item);
}

/**
 * Closes the reader overlay and restores UI.
 */
export function close() {
   if (!_isOpen) return;
   _isOpen = false;

   if (typeof _onCloseCallback === 'function') {
      _onCloseCallback();
   }

   unregisterModalDismiss(close);

   // Cancel any in-flight renders
   _renderCtx.incrementAndGet();

   _exitReaderSearch();
   closePicker();
   dismissTooltip();

   if (_overlay) {
      _overlay.classList.remove('active');
   }

   if (_quranPage) {
      _quranPage.classList.remove('is-reading');
   }

   // Show dock
   QuranDock.show();

   // Remove overlay after transition
   setTimeout(() => {
      if (_overlay && _overlay.parentNode) {
         _overlay.parentNode.removeChild(_overlay);
      }
      _overlay = null;
      if (_readerHeaderInstance) {
         _readerHeaderInstance.destroy();
         _readerHeaderInstance = null;
      }
      _scrollContainer = null;
      _currentItem = null;
      _currentType = 'surah';
      _currentReaderData = [];
      _onCloseCallback = null;
   }, 400);
}

/**
 * Cleans up on module destruction.
 */
export function destroy() {
   if (_isOpen) {
      // Fast close without animation
      _isOpen = false;
      _isReaderSearchActive = false;
      if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
      _renderCtx.incrementAndGet();
      unregisterModalDismiss(close);
      unregisterModalDismiss(_exitReaderSearch);
      dismissTooltip();
      destroyPicker();

      if (_overlay && _overlay.parentNode) {
         _overlay.parentNode.removeChild(_overlay);
      }
      if (_quranPage) {
         _quranPage.classList.remove('is-reading');
      }
      _overlay = null;
      if (_readerHeaderInstance) {
         _readerHeaderInstance.destroy();
         _readerHeaderInstance = null;
      }
      _scrollContainer = null;
      _currentItem = null;
      _currentType = 'surah';
      _currentReaderData = [];
      _quranPage = null;
      _onCloseCallback = null;
   }
}

/**
 * Returns true if the reader is open.
 */
export function isOpen() {
   return _isOpen;
}

/* DOM Construction */

function _buildOverlay(item) {
   _overlay = document.createElement('div');
   _overlay.className = 'quran-reader-overlay';
   _overlay.id = 'quran-reader-overlay';

   // Header
   let titleStr = '';
   let ariaLabelStr = '';
   if (_currentType === 'juz') {
      titleStr = `Juz ${parseInt(item.index)}`;
      ariaLabelStr = `Pilih Juz (Saat ini Juz ${parseInt(item.index)})`;
   } else {
      titleStr = `${parseInt(item.index)}. ${item.title}`;
      ariaLabelStr = `Pilih Surah (Saat ini Surah ${item.title})`;
   }

   _readerHeaderInstance = QuranHeader.createHeader({
      title: titleStr,
      onBack: close,
      titleClickable: true,
      onTitleClick: _openSurahPicker,
      titleAriaLabel: ariaLabelStr,
      hasSearchInput: true,
      searchPlaceholder: 'Nomor ayat...',
      searchInputType: 'number',
      searchInputMode: 'numeric',
      onSearchInput: _onSearchInput,
      rightBtnIcon: 'bx-search',
      rightBtnAriaLabel: 'Cari ayat',
      onRightBtnClick: _toggleReaderSearch
   });

   // Scroll content area
   _scrollContainer = document.createElement('div');
   _scrollContainer.className = 'quran-reader-scroll';

   // Delegated click handler — avoids per-card addEventListener overhead
   _scrollContainer.addEventListener('click', _onScrollContainerClick);

   // Loading state
   QuranCard.renderLoadingState(_scrollContainer);

   _overlay.appendChild(_readerHeaderInstance.element);
   _overlay.appendChild(_scrollContainer);

   // Mount into the quran-page
   _quranPage.appendChild(_overlay);
}

/* Picker Logic */

function _openSurahPicker() {
   const isJuz = _currentType === 'juz';

   openPicker({
      title: isJuz ? 'Pilih Juz' : 'Pilih Surah',
      data: isJuz ? getJuzList() : getSurahList(),
      createCardFn: isJuz ? QuranCard.createJuzCard : QuranCard.createSurahCard,
      isActiveFn: (item) => item.index === _currentItem.index,
      activeClass: isJuz ? 'active-juz' : 'active-surah',
      onSelect: (selectedItem) => {
         if (selectedItem.index !== _currentItem.index) {
            _changeItem(selectedItem);
         }
      },
      container: _quranPage
   });
}

function _changeItem(newItem) {
   _currentItem = newItem;

   // Update title
   if (_readerHeaderInstance) {
      if (_currentType === 'juz') {
         _readerHeaderInstance.setTitle(`Juz ${parseInt(newItem.index)}`);
      } else {
         _readerHeaderInstance.setTitle(`${parseInt(newItem.index, 10)}. ${newItem.title}`);
      }
   }

   // Reset scroll container to loading state
   if (_scrollContainer) {
      QuranCard.renderLoadingState(_scrollContainer);
      _scrollContainer.scrollTop = 0;
   }

   // Cancel any in-flight renders and fetch new data
   _renderCtx.incrementAndGet();
   _fetchAndRender(newItem);
}

async function _fetchAndRender(item) {
   _renderCtx.setContainer(_scrollContainer);
   const renderId = _renderCtx.incrementAndGet();

   try {
      const itemsToRender = [];

      if (_currentType === 'juz') {
         const surahList = await getSurahList();
         const startSurahIndex = parseInt(item.start.index, 10);
         const endSurahIndex = parseInt(item.end.index, 10);
         const startVerseNum = parseInt(item.start.verse.replace('verse_', ''), 10);
         const endVerseNum = parseInt(item.end.verse.replace('verse_', ''), 10);

         // Fetch all surahs spanned by this juz in parallel chunks
         const fetchPromises = [];
         for (let i = startSurahIndex; i <= endSurahIndex; i++) {
            fetchPromises.push(getFullSurahPayload(i));
         }
         const allPayloads = await Promise.all(fetchPromises);

         if (_renderCtx.shouldCancelRender(renderId)) return;

         for (let i = 0; i < allPayloads.length; i++) {
            const surahIndex = startSurahIndex + i;
            const surahMeta = surahList.find(s => parseInt(s.index, 10) === surahIndex);
            const [surahData, transData, tajData] = allPayloads[i];

            itemsToRender.push({ type: 'banner', surah: surahMeta });

            let verses = _buildAyahList(surahData, transData, tajData, surahMeta);

            if (surahIndex === startSurahIndex) {
               verses = verses.filter(v => v.number === 0 || v.number >= startVerseNum);
            }
            if (surahIndex === endSurahIndex) {
               verses = verses.filter(v => v.number === 0 || v.number <= endVerseNum);
            }

            verses.forEach(v => itemsToRender.push({ type: 'ayah', data: v }));
         }
      } else {
         // Standard Surah render mode
         const [surahData, transData, tajData] = await getFullSurahPayload(parseInt(item.index));

         if (_renderCtx.shouldCancelRender(renderId)) return;

         itemsToRender.push({ type: 'banner', surah: item });
         const verses = _buildAyahList(surahData, transData, tajData, item);
         verses.forEach(v => itemsToRender.push({ type: 'ayah', data: v }));
      }

      // Store processed data for search filtering
      _currentReaderData = itemsToRender;

      // Render to DOM
      await _renderItems(itemsToRender, renderId, true);

      // Deep-link: scroll to target verse if requested
      if (_targetVerseNumber && _scrollContainer) {
         const targetNum = _targetVerseNumber;
         _targetVerseNumber = null;
         requestAnimationFrame(() => {
            requestAnimationFrame(() => {
               const targetCard = _scrollContainer.querySelector(
                  `.quran-ayah-card[data-ayah-number="${targetNum}"]`
               );
               if (targetCard) {
                  const header = _overlay?.querySelector('.quran-unified-header');
                  const headerHeight = header ? header.offsetHeight : 0;
                  const scrollTarget = targetCard.offsetTop - headerHeight - 12;

                  _scrollContainer.scrollTo({
                     top: Math.max(0, scrollTarget),
                     behavior: 'smooth'
                  });
               }
            });
         });
      }

   } catch (error) {
      console.error('[QuranReader] Error loading data:', error);
      if (!_renderCtx.shouldCancelRender(renderId) && _scrollContainer) {
         QuranCard.renderErrorState(_scrollContainer, "Gagal Memuat Data");
      }
   }
}

/* Ayah Data Processing */

function _buildAyahList(surahData, translationData, tajweedData, surahMeta) {
   const verseObj = surahData.verse || {};
   const transObj = translationData.verse || {};
   const ayahList = [];

   // V8/JSC return integer-like string keys in ascending numeric order,
   // so Object.keys already gives us sorted verse keys without explicit sort.
   const verseKeys = Object.keys(verseObj);

   verseKeys.forEach(key => {
      const verseNum = parseInt(key.replace('verse_', ''));
      const rawArabic = verseObj[key] || '';
      const cleanArabic = rawArabic.replace(/^[\uFEFF\u200B]+/, '');

      ayahList.push({
         key,
         number: verseNum,
         isBismillah: verseNum === 0,
         arabic: cleanArabic,
         translation: transObj[key] || '',
         tajweedRules: getVerseRules(tajweedData, key),
         surahIndex: parseInt(surahMeta.index),
         surahName: surahMeta.title,
         surahTitleAr: surahMeta.titleAr || '',
         surahType: surahMeta.type || ''
      });
   });

   return ayahList;
}

/* Surah Banner Creation */

function _createSurahBannerElement(surah) {
   const surahNum = parseInt(surah.index);
   const typeText = surah.type === 'Makkiyah' ? 'Makkiyah' : 'Madaniyah';

   const banner = document.createElement('div');
   banner.className = 'quran-reader-surah-info';
   // Additional margin to space out multiple banners inside Juz mode
   banner.style.marginTop = '2rem';
   banner.style.marginBottom = '1.5rem';
   banner.innerHTML = `
      <div class="quran-reader-surah-name-ar">${surah.titleAr}</div>
      <div class="quran-reader-surah-meta">
         <span>${typeText}</span>
         <span class="quran-reader-meta-dot"></span>
         <span>${surah.count} Ayat</span>
      </div>
      <div class="quran-reader-divider"></div>
   `;

   return banner;
}

/* Ayah DOM Creation */

function _createAyahElement(ayah) {
   if (ayah.isBismillah) {
      return _createBismillahElement(ayah);
   }
   return _createRegularAyahElement(ayah);
}

function _createBismillahElement(ayah) {
   const el = document.createElement('div');
   el.className = 'quran-ayah-bismillah';

   const textEl = document.createElement('div');
   textEl.className = 'quran-ayah-bismillah-text';
   textEl.textContent = ayah.arabic;

   el.appendChild(textEl);
   return el;
}

function _createRegularAyahElement(ayah) {
   const card = document.createElement('div');
   card.className = 'quran-ayah-card';
   card.dataset.ayahNumber = ayah.number;
   card.dataset.surahIndex = ayah.surahIndex;

   // Header with ayah number + action buttons
   const header = document.createElement('div');
   header.className = 'quran-ayah-header';

   const numberBadge = document.createElement('span');
   numberBadge.className = 'quran-ayah-number';
   numberBadge.textContent = ayah.number;

   // Action buttons container (right side)
   const actions = document.createElement('div');
   actions.className = 'quran-ayah-actions';

   // Copy button — no inline listener, handled via delegation
   const copyBtn = document.createElement('button');
   copyBtn.className = 'quran-ayah-action-btn';
   copyBtn.setAttribute('aria-label', 'Salin ayat');
   copyBtn.dataset.action = 'copy';
   copyBtn.innerHTML = `<i class='bx bx-copy-alt'></i>`;

   // Bookmark button — no inline listener, handled via delegation
   const bookmarkBtn = document.createElement('button');
   bookmarkBtn.className = 'quran-ayah-action-btn';
   bookmarkBtn.setAttribute('aria-label', 'Tandai ayat');
   bookmarkBtn.dataset.action = 'bookmark';

   // Set initial bookmark icon state
   const isMarked = BookmarkManager.isBookmarkedSync(ayah.surahIndex, ayah.number);
   bookmarkBtn.innerHTML = isMarked
      ? `<i class='bx bxs-bookmark-alt'></i>`
      : `<i class='bx bx-bookmark-alt'></i>`;
   if (isMarked) bookmarkBtn.classList.add('bookmarked');

   actions.appendChild(copyBtn);
   actions.appendChild(bookmarkBtn);

   header.appendChild(numberBadge);
   header.appendChild(actions);

   // Arabic text
   const arabicEl = document.createElement('div');
   arabicEl.className = 'quran-ayah-arabic';

   if (ayah.tajweedRules?.length) {
      arabicEl.appendChild(buildTajweedFragment(ayah.arabic, ayah.tajweedRules));
   } else {
      arabicEl.textContent = ayah.arabic;
   }

   // Translation
   const translationEl = document.createElement('div');
   translationEl.className = 'quran-ayah-translation';
   translationEl.textContent = ayah.translation;

   card.appendChild(header);
   card.appendChild(arabicEl);
   card.appendChild(translationEl);

   return card;
}

/* Shared Render Helper */

async function _renderItems(data, renderId, isInitialLoad = false) {
   if (_scrollContainer) {
      _scrollContainer.innerHTML = '';
   }

   if (!data.length) {
      _renderNoResults();
      return;
   }

   await renderBatchedList({
      data,
      container: _scrollContainer,
      listCreatorFn: () => {
         const list = document.createElement('div');
         list.className = 'quran-reader-ayah-list';
         return list;
      },
      onCheckCancel: () => _renderCtx.shouldCancelRender(renderId),
      batchSize: 20,
      createItemFn: (itemDesc, index, isInitialBatch) => {
         const el = itemDesc.type === 'banner'
            ? _createSurahBannerElement(itemDesc.surah)
            : _createAyahElement(itemDesc.data);
         if (isInitialLoad && isInitialBatch) {
            el.style.animationDelay = `${index * 0.025}s`;
         } else {
            el.style.animation = 'none';
            el.style.opacity = '1';
         }
         return el;
      }
   });
}

function _renderNoResults() {
   if (!_scrollContainer) return;
   _scrollContainer.innerHTML = `
      <div class="quran-reader-no-results">
         <i class='bx bx-search-alt'></i>
         <p>Ayat tidak ditemukan</p>
      </div>
   `;
}

/* Verse Search Logic */

function _toggleReaderSearch() {
   if (_isReaderSearchActive) {
      _exitReaderSearch();
   } else {
      _enterReaderSearch();
   }
}

function _enterReaderSearch() {
   if (_isReaderSearchActive) return;
   _isReaderSearchActive = true;

   if (_readerHeaderInstance) {
      _readerHeaderInstance.toggleSearchMode(true);
      _readerHeaderInstance.setRightIcon('bx-x');
      const input = _readerHeaderInstance.getSearchInput();
      if (input) setTimeout(() => input.focus(), 300);
   }

   registerModalDismiss(_exitReaderSearch);
}

function _exitReaderSearch() {
   if (!_isReaderSearchActive) return;
   _isReaderSearchActive = false;

   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   unregisterModalDismiss(_exitReaderSearch);

   if (_readerHeaderInstance) {
      _readerHeaderInstance.toggleSearchMode(false);
      _readerHeaderInstance.setRightIcon('bx-search');
      const input = _readerHeaderInstance.getSearchInput();
      if (input) input.value = '';
   }

   // Re-render full data
   if (_currentReaderData.length) {
      const renderId = _renderCtx.incrementAndGet();
      _renderItems(_currentReaderData, renderId);
   }
}

function _onSearchInput(e) {
   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   const query = e.target.value.trim();

   _searchDebounceTimer = setTimeout(() => {
      _filterVerses(query);
   }, 250);
}

function _filterVerses(query) {
   const renderId = _renderCtx.incrementAndGet();

   if (!query) {
      // Show all
      _renderItems(_currentReaderData, renderId);
      return;
   }

   // Filter ayahs matching the verse number
   const matchedAyahs = _currentReaderData.filter(
      item => item.type === 'ayah' && !item.data.isBismillah && item.data.number.toString() === query
   );

   if (!matchedAyahs.length) {
      _renderItems([], renderId);
      return;
   }

   // Build result list with contextual surah banners
   const results = [];
   let lastSurahIndex = null;

   matchedAyahs.forEach(ayahItem => {
      const surahIdx = ayahItem.data.surahIndex;

      // Insert banner if surah changed (important for Juz mode with multi-surah)
      if (surahIdx !== lastSurahIndex) {
         const banner = _currentReaderData.find(
            b => b.type === 'banner' && parseInt(b.surah.index) === surahIdx
         );
         if (banner) results.push(banner);
         lastSurahIndex = surahIdx;
      }

      results.push(ayahItem);
   });

   _renderItems(results, renderId);
}

/* Delegated Click Handler */

/**
 * Single delegated handler on _scrollContainer — replaces per-card listeners.
 * Looks up action buttons by data-action attribute and resolves the ayah
 * from _currentReaderData using the card's data attributes.
 */
function _onScrollContainerClick(e) {
   const btn = e.target.closest('.quran-ayah-action-btn');
   if (!btn) return;

   e.stopPropagation();

   const card = btn.closest('.quran-ayah-card');
   if (!card) return;

   const ayahNumber = parseInt(card.dataset.ayahNumber, 10);
   const surahIndex = parseInt(card.dataset.surahIndex, 10);

   // Find the ayah data from the current reader data set
   const ayahItem = _currentReaderData.find(
      item => item.type === 'ayah' && item.data.number === ayahNumber && item.data.surahIndex === surahIndex
   );
   if (!ayahItem) return;

   const action = btn.dataset.action;
   if (action === 'copy') {
      _handleCopyAyah(ayahItem.data, btn);
   } else if (action === 'bookmark') {
      _handleToggleBookmark(ayahItem.data, btn);
   }
}

/* Clipboard Logic */

function _handleCopyAyah(ayah, btnEl) {
   const text = `${ayah.arabic}\n\n${ayah.translation}\n\n— QS. ${ayah.surahName}: ${ayah.number}`;

   navigator.clipboard.writeText(text).then(() => {
      // Visual feedback
      const icon = btnEl.querySelector('i');
      btnEl.classList.add('copied');
      if (icon) icon.className = 'bx bx-check';

      setTimeout(() => {
         btnEl.classList.remove('copied');
         if (icon) icon.className = 'bx bx-copy-alt';
      }, 1500);
   }).catch(err => {
      console.warn('[QuranReader] Failed to copy:', err);
   });
}

/* Bookmark Logic */

async function _handleToggleBookmark(ayah, btnEl) {
   const isNowBookmarked = await BookmarkManager.toggle({
      surahIndex: ayah.surahIndex,
      surahName: ayah.surahName,
      surahTitleAr: ayah.surahTitleAr,
      verseNumber: ayah.number,
      type: ayah.surahType
   });

   const icon = btnEl.querySelector('i');

   if (isNowBookmarked) {
      btnEl.classList.add('bookmarked');
      if (icon) icon.className = 'bx bxs-bookmark-alt';
      Notification.success(`QS. ${ayah.surahName}: ${ayah.number} ditandai`);
   } else {
      btnEl.classList.remove('bookmarked');
      if (icon) icon.className = 'bx bx-bookmark-alt';
      Notification.info(`Tanda dihapus`);
   }
}
