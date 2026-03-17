/**
 * Al-Quran Page Component
 */

import * as QuranNav from '../modules/quran/quran-nav.js';
import * as QuranCard from '../components/quran/quran-card.js';
import { makeAccessibleBtn } from '../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../modules/system/back-handler.js';

let _container = null;
let _quranContent = null;
let _surahData = null;
let _searchQuery = '';
let _debounceTimer = null;
let _currentSearchId = 0;

const _dismissSearchAction = () => toggleSearchMode(false);

/**
 * Render halaman Al-Quran
 */
export async function render(container) {
   _container = container;

   container.innerHTML = `
      <div class="quran-page" id="quran-page-modal">
         <div class="quran-inline-header" data-focus-group="quran-header" data-focus-direction="horizontal">
            <button class="quran-back-btn quran-icon-btn" aria-label="Kembali" data-focus-item>
               <i class='bx bx-chevron-left'></i>
            </button>
            <h1 class="quran-header-title">Al-Qur'an</h1>
            <button class="quran-search-btn quran-icon-btn" aria-label="Cari Surah" data-focus-item>
               <i class='bx bx-search'></i>
            </button>
         </div>

         <div class="quran-search-overlay" id="quran-search-overlay">
            <div class="quran-search-header">
               <button class="quran-search-close quran-icon-btn" aria-label="Tutup Pencarian">
                  <i class='bx bx-chevron-left'></i>
               </button>
               <div class="quran-search-input-wrapper">
                  <i class='bx bx-search quran-search-icon'></i>
                  <input type="text" class="quran-search-input" placeholder="Cari surah..." autocomplete="off">
               </div>
            </div>
            <div class="quran-search-results" id="quran-search-results">
            </div>
         </div>

         <div class="quran-content" id="quran-content">
         </div>
         <div id="quran-dock-slot"></div>
      </div>
   `;

   const resultsEl = container.querySelector('#quran-search-results');
   renderSearchPlaceholder(resultsEl);

   // Setup header buttons
   const searchBtn = container.querySelector('.quran-search-btn');
   if (searchBtn) makeAccessibleBtn(searchBtn, () => toggleSearchMode(true));

   const closeSearchBtn = container.querySelector('.quran-search-close');
   if (closeSearchBtn) makeAccessibleBtn(closeSearchBtn, () => toggleSearchMode(false));

   const searchInput = container.querySelector('.quran-search-input');
   searchInput?.addEventListener('input', (e) => handleSearchInput(e.target.value));

   _quranContent = container.querySelector('#quran-content');
   QuranCard.renderLoadingState(_quranContent);
   QuranNav.init();

   const transitionPromise = QuranNav.enterQuranMode();

   try {
      await loadSurahData();
      await transitionPromise;
      await renderSurahListBatched();

      await new Promise(resolve => {
         requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
         });
      });

      _quranContent.classList.add('ready');
   } catch (error) {
      console.error('Error loading Quran data:', error);
      QuranCard.renderErrorState(_quranContent);
   }
}

/**
 * Load data surah dari JSON
 */
async function loadSurahData() {
   const response = await fetch('/quran/surah.json');
   if (!response.ok) {
      throw new Error('Failed to load surah data');
   }
   _surahData = await response.json();
}

/**
 * Render surah list in batches
 */
async function renderSurahListBatched() {
   if (!_surahData || !_quranContent) return;

   _quranContent.innerHTML = '';
   const surahListContainer = QuranCard.createSurahList();
   _quranContent.appendChild(surahListContainer);

   const batchSize = 25;
   const total = _surahData.length;

   for (let i = 0; i < total; i += batchSize) {
      const chunk = _surahData.slice(i, i + batchSize);
      const fragment = document.createDocumentFragment();

      chunk.forEach((surah, indexInChunk) => {
         const card = QuranCard.createSurahCard(surah, handleSurahClick);

         if (i < batchSize * 2) {
            const absoluteIndex = i + indexInChunk;
            card.style.animationDelay = `${absoluteIndex * 0.03}s`;
         } else {
            card.style.animation = 'none';
            card.style.opacity = '1';
         }

         fragment.appendChild(card);
      });

      surahListContainer.appendChild(fragment);

      if (i + batchSize < total) {
         await new Promise(resolve => {
            if (window.requestIdleCallback) {
               window.requestIdleCallback(resolve);
            } else {
               setTimeout(resolve, 0);
            }
         });
      }
   }
}

