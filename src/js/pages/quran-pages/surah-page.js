/**
 * Al-Quran Surah Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';

let _container = null;
let _surahData = null;
let _callbacks = null;
let _currentRenderCounter = 0;

/**
 * Render subpage surah
 */
export async function render(container, callbacks = {}) {
   _container = container;
   _callbacks = callbacks;
   _currentRenderCounter++;
   const currentRenderId = _currentRenderCounter;

   QuranCard.renderLoadingState(_container);

   try {
      await loadSurahData();
      if (_container && currentRenderId === _currentRenderCounter) {
         await renderSurahListBatched(currentRenderId);
      }
   } catch (error) {
      console.error('Error loading Surah data:', error);
      if (_container && currentRenderId === _currentRenderCounter) {
         QuranCard.renderErrorState(_container);
      }
   }
}

/**
 * Fetch data surah
 */
async function loadSurahData() {
   if (_surahData) return;
   const response = await fetch('/quran/surah.json');
   if (!response.ok) {
      throw new Error('Failed to load surah data');
   }
   _surahData = await response.json();
}

/**
 * Validation if render process should be canceled
 */
const _shouldCancelRender = (renderId) => renderId !== _currentRenderCounter || !_container;

/**
 * Render surah list batched
 */
async function renderSurahListBatched(renderId) {
   if (!_surahData || !_container) return;

   await _renderBatchedList({
      data: _surahData,
      container: _container,
      onCheckCancel: () => _shouldCancelRender(renderId),
      createItemFn: (surah, absoluteIndex, isInitialBatch) => {
         const card = QuranCard.createSurahCard(surah, handleSurahClick);
         if (isInitialBatch) {
            card.style.animationDelay = `${absoluteIndex * 0.03}s`;
         } else {
            card.style.animation = 'none';
            card.style.opacity = '1';
         }
         return card;
      }
   });
}

/**
 * Generic batched rendering to avoid UI blocking
 */
async function _renderBatchedList({ data, container, createItemFn, onCheckCancel, batchSize = 25 }) {
   const existingList = container.querySelector('.surah-list');
   if (existingList) existingList.remove();
   const existingEmpty = container.querySelector('.quran-empty');
   if (existingEmpty) existingEmpty.remove();
   const existingPlaceholder = container.querySelector('.quran-search-placeholder');
   if (existingPlaceholder) existingPlaceholder.remove();

   const listContainer = QuranCard.createSurahList();
   container.appendChild(listContainer);

   const total = data.length;

   for (let i = 0; i < total; i += batchSize) {
      if (onCheckCancel()) return;

      const chunk = data.slice(i, i + batchSize);
      const fragment = document.createDocumentFragment();

      chunk.forEach((item, indexInChunk) => {
         const absoluteIndex = i + indexInChunk;
         const isInitialBatch = i < batchSize * 2;
         const card = createItemFn(item, absoluteIndex, isInitialBatch);
         fragment.appendChild(card);
      });

      listContainer.appendChild(fragment);

      if (i + batchSize < total) {
         await new Promise(resolve => {
            if (window.requestIdleCallback) window.requestIdleCallback(resolve);
            else setTimeout(resolve, 0);
         });
      }
   }
}

/**
 * Card click handler
 */
function handleSurahClick(surah) {
   console.log('Surah clicked:', surah.title, surah.index);
}

/**
 * Helper to normalize string for robust searching
 */
const _normalizeSearchText = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Search callback from skeleton
 */
export async function onSearch(query, resultsContainer, searchCallbacks = {}) {
   _currentRenderCounter++;
   const searchId = _currentRenderCounter;

   if (!_surahData) return;

   const normalizedQuery = _normalizeSearchText(query);
   const queryLower = query.toLowerCase();

   const filtered = _surahData.filter(s => {
      const sIndexNum = parseInt(s.index).toString();
      const sCountStr = s.count.toString();
      const lowerType = s.type.toLowerCase();
      const normalizedTitle = _normalizeSearchText(s.title);

      return (normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery)) ||
         s.titleAr.includes(query) ||
         lowerType.includes(queryLower) ||
         sIndexNum === query ||
         sCountStr === query;
   });

   if (filtered.length === 0) {
      if (searchCallbacks.renderPlaceholder) {
         searchCallbacks.renderPlaceholder(resultsContainer, `Tidak ada surah "${query}"`, "bx-info-circle");
      }
      return;
   }

   await _renderBatchedList({
      data: filtered,
      container: resultsContainer,
      batchSize: 10,
      onCheckCancel: () => _shouldCancelRender(searchId),
      createItemFn: (surah) => {
         const card = QuranCard.createSurahCard(surah, (s) => {
            if (searchCallbacks.onItemSelected) searchCallbacks.onItemSelected();
            handleSurahClick(s);
         });
         card.style.opacity = '1';
         card.style.animation = 'none';
         return card;
      }
   });
}

/**
 * When user exit search mode
 */
export function onSearchExit() {
   _currentRenderCounter++;
}

/**
 * Cleanup page
 */
export async function destroy() {
   _container = null;
   _callbacks = null;
   _currentRenderCounter++;
}
