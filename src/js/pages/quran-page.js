/**
 * Page Skeleton Component
 */

import * as QuranNav from '../modules/quran/quran-nav.js';
import * as QuranSearch from '../components/quran/quran-search.js';
import * as QuranReader from '../modules/quran/quran-reader.js';
import * as QuranDock from '../components/quran/quran-dock.js';
import { makeAccessibleBtn } from '../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../modules/system/back-handler.js';

let _container = null;
let _quranContent = null;
let _activePage = null;
let _activePageId = null;
let _lastSubPageId = 'surah';
let _debounceTimer = null;
let _isSearchActive = false;

const _dismissSearchAction = () => toggleSearchMode(false);

/**
 * Renders the main Quran page skeleton.
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

   const transitionPromise = QuranNav.enterQuranMode({
      onNavigate: (pageId) => loadSubPage(pageId)
   });

   await loadSubPage('surah');

   await transitionPromise;
   _quranContent.classList.add('ready');
}

/**
 * Loads a subpage into the skeleton.
 */
async function loadSubPage(pageId) {
   if (_activePageId === pageId) return;

   if (_activePage && _activePage.destroy) {
      await _activePage.destroy();
   }

   // Keep track of the last active page that wasn't 'mushaf'
   if (_activePageId && _activePageId !== 'mushaf') {
      _lastSubPageId = _activePageId;
   }

   _activePageId = pageId;
   _activePage = null;

   if (_quranContent) {
      _quranContent.style.scrollBehavior = 'auto';
      _quranContent.scrollTop = 0;
      setTimeout(() => {
         if (_quranContent) _quranContent.style.scrollBehavior = '';
      }, 50);
   }

   try {
      const pageModule = await import(`./quran-pages/${pageId}-page.js`);

      if (_activePageId !== pageId) return;

      _activePage = pageModule;

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
 * Toggles the search overlay mode.
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
 * Handles search input changes.
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
 * Cleans up when exiting the page.
 */
export async function destroy() {
   if (_debounceTimer) clearTimeout(_debounceTimer);
   unregisterModalDismiss(_dismissSearchAction);

   QuranReader.destroy();

   if (_activePage && _activePage.destroy) {
      await _activePage.destroy();
   }

   QuranSearch.destroy();
   await QuranNav.exitQuranMode();

   _container = null;
   _quranContent = null;
   _activePage = null;
   _activePageId = null;
   _lastSubPageId = 'surah';
   _isSearchActive = false;
}

/**
 * Navigates back to the last active subpage after closing Mushaf.
 */
export function navigateBackFromMushaf() {
   loadSubPage(_lastSubPageId);
   QuranDock.setActive(_lastSubPageId);
}