/**
 * Handle surah card click
 */
function handleSurahClick(surah) {
   console.log('Surah clicked:', surah.title, surah.index);
}

/**
 * Toggle search mode
 */
function toggleSearchMode(active) {
   const overlay = _container?.querySelector('#quran-search-overlay');
   const input = overlay?.querySelector('.quran-search-input');
   const results = overlay?.querySelector('#quran-search-results');

   if (active) {
      _container?.classList.add('is-searching');
      overlay?.classList.add('active');
      registerModalDismiss(_dismissSearchAction);
      setTimeout(() => input?.focus(), 350);
   } else {
      _container?.classList.remove('is-searching');
      overlay?.classList.remove('active');
      unregisterModalDismiss(_dismissSearchAction);
      _searchQuery = '';
      _currentSearchId++;
      if (input) input.value = '';
      renderSearchPlaceholder(results);
   }
}

/**
 * Handle search input with debounce
 */
function handleSearchInput(query) {
   if (_debounceTimer) clearTimeout(_debounceTimer);
   _searchQuery = query.trim().toLowerCase();

   const resultsEl = _container?.querySelector('#quran-search-results');
   if (!resultsEl) return;

   if (_searchQuery.length === 0) {
      renderSearchPlaceholder(resultsEl);
      return;
   }

   _debounceTimer = setTimeout(() => {
      renderSearchResults(resultsEl);
   }, 300);
}

/**
 * Render search placeholder or empty message
 */
function renderSearchPlaceholder(container, message = "Mulai ketik nama surah...", icon = "bx-search") {
   if (!container) return;
   container.innerHTML = `
      <div class="quran-search-placeholder">
         <i class='bx ${icon} quran-search-placeholder-icon'></i>
         <span>${message}</span>
      </div>
   `;
}

/**
 * Render filtered results (Batched for performance)
 */
async function renderSearchResults(container) {
   const searchId = ++_currentSearchId;
   const query = _searchQuery.toLowerCase();

   const filtered = _surahData.filter(s => {
      const sIndex = parseInt(s.index).toString();
      const sCount = s.count.toString();
      
      return s.title.toLowerCase().includes(query) ||
             sIndex === query ||
             s.titleAr.includes(query) ||
             s.type.toLowerCase().includes(query) ||
             sCount === query;
   });

   if (filtered.length === 0) {
      renderSearchPlaceholder(container, `Tidak ada surah "${_searchQuery}"`, "bx-info-circle");
      return;
   }

   container.innerHTML = '';
   const surahListContainer = QuranCard.createSurahList();
   container.appendChild(surahListContainer);

   const batchSize = 10;
   const total = filtered.length;

   for (let i = 0; i < total; i += batchSize) {
      if (searchId !== _currentSearchId) return;

      const chunk = filtered.slice(i, i + batchSize);
      const fragment = document.createDocumentFragment();

      chunk.forEach(surah => {
         const card = QuranCard.createSurahCard(surah, (s) => {
            toggleSearchMode(false);
            handleSurahClick(s);
         });
         card.style.opacity = '1';
         card.style.animation = 'none';
         fragment.appendChild(card);
      });

      surahListContainer.appendChild(fragment);

      if (i + batchSize < total) {
         await new Promise(resolve => {
            if (window.requestIdleCallback) {
               window.requestIdleCallback(resolve);
            } else {
               setTimeout(resolve, 0);
            }
         });
      }
   }
}

/**
 * Cleanup saat halaman ditinggalkan
 */
export async function destroy() {
   if (_debounceTimer) clearTimeout(_debounceTimer);
   unregisterModalDismiss(_dismissSearchAction);
   await QuranNav.exitQuranMode();

   _container = null;
   _quranContent = null;
   _surahData = null;
   _searchQuery = '';
}