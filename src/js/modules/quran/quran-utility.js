/**
 * Quran Utility Module
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import { safeClear } from '../../utils/dom-utils.js';
import { t } from '../../core/i18n.js';
import { logError } from '../../utils/error-boundary.js';
import { escapeHtml } from '../../utils/sanitize.js';

import { getSurahList, getJuzList } from './quran-api.js';
import * as BookmarkManager from './bookmark-manager.js';
import * as Storage from '../../core/storage.js';

/* ── Banner Data Cache ── */
let _bannerCache = null;
let _bannerFetchPromise = null;

/**
 * Fetches and caches banner data (last-read bookmark + history) in memory.
 * Subsequent calls return the cached result instantly unless `forceRefresh` is true.
 * @param {boolean} [forceRefresh=false] - Bypass cache and re-read from IDB
 * @returns {Promise<{bookmark: Object|null, history: Object|null}>}
 */
export async function fetchBannerData(forceRefresh = false) {
   if (!forceRefresh && _bannerCache) return _bannerCache;

   // When force-refreshing, discard any in-flight promise so we always
   // start a fresh IDB read — prevents returning stale cached data.
   if (forceRefresh) {
      _bannerFetchPromise = null;
   }

   if (!_bannerFetchPromise) {
      const currentPromise = Promise.all([
         BookmarkManager.getByFolder('last_read').catch(() => []),
         Storage.get('quran_last_opened').catch(() => null)
      ]).then(([lastReadEntries, history]) => {
         // Only commit to cache if we are still the active fetch.
         // This prevents slow/stale fetches from overwriting a newer force-refresh.
         if (_bannerFetchPromise === currentPromise) {
            _bannerCache = {
               bookmark: lastReadEntries?.[0] ?? null,
               history: history ?? null
            };
            _bannerFetchPromise = null;
         }
         return {
            bookmark: lastReadEntries?.[0] ?? null,
            history: history ?? null
         };
      }).catch(() => {
         if (_bannerFetchPromise === currentPromise) {
            _bannerFetchPromise = null;
            _bannerCache = { bookmark: null, history: null };
         }
         return { bookmark: null, history: null };
      });

      _bannerFetchPromise = currentPromise;
   }

   return _bannerFetchPromise;
}

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
   bannerEl = null,
}) {
   if (!data || !container) return;

   safeClear(container, '.custom-ptr, .quran-loading');

   if (bannerEl) {
      container.appendChild(bannerEl);
   }

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
   bannerCreatorFn,
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

   async function renderList(renderId, container, data, bannerEl = null) {
      if (!data || !container) return;

      if (_mainRenderCtx.shouldCancelRender(renderId)) return;

      await renderBatchedList({
         data,
         container,
         listCreatorFn,
         bannerEl,
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

         const isDataLoaded = !!_data;

         // Debounce the loading spinner by 150ms so fast-resolving tabs
         // (cached data + cached banner) never flash a blank screen.
         let loadingTimer = null;
         if (!isDataLoaded) {
            loadingTimer = setTimeout(() => {
               if (!_mainRenderCtx.shouldCancelRender(renderId)) {
                  QuranCard.renderLoadingState(container);
               }
            }, 150);
         }

         try {
            const dataPromise = loadData();
            const bannerPromise = bannerCreatorFn ? bannerCreatorFn() : Promise.resolve(null);
            
            await dataPromise;
            
            const bannerEl = await bannerPromise;

            if (loadingTimer) clearTimeout(loadingTimer);

            const activeContainer = _mainRenderCtx.getContainer();
            if (activeContainer && !_mainRenderCtx.shouldCancelRender(renderId)) {
               await renderList(renderId, activeContainer, _data, bannerEl);
            }
         } catch (error) {
            if (loadingTimer) clearTimeout(loadingTimer);
            logError('[QuranSubpage]', error);
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
               t('components/quran/quran-search:not_found', { query: escapeHtml(query) }),
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

/**
 * Creates the Last Read / History Banner.
 * Extracted here to avoid duplication across subpages.
 * @param {Function} onItemClick - Callback when a banner item is clicked (item, readMode, verseNumber)
 * @returns {Promise<HTMLElement>}
 */
export async function createHistoryBanner(onItemClick) {
   const { bookmark, history } = await fetchBannerData();

   return QuranCard.createLastReadBanner({ bookmark, history }, async (bm) => {
      try {
         if (bm.type === 'history') {
            if (bm.readMode === 'juz') {
               const juzList = await getJuzList();
               const juz = juzList.find(j => parseInt(j.index, 10) === parseInt(bm.index, 10));
               if (juz) onItemClick(juz, 'juz');
            } else {
               const surahList = await getSurahList();
               const surah = surahList.find(s => parseInt(s.index, 10) === parseInt(bm.index, 10));
               if (surah) onItemClick(surah, 'surah');
            }
            return;
         }

         if (bm.readMode === 'juz' && bm.juzIndex) {
            const juzList = await getJuzList();
            const juz = juzList.find(j => parseInt(j.index, 10) === parseInt(bm.juzIndex, 10));
            if (juz) onItemClick(juz, 'juz', bm.verseNumber);
         } else {
            const surahList = await getSurahList();
            const surah = surahList.find(s => parseInt(s.index, 10) === parseInt(bm.surahIndex, 10));
            if (surah) onItemClick(surah, 'surah', bm.verseNumber);
         }
      } catch (err) {
         console.warn('[BannerHelper] Failed to open last-read item:', err);
      }
   });
}
