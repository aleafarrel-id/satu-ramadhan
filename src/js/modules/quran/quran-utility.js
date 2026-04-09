/**
 * Quran Utility Module
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import { safeClear } from '../../utils/dom-utils.js';
import { t } from '../../core/i18n.js';

/**
 * Renders items in two phases for optimal perceived performance.
 *
 * Synchronous pass renders `batchSize × initialBatchCount` items immediately
 * to fill the viewport. A single rAF then appends all remaining items as one
 * DocumentFragment — one DOM mutation, one reflow. CSS `content-visibility: auto`
 * on list items ensures off-screen cards incur near-zero layout/paint cost.
 */
export async function renderBatchedList({
   data,
   container,
   createItemFn,
   onCheckCancel,
   batchSize = 25,
   listCreatorFn,
   initialBatchCount = 1,
}) {
   if (!data || !container) return;

   safeClear(container, '.custom-ptr, .quran-loading');

   const list = listCreatorFn();
   container.appendChild(list);

   const total = data.length;
   const initialEnd = Math.min(batchSize * initialBatchCount, total);

   const initFrag = document.createDocumentFragment();
   for (let i = 0; i < initialEnd; i++) {
      if (onCheckCancel?.()) return;
      initFrag.appendChild(createItemFn(data[i], i, true));
   }
   list.appendChild(initFrag);

   if (initialEnd >= total) return;

   const rafId = requestAnimationFrame(() => {
      container.__quranRenderCancel = null;
      if (onCheckCancel?.()) return;

      const restFrag = document.createDocumentFragment();
      for (let i = initialEnd; i < total; i++) {
         restFrag.appendChild(createItemFn(data[i], i, false));
      }
      list.appendChild(restFrag);
   });

   container.__quranRenderCancel = () => cancelAnimationFrame(rafId);
}

/** Normalises a string for search comparison. */
export const normalizeSearchText = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Creates a render context for stale-render cancellation via render IDs.
 */
export function createRenderContext() {
   let counter = 0;
   let container = null;

   return {
      setContainer: (el) => { container = el; },
      getContainer: () => container,
      incrementAndGet: () => ++counter,
      getCurrentId: () => counter,
      shouldCancelRender: (id) => id !== counter || !container,
      destroy: () => { container = null; counter++; },
   };
}

/**
 * Factory for generic Quran subpages (Surah list, Juz list, etc.).
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
            .then(data => { _data = data; _dataPromise = null; })
            .catch(err => { _dataPromise = null; throw err; });
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
               _callbacks?.onItemSelected?.();
               onItemClick?.(selectedItem);
            });

            if (isInitialBatch) {
               card.style.animationDelay = `${absoluteIndex * 0.03}s`;
            } else {
               card.style.animation = 'none';
               card.style.opacity = '1';
            }
            return card;
         },
      });
   }

   return {
      render: async (container, callbacks = {}) => {
         _mainRenderCtx.setContainer(container);
         _callbacks = callbacks;
         const renderId = _mainRenderCtx.incrementAndGet();

         QuranCard.renderLoadingState(container);

         try {
            await loadData();
            if (!_mainRenderCtx.shouldCancelRender(renderId)) {
               await renderList(renderId, _mainRenderCtx.getContainer(), _data);
            }
         } catch (error) {
            console.error('Error loading subpage data:', error);
            if (!_mainRenderCtx.shouldCancelRender(renderId)) {
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
            searchCallbacks.renderPlaceholder?.(
               resultsContainer,
               t('components/quran/quran-search:not_found', { query }),
               'bx-info-circle',
            );
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
                  searchCallbacks.onItemSelected?.();
                  onItemClick?.(selectedItem);
               });
               card.style.opacity = '1';
               card.style.animation = 'none';
               return card;
            },
         });
      },

      onSearchExit: () => _searchRenderCtx.incrementAndGet(),

      destroy: async () => {
         _mainRenderCtx.destroy();
         _searchRenderCtx.destroy();
         _callbacks = null;
         _dataPromise = null;
      },
   };
}
