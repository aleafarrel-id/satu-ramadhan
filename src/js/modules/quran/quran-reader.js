/**
 * Al-Quran Reader Module
 * Handles the surah reading overlay with Arabic text + Indonesian translation.
 */

import * as QuranDock from '../../components/quran/quran-dock.js';
import * as QuranCard from '../../components/quran/quran-card.js';
import { renderBatchedList, createRenderContext } from './quran-utility.js';
import { makeAccessibleBtn } from '../../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../system/back-handler.js';
import { fetchTajweedData, buildTajweedFragment, getVerseRules, initTajweedTooltip, dismissTajweedTooltip } from './quran-tajweed.js';

/* ── State ── */

let _isOpen = false;
let _isPickerOpen = false;
let _currentSurah = null;
let _overlay = null;
let _pickerOverlay = null;
let _scrollContainer = null;
let _quranPage = null;
let _surahListCache = null;
const _renderCtx = createRenderContext();

/* ── Public API ── */

/**
 * Open the reader overlay for a specific surah.
 * @param {Object} surah — Surah metadata from surah.json (has index, title, titleAr, count, type)
 */
export async function open(surah) {
   if (_isOpen) return;
   _isOpen = true;
   _currentSurah = surah;

   _quranPage = document.querySelector('.quran-page');
   if (!_quranPage) return;

   // Hide dock
   QuranDock.hide();

   // Build & mount overlay
   _buildOverlay(surah);

   // Register back handler
   registerModalDismiss(close);

   // Pre-fetch surah list for dropdown if not cached
   if (!_surahListCache) {
      try {
         const res = await fetch('/quran/surah.json');
         if (res.ok) {
            _surahListCache = await res.json();
         }
      } catch (err) {
         console.warn('[QuranReader] Failed to load surah list for dropdown', err);
      }
   }

   // Animate in
   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_overlay) _overlay.classList.add('active');
         // Add class to hide main quran content behind
         _quranPage.classList.add('is-reading');
         // Initialize tooltip delegation for mobile tap support
         initTajweedTooltip(_scrollContainer);
      });
   });

   // Fetch and render data
   await _fetchAndRender(surah);
}

/**
 * Close the reader overlay, restoring dock and header.
 */
export function close() {
   if (!_isOpen) return;
   _isOpen = false;

   unregisterModalDismiss(close);

   // Cancel any in-flight renders
   _renderCtx.incrementAndGet();

   _closeSurahPicker();
   dismissTajweedTooltip();

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
      _currentSurah = null;
   }, 400);
}

/**
 * Cleanup — called when quran-page.js is destroyed.
 */
export function destroy() {
   if (_isOpen) {
      // Fast close without animation
      _isOpen = false;
      _isPickerOpen = false;
      _renderCtx.incrementAndGet();
      unregisterModalDismiss(close);
      unregisterModalDismiss(_closeSurahPicker);
      dismissTajweedTooltip();
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
      _currentSurah = null;
      _quranPage = null;
   }
}

/**
 * Check if reader is currently open.
 */
export function isOpen() {
   return _isOpen;
}

/* ── Private: Build Overlay DOM ── */

function _buildOverlay(surah) {
   const surahNum = parseInt(surah.index);

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
   titleWrapper.setAttribute('aria-label', `Pilih Surah (Saat ini Surah ${surah.title})`);

   const titleText = document.createElement('span');
   titleText.className = 'quran-reader-title';
   titleText.textContent = `${surahNum}. ${surah.title}`;

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
   _scrollContainer.innerHTML = `
      <div class="quran-reader-loading">
         <i class='bx bx-book-reader'></i>
         <p>Memuat</p>
      </div>
   `;

   _overlay.appendChild(header);
   _overlay.appendChild(_scrollContainer);

   // Mount into the quran-page
   _quranPage.appendChild(_overlay);
}

/* ── Private: Surah Picker Overlay ── */

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
      backBtn.setAttribute('aria-label', 'Tutup daftar surah');
      backBtn.innerHTML = `<i class='bx bx-x'></i>`;
      makeAccessibleBtn(backBtn, _closeSurahPicker);
      
      const title = document.createElement('div');
      title.className = 'quran-reader-picker-title';
      title.textContent = 'Pilih Surah';
      
      const spacer = document.createElement('div');
      spacer.className = 'quran-reader-header-spacer';
      
      header.appendChild(backBtn);
      header.appendChild(title);
      header.appendChild(spacer);

      const content = document.createElement('div');
      content.className = 'quran-reader-picker-content';

      const surahList = document.createElement('div');
      surahList.className = 'surah-list'; // Reusing front page styles

      _pickerOverlay.appendChild(header);
      _pickerOverlay.appendChild(content);
      content.appendChild(surahList);
      
      _quranPage.appendChild(_pickerOverlay);
      
      // Populate list
      if (_surahListCache) {
         _renderPickerList(surahList);
      } else {
         QuranCard.renderLoadingState(content);
         fetch('/quran/surah.json').then(res => res.json()).then(data => {
            _surahListCache = data;
            content.innerHTML = '';
            content.appendChild(surahList);
            _renderPickerList(surahList);
         }).catch(err => {
            QuranCard.renderErrorState(content, "Gagal memuat daftar surah");
         });
      }
   }

   registerModalDismiss(_closeSurahPicker);
   
   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_pickerOverlay) _pickerOverlay.classList.add('active');
         
         // Scroll to active surah if necessary
         const activeCard = _pickerOverlay.querySelector('.surah-card.active-surah');
         if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'auto', block: 'center' });
         }
      });
   });
}

