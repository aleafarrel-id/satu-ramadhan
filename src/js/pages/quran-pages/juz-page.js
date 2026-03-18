/**
 * Al-Quran Juz Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';

const JUZ_API_PATH = '/quran/juz.json';

let _container = null;
let _juzData = null;
let _callbacks = null;
let _currentRenderCounter = 0;

/**
 * Render subpage juz
 */
export async function render(container, callbacks = {}) {
   _container = container;
   _callbacks = callbacks;
   _currentRenderCounter++;
   const currentRenderId = _currentRenderCounter;

   QuranCard.renderLoadingState(_container);

   try {
      await loadJuzData();
      if (_container && currentRenderId === _currentRenderCounter) {
         await renderJuzListBatched(currentRenderId);
      }
   } catch (error) {
      console.error('Error loading Juz data:', error);
      if (_container && currentRenderId === _currentRenderCounter) {
         QuranCard.renderErrorState(_container);
      }
   }
}

/**
 * Fetch data juz
 */
async function loadJuzData() {
   if (_juzData) return;
   const response = await fetch(JUZ_API_PATH);
   if (!response.ok) {
      throw new Error('Failed to load juz data');
   }
   _juzData = await response.json();
}

/**
 * Validation if render process should be canceled
 */
const _shouldCancelRender = (renderId) => renderId !== _currentRenderCounter || !_container;

/**
 * Render juz list batched
 */
async function renderJuzListBatched(renderId) {
   if (!_juzData || !_container) return;

   await _renderBatchedList({
      data: _juzData,
      container: _container,
      onCheckCancel: () => _shouldCancelRender(renderId),
      createItemFn: (juz, absoluteIndex, isInitialBatch) => {
         const card = QuranCard.createJuzCard(juz, handleJuzClick);
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

   const listContainer = QuranCard.createJuzList();
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
function handleJuzClick(juz) {
   console.log('Juz clicked:', juz.index);
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

   if (!_juzData) return;

   const normalizedQuery = _normalizeSearchText(query);
   const queryLower = query.toLowerCase();

   const filtered = _juzData.filter(j => {
      const jIndexNum = parseInt(j.index).toString();
      const startNameNormal = _normalizeSearchText(j.start.name);
      const endNameNormal = _normalizeSearchText(j.end.name);
      
      const isMatchIndex = jIndexNum === query || `juz${jIndexNum}` === normalizedQuery;

      return (normalizedQuery.length > 0 && (startNameNormal.includes(normalizedQuery) || endNameNormal.includes(normalizedQuery))) || isMatchIndex;
   });

   if (filtered.length === 0) {
      if (searchCallbacks.renderPlaceholder) {
         searchCallbacks.renderPlaceholder(resultsContainer, `Tidak ada juz "${query}"`, "bx-info-circle");
      }
      return;
   }

   await _renderBatchedList({
      data: filtered,
      container: resultsContainer,
      batchSize: 10,
      onCheckCancel: () => _shouldCancelRender(searchId),
      createItemFn: (juz) => {
         const card = QuranCard.createJuzCard(juz, (j) => {
            if (searchCallbacks.onItemSelected) searchCallbacks.onItemSelected();
            handleJuzClick(j);
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
