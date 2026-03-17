/**
 * Al-Quran Page Component
 */

import * as QuranNav from '../modules/quran/quran-nav.js';
import * as QuranCard from '../components/quran/quran-card.js';
import { makeAccessibleBtn } from '../utils/a11y.js';

let _container = null;
let _quranContent = null;
let _surahData = null;

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
         <div class="quran-content" id="quran-content">
         </div>
         <div id="quran-dock-slot"></div>
      </div>
   `;

   // Setup header buttons

   const searchBtn = container.querySelector('.quran-search-btn');
   if (searchBtn) makeAccessibleBtn(searchBtn, () => console.log('Search clicked'));

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
 * Cleanup saat halaman ditinggalkan
 */
export async function destroy() {
   await QuranNav.exitQuranMode();

   _container = null;
   _quranContent = null;
   _surahData = null;
}