/**
 * Al-Quran Page Skeleton Component
 */

import * as QuranNav from '../modules/quran/quran-nav.js';
import * as QuranSearch from '../components/quran/quran-search.js';
import { makeAccessibleBtn } from '../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../modules/system/back-handler.js';

let _container = null;
let _quranContent = null;
let _activePage = null;
let _activePageId = null;
let _debounceTimer = null;
let _isSearchActive = false;

const _dismissSearchAction = () => toggleSearchMode(false);

/**
 * Render main Al-Quran page skeleton
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
            <button class="quran-search-btn quran-icon-btn" aria-label="Cari" data-focus-item>
               <i class='bx bx-search'></i>
            </button>
         </div>

         ${QuranSearch.renderHTML()}

         <div class="quran-content" id="quran-content">
         </div>
         <div id="quran-dock-slot"></div>
      </div>
   `;

   QuranSearch.init(container, {
      onClose: _dismissSearchAction,
      onInput: handleSearchInput
   });
   const searchBtn = container.querySelector('.quran-search-btn');
   if (searchBtn) makeAccessibleBtn(searchBtn, () => toggleSearchMode(true));

   _quranContent = container.querySelector('#quran-content');
   QuranNav.init();

   const transitionPromise = QuranNav.enterQuranMode();

   await loadSubPage('surah');

   await transitionPromise;
   _quranContent.classList.add('ready');
}

/**
 * Load subpage into skeleton
 */
async function loadSubPage(pageId) {
   if (_activePage && _activePage.destroy) {
      await _activePage.destroy();
   }

   _activePageId = pageId;
   _activePage = null;

   try {
      _activePage = await import(`./quran-pages/${pageId}-page.js`);

      if (_activePage && _activePage.render) {
         await _activePage.render(_quranContent, {
            onItemSelected: _dismissSearchAction,
            renderPlaceholder: QuranSearch.renderSearchPlaceholder
         });
      }
   } catch (error) {
      console.error(`Gagal memuat subhalaman quran: ${pageId}`, error);
   }
}

/**
 * Toggle search overlay mode
 */
function toggleSearchMode(active) {
   if (_isSearchActive === active) return;
   _isSearchActive = active;

   if (active) {
      _container?.classList.add('is-searching');
      QuranSearch.show();
      registerModalDismiss(_dismissSearchAction);
   } else {
      _container?.classList.remove('is-searching');
      QuranSearch.hide();
      unregisterModalDismiss(_dismissSearchAction);
      if (_activePage && _activePage.onSearchExit) {
         _activePage.onSearchExit();
      }
   }
}

/**
 * Handle search input string change
 */
function handleSearchInput(query, resultsContainer, placeholderRenderFn) {
   if (_debounceTimer) clearTimeout(_debounceTimer);
   const trimmedQuery = query.trim().toLowerCase();

   if (trimmedQuery.length === 0) {
      placeholderRenderFn(resultsContainer);
      if (_activePage && _activePage.onSearchExit) _activePage.onSearchExit();
      return;
   }

   _debounceTimer = setTimeout(() => {
      if (_activePage && _activePage.onSearch) {
         _activePage.onSearch(trimmedQuery, resultsContainer, {
            onItemSelected: _dismissSearchAction,
            renderPlaceholder: placeholderRenderFn
         });
      } else {
         placeholderRenderFn(resultsContainer, "Pencarian tidak didukung di halaman ini", "bx-info-circle");
      }
   }, 300);
}

/**
 * Cleanup on exit skeleton
 */
export async function destroy() {
   if (_debounceTimer) clearTimeout(_debounceTimer);
   unregisterModalDismiss(_dismissSearchAction);

   if (_activePage && _activePage.destroy) {
      await _activePage.destroy();
   }

   QuranSearch.destroy();
   await QuranNav.exitQuranMode();

   _container = null;
   _quranContent = null;
   _activePage = null;
   _isSearchActive = false;
}