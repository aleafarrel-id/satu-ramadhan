/**
 * Bookmark Subpage Component
 * Displays saved verse bookmarks with consistent card UI.
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import * as BookmarkManager from '../../modules/quran/bookmark-manager.js';
import * as QuranReader from '../../modules/quran/quran-reader.js';
import * as Notification from '../../modules/notification/notification.js';
import { getSurahList } from '../../modules/quran/quran-api.js';
import { renderBatchedList } from '../../modules/quran/quran-utility.js';

let _container = null;
let _callbacks = null;

/* Public Interface */

/**
 * Renders the bookmark list page.
 */
export async function render(container, callbacks = {}) {
   _container = container;
   _callbacks = callbacks;

   QuranCard.renderLoadingState(container);

   try {
      const [bookmarks, surahList] = await Promise.all([
         BookmarkManager.getAll(),
         getSurahList()
      ]);

      if (!_container) return;

      if (!bookmarks.length) {
         _renderEmptyState();
         return;
      }

      await renderBatchedList({
         data: bookmarks,
         container: _container,
         listCreatorFn: () => QuranCard.createBookmarkList(),
         batchSize: 15,
         createItemFn: (bookmark) => {
            const surah = surahList.find(s => parseInt(s.index) === bookmark.surahIndex);
            return QuranCard.createBookmarkCard(
               bookmark,
               surah,
               (selectedBookmark, selectedSurah) => {
                  if (_callbacks?.onItemSelected) _callbacks.onItemSelected();
                  _openBookmarkedVerse(selectedBookmark, selectedSurah);
               },
               _handleDeleteBookmark
            );
         }
      });
   } catch (error) {
      console.error('[BookmarkPage] Error loading bookmarks:', error);
      if (_container) {
         QuranCard.renderErrorState(_container, 'Gagal memuat bookmark');
      }
   }
}

/**
 * Handles search queries for the bookmark list.
 */
export async function onSearch(query, resultsContainer, searchCallbacks = {}) {
   const [bookmarks, surahList] = await Promise.all([
      BookmarkManager.getAll(),
      getSurahList()
   ]);

   const filtered = bookmarks.filter(b => {
      const titleMatch = b.surahTitle.toLowerCase().includes(query);
      const verseMatch = b.verseNumber.toString() === query;
      const indexMatch = b.surahIndex.toString() === query;
      return titleMatch || verseMatch || indexMatch;
   });

   if (!filtered.length) {
      if (searchCallbacks.renderPlaceholder) {
         searchCallbacks.renderPlaceholder(resultsContainer, `Tidak ditemukan "${query}"`, 'bx-info-circle');
      }
      return;
   }

   await renderBatchedList({
      data: filtered,
      container: resultsContainer,
      listCreatorFn: () => QuranCard.createBookmarkList(),
      batchSize: 10,
      createItemFn: (bookmark) => {
         const surah = surahList.find(s => parseInt(s.index) === bookmark.surahIndex);
         const card = QuranCard.createBookmarkCard(
            bookmark,
            surah,
            (selectedBookmark, selectedSurah) => {
               if (searchCallbacks.onItemSelected) searchCallbacks.onItemSelected();
               _openBookmarkedVerse(selectedBookmark, selectedSurah);
            },
            _handleDeleteBookmark
         );
         card.style.opacity = '1';
         card.style.animation = 'none';
         return card;
      }
   });
}

/**
 * Called when exiting search mode.
 */
export function onSearchExit() {
   if (_container) {
      render(_container, _callbacks);
   }
}

/* Internal Handlers */

/**
 * Opens the reader at the bookmarked verse.
 */
function _openBookmarkedVerse(bookmark, surah) {
   if (!surah) return;
   QuranReader.open(surah, 'surah', bookmark.verseNumber, {
      onClose: () => {
         // Refresh list when reader is closed
         if (_container) {
            render(_container, _callbacks);
         }
      }
   });
}

/**
 * Handles deleting a bookmark with smooth card exit animation.
 */
async function _handleDeleteBookmark(bookmark, cardEl) {
   cardEl.classList.add('bookmark-card-exit');

   cardEl.addEventListener('animationend', async () => {
      cardEl.remove();
      await BookmarkManager.remove(bookmark.surahIndex, bookmark.verseNumber);
      Notification.info(`QS. ${bookmark.surahTitle}: ${bookmark.verseNumber} dihapus`);

      // Show empty state if no more cards remain
      const remainingCards = _container?.querySelector('.surah-card');
      if (!remainingCards) {
         _renderEmptyState();
      }
   }, { once: true });
}

/**
 * Renders an empty state when no bookmarks exist.
 */
function _renderEmptyState() {
   if (!_container) return;
   _container.innerHTML = `
      <div class="quran-empty">
         <i class='bx bx-bookmark-alt'></i>
         <p>Belum ada ayat yang ditandai</p>
      </div>
   `;
}

/**
 * Cleans up the component.
 */
export async function destroy() {
   _container = null;
   _callbacks = null;
}
