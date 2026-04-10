/* CSS Imports */
import '../../css/pages/quran.css';
import '../../css/components/quran/quran-header.css';
import '../../css/components/quran/quran-dock.css';
import '../../css/components/quran/quran-card.css';
import '../../css/components/quran/quran-reader.css';
import '../../css/components/quran/quran-tajweed.css';
import '../../css/components/quran/quran-bookmark.css';
import '../../css/components/quran/mushaf.css';

// App Router
import * as Router from '../router.js';

// Components
import * as QuranSearch from '../components/quran/quran-search.js';
import * as QuranDock from '../components/quran/quran-dock.js';
import * as QuranHeader from '../components/quran/quran-header.js';

// Modules
import * as QuranNav from '../modules/quran/quran-nav.js';
import * as QuranReader from '../modules/quran/quran-reader.js';

// Utilities
import { initPullToRefresh } from '../utils/pull-to-refresh.js';
import { registerModalDismiss, unregisterModalDismiss } from '../modules/system/back-handler.js';
import { t, loadNS } from '../core/i18n.js';
import { logError } from '../utils/error-boundary.js';

/* Module State */
let _container = null;
let _quranContent = null;
let _activePage = null;
let _activePageId = null;
let _lastSubPageId = 'surah';
let _debounceTimer = null;
let _isSearchActive = false;
let _ptrCleanup = null;

const _dismissSearchAction = () => toggleSearchMode(false);

/**
 * Renders the main Quran page skeleton.
 */
export async function render(container) {
   _container = container;

   await loadNS('pages/quran-page');
   await loadNS('components/quran/quran-card');
   await loadNS('components/quran/quran-dock');
   await loadNS('components/quran/quran-search');

   container.innerHTML = `
      <div class="quran-page" id="quran-page-modal">
         <div id="quran-header-slot"></div>
         ${QuranSearch.renderHTML()}

         <div class="quran-content" id="quran-content">
         </div>
         <div id="quran-dock-slot"></div>
      </div>
   `;

   const headerSlot = container.querySelector('#quran-header-slot');
   const mainHeader = QuranHeader.createHeader({
      title: t('pages/quran-page:title'),
      onBack: () => Router.goBack(),
      rightBtnIcon: 'bx-search',
      rightBtnAriaLabel: t('pages/quran-page:search'),
      onRightBtnClick: () => toggleSearchMode(true)
   });
   headerSlot.replaceWith(mainHeader.element);

   QuranSearch.init(container, {
      onClose: _dismissSearchAction,
      onInput: handleSearchInput
   });

   _quranContent = container.querySelector('#quran-content');
   QuranNav.init();

   const transitionPromise = QuranNav.enterQuranMode({
      onNavigate: (pageId) => loadSubPage(pageId)
   });

   await loadSubPage('surah');

   await transitionPromise;
   _quranContent.classList.add('ready');

   await loadNS('utils/pull-to-refresh');

   // Attach native PTR to the Quran content area so its UI renders inside
   // the overlay (not behind it).
   _ptrCleanup = initPullToRefresh({
      scrollElement: _quranContent,
      theme: 'dark',
      checkDisabled: () => _activePageId === 'mushaf',
      textPull: t('utils/pull-to-refresh:text_pull'),
      textRelease: t('utils/pull-to-refresh:text_release'),
      textRefreshing: t('utils/pull-to-refresh:text_refreshing'),
      async onRefresh() {
         await new Promise(resolve => setTimeout(resolve, 350));
         await loadSubPage(_activePageId, true);
      }
   });
}

/**
 * Loads a subpage into the skeleton.
 * @param {string} pageId - ID of the subpage to load
 * @param {boolean} [forceRefresh=false] - bypass the same-page guard for PTR soft-reload
 */
async function loadSubPage(pageId, forceRefresh = false) {
   if (!forceRefresh && _activePageId === pageId) return;

   const previousPage = _activePage;
   const previousPageId = _activePageId;

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

      // Cleanup previous page only after new page has rendered
      // This allows overlay pages (like Mushaf) to transition over the old content smoothly
      if (previousPage && previousPage.destroy && previousPageId !== pageId) {
         await previousPage.destroy();
      }
   } catch (error) {
      logError('[QuranPage]', error);
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
         placeholderRenderFn(resultsContainer, t('pages/quran-page:search_unsupported'), "bx-info-circle");
      }
   }, 300);
}

/**
 * Cleans up when exiting the page.
 */
export async function destroy() {
   if (_debounceTimer) clearTimeout(_debounceTimer);
   unregisterModalDismiss(_dismissSearchAction);

   if (_ptrCleanup) {
      _ptrCleanup();
      _ptrCleanup = null;
   }

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
export async function navigateBackFromMushaf() {
   await loadSubPage(_lastSubPageId);
   QuranDock.setActive(_lastSubPageId);
}