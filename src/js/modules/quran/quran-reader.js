/**
 * Reader Module
 * Manages the overlay for reading Arabic text and translation.
 * Supports reading per Surah and per Juz.
 */

import * as QuranDock from '../../components/quran/quran-dock.js';
import * as QuranCard from '../../components/quran/quran-card.js';
import { renderBatchedList, createRenderContext } from './quran-utility.js';
import { makeAccessibleBtn } from '../../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../system/back-handler.js';
import { buildTajweedFragment, getVerseRules } from './quran-tajweed.js';
import { initTooltip, dismissTooltip } from '../../utils/tooltip.js';
import { getSurahList, getFullSurahPayload, getJuzList } from './quran-api.js';

/* Internal State */

let _isOpen = false;
let _isPickerOpen = false;
let _currentItem = null;
let _currentType = 'surah';
let _overlay = null;
let _pickerOverlay = null;
let _scrollContainer = null;
let _quranPage = null;
const _renderCtx = createRenderContext();

/* Public Interface */

/**
 * Opens the reader overlay for a given item (surah or juz).
 * @param {Object} item - Data object of the surah or juz
 * @param {string} type - 'surah' | 'juz'
 */
export async function open(item, type = 'surah') {
   if (_isOpen) return;
   _isOpen = true;
   _currentItem = item;
   _currentType = type;

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

   unregisterModalDismiss(close);

   // Cancel any in-flight renders
   _renderCtx.incrementAndGet();

   _closeSurahPicker();
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
      if (_pickerOverlay && _pickerOverlay.parentNode) {
         _pickerOverlay.parentNode.removeChild(_pickerOverlay);
      }
      _overlay = null;
      _pickerOverlay = null;
      _scrollContainer = null;
      _currentItem = null;
      _currentType = 'surah';
   }, 400);
}

/**
 * Cleans up on module destruction.
 */
export function destroy() {
   if (_isOpen) {
      // Fast close without animation
      _isOpen = false;
      _isPickerOpen = false;
      _renderCtx.incrementAndGet();
      unregisterModalDismiss(close);
      unregisterModalDismiss(_closeSurahPicker);
      dismissTooltip();
      if (_overlay && _overlay.parentNode) {
         _overlay.parentNode.removeChild(_overlay);
      }
      if (_pickerOverlay && _pickerOverlay.parentNode) {
         _pickerOverlay.parentNode.removeChild(_pickerOverlay);
      }
      if (_quranPage) {
         _quranPage.classList.remove('is-reading');
      }
      _overlay = null;
      _pickerOverlay = null;
      _scrollContainer = null;
      _currentItem = null;
      _currentType = 'surah';
      _quranPage = null;
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
   const header = document.createElement('div');
   header.className = 'quran-reader-header';

   // Back button
   const backBtn = document.createElement('button');
   backBtn.className = 'quran-reader-back';
   backBtn.setAttribute('aria-label', 'Kembali');
   backBtn.innerHTML = `<i class='bx bx-chevron-left'></i>`;
   makeAccessibleBtn(backBtn, close);

   // Title wrapper (container for dropdown)
   const titleWrapper = document.createElement('div');
   titleWrapper.className = 'quran-reader-title-wrapper';
   titleWrapper.setAttribute('role', 'button');
   titleWrapper.setAttribute('tabindex', '0');

   const titleText = document.createElement('span');
   titleText.className = 'quran-reader-title';

   if (_currentType === 'juz') {
      titleText.textContent = `Juz ${parseInt(item.index)}`;
      titleWrapper.setAttribute('aria-label', `Pilih Juz (Saat ini Juz ${parseInt(item.index)})`);
   } else {
      titleText.textContent = `${parseInt(item.index)}. ${item.title}`;
      titleWrapper.setAttribute('aria-label', `Pilih Surah (Saat ini Surah ${item.title})`);
   }

   const titleChevron = document.createElement('i');
   titleChevron.className = 'bx bx-chevron-down quran-reader-title-chevron';

   titleWrapper.addEventListener('click', _openSurahPicker);

   titleWrapper.appendChild(titleText);
   titleWrapper.appendChild(titleChevron);

   // Right spacer for symmetry
   const spacer = document.createElement('div');
   spacer.className = 'quran-reader-header-spacer';

   header.appendChild(backBtn);
   header.appendChild(titleWrapper);
   header.appendChild(spacer);

   // Scroll content area
   _scrollContainer = document.createElement('div');
   _scrollContainer.className = 'quran-reader-scroll';

   // Loading state
   QuranCard.renderLoadingState(_scrollContainer);

   _overlay.appendChild(header);
   _overlay.appendChild(_scrollContainer);

   // Mount into the quran-page
   _quranPage.appendChild(_overlay);
}

/* Picker Logic */

function _openSurahPicker() {
   if (_isPickerOpen) return;
   _isPickerOpen = true;

   if (!_pickerOverlay) {
      _pickerOverlay = document.createElement('div');
      _pickerOverlay.className = 'quran-reader-picker-overlay';

      const header = document.createElement('div');
      header.className = 'quran-reader-picker-header';

      const backBtn = document.createElement('button');
      backBtn.className = 'quran-reader-back';
      backBtn.setAttribute('aria-label', 'Tutup daftar');
      backBtn.innerHTML = `<i class='bx bx-x'></i>`;
      makeAccessibleBtn(backBtn, _closeSurahPicker);

      const title = document.createElement('div');
      title.className = 'quran-reader-picker-title';
      title.textContent = _currentType === 'juz' ? 'Pilih Juz' : 'Pilih Surah';

      const spacer = document.createElement('div');
      spacer.className = 'quran-reader-header-spacer';

      header.appendChild(backBtn);
      header.appendChild(title);
      header.appendChild(spacer);

      const content = document.createElement('div');
      content.className = 'quran-reader-picker-content';

      const listContainer = document.createElement('div');
      listContainer.className = 'surah-list'; // Reusing front page styles

      _pickerOverlay.appendChild(header);
      _pickerOverlay.appendChild(content);
      content.appendChild(listContainer);

      _quranPage.appendChild(_pickerOverlay);

      // Populate list
      const fetchPromise = _currentType === 'juz' ? getJuzList() : getSurahList();
      fetchPromise.then(data => {
         _renderPickerList(listContainer, data);
      }).catch(err => {
         QuranCard.renderErrorState(content, "Gagal memuat daftar");
      });
   }

   registerModalDismiss(_closeSurahPicker);

   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_pickerOverlay) _pickerOverlay.classList.add('active');

         // Scroll to active card if necessary
         const activeCard = _pickerOverlay.querySelector('.active-surah, .active-juz');
         if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'auto', block: 'center' });
         }
      });
   });
}