function _renderPickerList(container) {
   container.innerHTML = '';
   _surahListCache.forEach(surah => {
      const card = QuranCard.createSurahCard(surah, (selectedSurah) => {
         if (selectedSurah.index !== _currentSurah.index) {
            _changeSurah(selectedSurah);
            
            // Update active state in picker
            const allCards = _pickerOverlay.querySelectorAll('.surah-card');
            allCards.forEach(c => c.classList.remove('active-surah'));
            card.classList.add('active-surah');
         }
         _closeSurahPicker();
      });
      
      if (surah.index === _currentSurah.index) {
         card.classList.add('active-surah');
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

function _changeSurah(newSurah) {
   _currentSurah = newSurah;

   // Update title
   if (_overlay) {
      const titleText = _overlay.querySelector('.quran-reader-title');
      if (titleText) {
         titleText.textContent = `${parseInt(newSurah.index, 10)}. ${newSurah.title}`;
      }
   }

   // Reset scroll container to loading state
   if (_scrollContainer) {
      // Unmount old chunks by resetting HTML 
      _scrollContainer.innerHTML = `
         <div class="quran-reader-loading">
            <i class='bx bx-book-reader'></i>
            <p>Memuat</p>
         </div>
      `;
      _scrollContainer.scrollTop = 0;
   }

   // Cancel any in-flight renders and fetch new data
   _renderCtx.incrementAndGet();
   _fetchAndRender(newSurah);
}

/* ── Private: Fetch Data & Render ── */

async function _fetchAndRender(surah) {
   const surahIndex = parseInt(surah.index);
   _renderCtx.setContainer(_scrollContainer);
   const renderId = _renderCtx.incrementAndGet();

   try {
      // Fetch Arabic text, Indonesian translation, and Tajweed data in parallel
      const [surahData, translationData, tajweedData] = await Promise.all([
         fetch(`/quran/surah/surah_${surahIndex}.json`).then(r => {
            if (!r.ok) throw new Error(`Failed to fetch surah ${surahIndex}`);
            return r.json();
         }),
         fetch(`/quran/translation/id/id_translation_${surahIndex}.json`).then(r => {
            if (!r.ok) throw new Error(`Failed to fetch translation ${surahIndex}`);
            return r.json();
         }),
         fetchTajweedData(surahIndex)
      ]);

      // Check if render was cancelled
      if (_renderCtx.shouldCancelRender(renderId)) return;

      // Build merged ayah array
      const ayahList = _buildAyahList(surahData, translationData, tajweedData, surah);

      // Clear loading state
      if (_scrollContainer) {
         _scrollContainer.innerHTML = '';
      }

      // Render surah info banner
      _renderSurahBanner(surah);

      // Render ayahs with batched rendering
      await renderBatchedList({
         data: ayahList,
         container: _scrollContainer,
         listCreatorFn: () => {
            const list = document.createElement('div');
            list.className = 'quran-reader-ayah-list';
            return list;
         },
         onCheckCancel: () => _renderCtx.shouldCancelRender(renderId),
         batchSize: 20,
         createItemFn: (ayah, index, isInitialBatch) => {
            const el = _createAyahElement(ayah);
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
      console.error('[QuranReader] Error loading surah:', error);
      if (!_renderCtx.shouldCancelRender(renderId) && _scrollContainer) {
         _scrollContainer.innerHTML = `
            <div class="quran-reader-error">
               <i class='bx bx-error-circle'></i>
               <p>Gagal Memuat Surah</p>
            </div>
         `;
      }
   }
}

/* ── Private: Build Ayah Data ── */

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
      ayahList.push({
         key,
         number: verseNum,
         isBismillah: verseNum === 0,
         arabic: verseObj[key],
         translation: transObj[key] || '',
         tajweedRules: getVerseRules(tajweedData, key),
         surahIndex: parseInt(surahMeta.index),
         surahName: surahMeta.title
      });
   });

   return ayahList;
}

/* ── Private: Render Surah Info Banner ── */

function _renderSurahBanner(surah) {
   if (!_scrollContainer) return;

   const surahNum = parseInt(surah.index);
   const typeText = surah.type === 'Makkiyah' ? 'Makkiyah' : 'Madaniyah';

   const banner = document.createElement('div');
   banner.className = 'quran-reader-surah-info';
   banner.innerHTML = `
      <div class="quran-reader-surah-name-ar">${surah.titleAr}</div>
      <div class="quran-reader-surah-meta">
         <span>${typeText}</span>
         <span class="quran-reader-meta-dot"></span>
         <span>${surah.count} Ayat</span>
      </div>
      <div class="quran-reader-divider"></div>
   `;

   _scrollContainer.appendChild(banner);
}

/* ── Private: Create Ayah DOM Element ── */

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

/* ── Private: Copy Ayah to Clipboard ── */

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
