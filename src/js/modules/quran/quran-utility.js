/**
 * Utility Module
 * Shared tools for Quran features.
 */

import * as QuranCard from '../../components/quran/quran-card.js';

/**
 * Renders items in batches to prevent UI blocking.
 */
export async function renderBatchedList({ data, container, createItemFn, onCheckCancel, batchSize = 25, listCreatorFn }) {
   if (!data || !container) return;

   const existingList = container.querySelector('.surah-list');
   if (existingList) existingList.remove();
   const existingEmpty = container.querySelector('.quran-empty');
   if (existingEmpty) existingEmpty.remove();
   const existingPlaceholder = container.querySelector('.quran-search-placeholder');
   if (existingPlaceholder) existingPlaceholder.remove();

   const listContainer = listCreatorFn();
   container.appendChild(listContainer);

   const total = data.length;

   for (let i = 0; i < total; i += batchSize) {
      if (onCheckCancel && onCheckCancel()) return;

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
 * Normalizes text for search indexing.
 */
export const normalizeSearchText = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Creates a render context to handle stale cycles.
 */
export function createRenderContext() {
   let currentRenderCounter = 0;
   let container = null;

   return {
      setContainer: (el) => { container = el; },
      getContainer: () => container,
      incrementAndGet: () => {
         currentRenderCounter++;
         return currentRenderCounter;
      },
      getCurrentId: () => currentRenderCounter,
      shouldCancelRender: (renderId) => renderId !== currentRenderCounter || !container,
      destroy: () => {
         container = null;
         currentRenderCounter++;
      }
   };
}

/**
 * Factory function for generic Quran subpages.
 */
export function createQuranSubpage({
   fetchDataFn,
   listCreatorFn,
   itemCardCreatorFn,
   filterFn,
   onItemClick,
}) {
   let _data = null;
   let _dataPromise = null;
   let _callbacks = null;
   const _mainRenderCtx = createRenderContext();
   const _searchRenderCtx = createRenderContext();

   async function loadData() {
      if (_data) return;
      if (!_dataPromise) {
         _dataPromise = fetchDataFn()
            .then(data => {
               _data = data;
               _dataPromise = null;
            })
            .catch(err => {
               _dataPromise = null;
               throw err;
            });
      }
      await _dataPromise;
   }

   async function renderList(renderId, container, data) {
      if (!data || !container) return;

      await renderBatchedList({
         data,
         container,
         listCreatorFn,
         onCheckCancel: () => _mainRenderCtx.shouldCancelRender(renderId),
         createItemFn: (item, absoluteIndex, isInitialBatch) => {
            const card = itemCardCreatorFn(item, (selectedItem) => {
               if (_callbacks?.onItemSelected) _callbacks.onItemSelected();
               if (onItemClick) onItemClick(selectedItem);
            });

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

   return {
      render: async (container, callbacks = {}) => {
         _mainRenderCtx.setContainer(container);
         _callbacks = callbacks;
         const currentRenderId = _mainRenderCtx.incrementAndGet();

         QuranCard.renderLoadingState(container);

         try {
            await loadData();
            if (!_mainRenderCtx.shouldCancelRender(currentRenderId)) {
               await renderList(currentRenderId, _mainRenderCtx.getContainer(), _data);
            }
         } catch (error) {
            console.error('Error loading subpage data:', error);
            if (!_mainRenderCtx.shouldCancelRender(currentRenderId)) {
               QuranCard.renderErrorState(container);
            }
         }
      },

      onSearch: async (query, resultsContainer, searchCallbacks = {}) => {
         _searchRenderCtx.setContainer(resultsContainer);
         const searchId = _searchRenderCtx.incrementAndGet();

         await loadData();
         if (!_data || _searchRenderCtx.shouldCancelRender(searchId)) return;

         const filtered = filterFn(_data, query);

         if (filtered.length === 0) {
            if (searchCallbacks.renderPlaceholder) {
               searchCallbacks.renderPlaceholder(resultsContainer, `Tidak ditemukan "${query}"`, "bx-info-circle");
            }
            return;
         }

         await renderBatchedList({
            data: filtered,
            container: resultsContainer,
            listCreatorFn,
            batchSize: 10,
            onCheckCancel: () => _searchRenderCtx.shouldCancelRender(searchId),
            createItemFn: (item) => {
               const card = itemCardCreatorFn(item, (selectedItem) => {
                  if (searchCallbacks.onItemSelected) searchCallbacks.onItemSelected();
                  if (onItemClick) onItemClick(selectedItem);
               });
               card.style.opacity = '1';
               card.style.animation = 'none';
               return card;
            }
         });
      },

      onSearchExit: () => {
         _searchRenderCtx.incrementAndGet();
      },

      destroy: async () => {
         _mainRenderCtx.destroy();
         _searchRenderCtx.destroy();
         _callbacks = null;
         _dataPromise = null;
      }
   };
}