function _renderPickerList(container, listData) {
   container.innerHTML = '';
   listData.forEach(item => {
      const createFn = _currentType === 'juz' ? QuranCard.createJuzCard : QuranCard.createSurahCard;
      const card = createFn(item, (selectedItem) => {
         if (selectedItem.index !== _currentItem.index) {
            _changeItem(selectedItem);

            // Update active state in picker
            const allCards = _pickerOverlay.querySelectorAll('.surah-card, .juz-card');
            allCards.forEach(c => c.classList.remove('active-surah', 'active-juz'));
            card.classList.add(_currentType === 'juz' ? 'active-juz' : 'active-surah');
         }
         _closeSurahPicker();
      });

      if (item.index === _currentItem.index) {
         card.classList.add(_currentType === 'juz' ? 'active-juz' : 'active-surah');
      }
      container.appendChild(card);
   });
}

function _closeSurahPicker() {
   if (!_isPickerOpen) return;
   _isPickerOpen = false;
   unregisterModalDismiss(_closeSurahPicker);

   if (_pickerOverlay) {
      _pickerOverlay.classList.remove('active');
   }
}

function _changeItem(newItem) {
   _currentItem = newItem;

   // Update title
   if (_overlay) {
      const titleText = _overlay.querySelector('.quran-reader-title');
      if (titleText) {
         if (_currentType === 'juz') {
            titleText.textContent = `Juz ${parseInt(newItem.index)}`;
         } else {
            titleText.textContent = `${parseInt(newItem.index, 10)}. ${newItem.title}`;
         }
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

/* Data Fetching and Rendering */

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

      // Clear loading state
      if (_scrollContainer) {
         _scrollContainer.innerHTML = '';
      }

      // Render items with batched mechanism
      await renderBatchedList({
         data: itemsToRender,
         container: _scrollContainer,
         listCreatorFn: () => {
            const list = document.createElement('div');
            list.className = 'quran-reader-ayah-list';
            return list;
         },
         onCheckCancel: () => _renderCtx.shouldCancelRender(renderId),
         batchSize: 20,
         createItemFn: (itemDesc, index, isInitialBatch) => {
            const el = itemDesc.type === 'banner' ? _createSurahBannerElement(itemDesc.surah) : _createAyahElement(itemDesc.data);
            if (isInitialBatch) {
               el.style.animationDelay = `${index * 0.04}s`;
            } else {
               el.style.animation = 'none';
               el.style.opacity = '1';
            }
            return el;
         }
      });

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

   // Collect all verse keys and sort numerically
   const verseKeys = Object.keys(verseObj);
   verseKeys.sort((a, b) => {
      const numA = parseInt(a.replace('verse_', ''));
      const numB = parseInt(b.replace('verse_', ''));
      return numA - numB;
   });

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
         surahName: surahMeta.title
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

   // Header with ayah number + action buttons
   const header = document.createElement('div');
   header.className = 'quran-ayah-header';

   const numberBadge = document.createElement('span');
   numberBadge.className = 'quran-ayah-number';
   numberBadge.textContent = ayah.number;

   // Action buttons container (right side)
   const actions = document.createElement('div');
   actions.className = 'quran-ayah-actions';

   // Copy button
   const copyBtn = document.createElement('button');
   copyBtn.className = 'quran-ayah-action-btn';
   copyBtn.setAttribute('aria-label', 'Salin ayat');
   copyBtn.innerHTML = `<i class='bx bx-copy-alt'></i>`;
   copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _handleCopyAyah(ayah, copyBtn);
   });

   // Bookmark button
   const bookmarkBtn = document.createElement('button');
   bookmarkBtn.className = 'quran-ayah-action-btn';
   bookmarkBtn.setAttribute('aria-label', 'Tandai ayat');
   bookmarkBtn.innerHTML = `<i class='bx bx-bookmark-alt'></i>`;
   bookmarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Placeholder for bookmark functionality
   });

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
