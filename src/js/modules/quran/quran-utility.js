/**
 * Quran Utility Module
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import { safeClear } from '../../utils/dom-utils.js';
import { t } from '../../core/i18n.js';

/**
 * Renders items in batches to prevent UI blocking.
 */
export async function renderBatchedList({ data, container, createItemFn, onCheckCancel, batchSize = 25, listCreatorFn, initialBatchCount = 1 }) {
   if (!data || !container) return;

   safeClear(container, '.custom-ptr, .quran-loading');

   const listContainer = listCreatorFn();
   container.appendChild(listContainer);

   const total = data.length;
   let currentIndex = 0;

   // Local helper to render exactly one chunk
   const renderNextChunk = () => {
      if (onCheckCancel && onCheckCancel()) return false;
      if (currentIndex >= total) return false;

      const chunk = data.slice(currentIndex, currentIndex + batchSize);
      const fragment = document.createDocumentFragment();

      chunk.forEach((item, indexInChunk) => {
         const absoluteIndex = currentIndex + indexInChunk;
         const isInitialBatch = absoluteIndex < batchSize * 2;
         const card = createItemFn(item, absoluteIndex, isInitialBatch);
         fragment.appendChild(card);
      });

      listContainer.appendChild(fragment);
      currentIndex += batchSize;

      return currentIndex < total;
   };

   // Render initial batches immediately (to fill screen, or satisfy deep links)
   let hasMore = true;
   for (let i = 0; i < initialBatchCount; i++) {
      if (!hasMore) break;
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 0));
      hasMore = renderNextChunk();
   }

   // Attach IntersectionObserver for Infinite Scrolling if data remains
   if (hasMore) {
      const sentinel = document.createElement('div');
      sentinel.className = 'quran-scroll-sentinel';
      sentinel.style.height = '40px';
      sentinel.style.width = '100%';
      listContainer.appendChild(sentinel);

      const observer = new IntersectionObserver((entries) => {
         if (entries[0].isIntersecting) {
            listContainer.removeChild(sentinel);

            if (renderNextChunk()) {
               listContainer.appendChild(sentinel);
            } else {
               // Finished all chunks natively
               observer.disconnect();
               container.__quranObserver = null;
            }
         }
      }, {
         root: container,
         rootMargin: '1200px',
         threshold: 0
      });

      observer.observe(sentinel);
      container.__quranObserver = observer;
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
               searchCallbacks.renderPlaceholder(resultsContainer, t('components/quran/quran-search:not_found', { query }), "bx-info-circle");
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
