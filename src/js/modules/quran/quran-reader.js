/**
 * Quran Reader Module
 */

// UI Components
import * as QuranDock from '../../components/quran/quran-dock.js';
import * as QuranCard from '../../components/quran/quran-card.js';
import * as QuranHeader from '../../components/quran/quran-header.js';
import { openPicker, closePicker, destroyPicker } from '../../components/quran/quran-picker.js';
import { showConfirmModal } from '../../components/modal/confirm-modal.js';

// API & Services
import { getSurahList, getFullSurahPayload, getJuzList } from './quran-api.js';
import { renderBatchedList, createRenderContext } from './quran-utility.js';
import { buildTajweedFragment, getVerseRules } from './quran-tajweed.js';
import { getTajweedEnabled, getTransliterationEnabled, isAudioOfflineEnabled, setAudioMode } from './quran-settings.js';
import * as BookmarkManager from './bookmark-manager.js';

// Audio & Download
import * as DownloadManager from './quran-download-manager.js';
import * as AudioService from './quran-audio-service.js';

// Permissions
import { Capacitor } from '@capacitor/core';
import { ensureStoragePermission } from '../permission/permission-dialog-configs.js';

// Utilities & System
import * as Notification from '../notification/notification.js';
import { registerModalDismiss, unregisterModalDismiss } from '../system/back-handler.js';
import { initTooltip, dismissTooltip } from '../../utils/tooltip.js';
import { initPullToRefresh } from '../../utils/pull-to-refresh.js';
import { safeClear } from '../../utils/dom-utils.js';
import { store } from '../../core/store.js';
import { t, loadNS } from '../../core/i18n.js';
import { logError } from '../../utils/error-boundary.js';

let _isOpen = false;
let _currentItem = null;
let _currentType = 'surah';
let _overlay = null;
let _readerHeaderInstance = null;
let _scrollContainer = null;
let _quranPage = null;
let _onCloseCallback = null;
let _ptrCleanup = null;
const _renderCtx = createRenderContext();

let _isReaderSearchActive = false;
let _currentReaderData = [];
let _searchDebounceTimer = null;
let _targetVerseNumber = null;
let _storeSubId = null;

// Murottal Event Tracking 
let _murottalEventHandlers = [];

/**
 * Opens the reader overlay for a given item (surah or juz).
 * @param {Object} item - Data object of the surah or juz
 * @param {string} type - 'surah' | 'juz'
 * @param {number|null} targetVerseNumber - Verse to scroll to on open (for bookmarks)
 */
export async function open(item, type = 'surah', targetVerseNumber = null, options = {}) {
   if (_isOpen) return;
   _isOpen = true;
   _currentItem = item;
   _currentType = type;
   _targetVerseNumber = targetVerseNumber;
   _onCloseCallback = options?.onClose || null;

   _quranPage = document.querySelector('.quran-page');
   if (!_quranPage) return;

   // Ensure translations are loaded
   await loadNS('modules/quran/quran-reader');
   await loadNS('utils/pull-to-refresh');

   // Hide dock
   QuranDock.hide();

   // Subscribe to murottal events for reactive UI updates
   _registerMurottalEvents();

   // Build & mount overlay
   _buildOverlay(item);

   // Register back handler
   registerModalDismiss(close);

   // Subscribe to global store for reactive settings changes
   _storeSubId = store.subscribe('settings.quran', () => {
      if (!_isOpen || !_currentReaderData.length) return;

      if (_isReaderSearchActive) {
         // Re-render filtered results to properly update ayah cards (e.g. play button visibility)
         const input = _readerHeaderInstance?.getSearchInput();
         const query = input ? input.value.trim() : '';
         
         _filterVerses(query);
         return;
      }

      const renderId = _renderCtx.incrementAndGet();
      const currentScroll = _scrollContainer ? _scrollContainer.scrollTop : 0;

      _renderItems(_currentReaderData, renderId).then(() => {
         if (_scrollContainer) {
            _scrollContainer.scrollTop = currentScroll;
         }
      });
   });

   // Pre-fetch list for dropdown natively handled by API
   if (type === 'juz') {
      getJuzList().catch(err => console.warn('[QuranReader] Failed to load juz list', err));
   } else {
      getSurahList().catch(err => console.warn('[QuranReader] Failed to load surah list', err));
   }

   // Animate in
   requestAnimationFrame(() => {
      requestAnimationFrame(() => {
         if (_overlay) _overlay.classList.add('active');
         // Add class to hide main quran content behind
         _quranPage.classList.add('is-reading');
         // Initialize tooltip delegation for mobile tap support
         initTooltip(_scrollContainer, '.tj');
      });
   });

   // Fetch and render data
   await _fetchAndRender(item);
}

/**
 * Closes the reader overlay and restores UI.
 */
export function close() {
   if (!_isOpen) return;
   _isOpen = false;

   if (typeof _onCloseCallback === 'function') {
      _onCloseCallback();
   }

   if (_storeSubId) {
      store.unsubscribe(_storeSubId);
      _storeSubId = null;
   }

   // Unsubscribe murottal events (but don't stop playback — dock handles that)
   _unregisterMurottalEvents();

   unregisterModalDismiss(close);

   // Cancel any in-flight renders and free detached DOM references
   _renderCtx.destroy();

   _exitReaderSearch();
   closePicker();
   dismissTooltip();

   const overlayToRemove = _overlay;
   const headerToDestroy = _readerHeaderInstance;
   const ptrToCleanup = _ptrCleanup;

   if (overlayToRemove) {
      overlayToRemove.classList.remove('active');
   }

   if (_quranPage) {
      _quranPage.classList.remove('is-reading');
   }

   // Show dock
   QuranDock.show();

   // Remove overlay after transition targeting captured instances
   setTimeout(() => {
      if (overlayToRemove && overlayToRemove.parentNode) {
         overlayToRemove.parentNode.removeChild(overlayToRemove);
      }
      if (headerToDestroy) {
         headerToDestroy.destroy();
      }
      if (ptrToCleanup) {
         ptrToCleanup();
      }
   }, 400);

   // Immediately sever module ties so rapid open() spins up fresh elements cleanly
   _overlay = null;
   _readerHeaderInstance = null;
   _scrollContainer = null;
   _ptrCleanup = null;
   _currentItem = null;
   _currentType = 'surah';
   _currentReaderData = [];
   _onCloseCallback = null;
}

/**
 * Cleans up on module destruction.
 */
export function destroy() {
   if (_isOpen) {
      // Fast close without animation
      _isOpen = false;
      _isReaderSearchActive = false;
      if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
      if (_storeSubId) {
         store.unsubscribe(_storeSubId);
         _storeSubId = null;
      }
      _unregisterMurottalEvents();
      _renderCtx.incrementAndGet();
      unregisterModalDismiss(close);
      unregisterModalDismiss(_exitReaderSearch);
      dismissTooltip();
      destroyPicker();

      if (_ptrCleanup) {
         _ptrCleanup();
         _ptrCleanup = null;
      }

      if (_overlay && _overlay.parentNode) {
         _overlay.parentNode.removeChild(_overlay);
      }
      if (_quranPage) {
         _quranPage.classList.remove('is-reading');
      }
      _overlay = null;
      if (_readerHeaderInstance) {
         _readerHeaderInstance.destroy();
         _readerHeaderInstance = null;
      }
      _scrollContainer = null;
      _currentItem = null;
      _currentType = 'surah';
      _currentReaderData = [];
      _quranPage = null;
      _onCloseCallback = null;
   }
}

/**
 * Returns true if the reader is open.
 */
export function isOpen() {
   return _isOpen;
}

function _buildOverlay(item) {
   _overlay = document.createElement('div');
   _overlay.className = 'quran-reader-overlay';
   _overlay.id = 'quran-reader-overlay';

   // Header
   let titleStr = '';
   let ariaLabelStr = '';
   if (_currentType === 'juz') {
      titleStr = `Juz ${parseInt(item.index)}`;
      ariaLabelStr = t('modules/quran/quran-reader:current_juz', { index: parseInt(item.index) });
   } else {
      titleStr = `${parseInt(item.index)}. ${item.title}`;
      ariaLabelStr = t('modules/quran/quran-reader:current_surah', { title: item.title });
   }

   _readerHeaderInstance = QuranHeader.createHeader({
      title: titleStr,
      onBack: close,
      titleClickable: true,
      onTitleClick: _openSurahPicker,
      titleAriaLabel: ariaLabelStr,
      hasSearchInput: true,
      searchPlaceholder: t('modules/quran/quran-reader:search_verse'),
      searchInputType: 'number',
      searchInputMode: 'numeric',
      onSearchInput: _onSearchInput,
      rightBtnIcon: 'bx-search',
      rightBtnAriaLabel: t('modules/quran/quran-reader:search_aria'),
      onRightBtnClick: _toggleReaderSearch
   });

   // Scroll content area
   _scrollContainer = document.createElement('div');
   _scrollContainer.className = 'quran-reader-scroll';

   // Delegated click handler — avoids per-card addEventListener overhead
   _scrollContainer.addEventListener('click', _onScrollContainerClick);

   // Loading state
   _setLoadingState();

   _overlay.appendChild(_readerHeaderInstance.element);
   _overlay.appendChild(_scrollContainer);

   // Mount into the quran-page
   _quranPage.appendChild(_overlay);

   // Attach PTR directly to the scroll container inside the overlay so its UI
   // is always visible to the user
   _ptrCleanup = initPullToRefresh({
      scrollElement: _scrollContainer,
      theme: 'dark',
      textPull: t('utils/pull-to-refresh:text_pull'),
      textRelease: t('utils/pull-to-refresh:text_release'),
      textRefreshing: t('utils/pull-to-refresh:text_refreshing'),
      async onRefresh() {
         if (!_currentItem) return;
         _renderCtx.incrementAndGet();

         await new Promise(resolve => setTimeout(resolve, 350));

         _setLoadingState();

         await _fetchAndRender(_currentItem);
      }
   });
}

function _openSurahPicker() {
   const isJuz = _currentType === 'juz';

   openPicker({
      title: isJuz ? t('modules/quran/quran-reader:select_juz') : t('modules/quran/quran-reader:select_surah'),
      data: isJuz ? getJuzList() : getSurahList(),
      createCardFn: isJuz ? QuranCard.createJuzCard : QuranCard.createSurahCard,
      isActiveFn: (item) => item.index === _currentItem.index,
      activeClass: isJuz ? 'active-juz' : 'active-surah',
      onSelect: (selectedItem) => {
         if (selectedItem.index !== _currentItem.index) {
            _changeItem(selectedItem);
         }
      },
      container: _quranPage
   });
}

function _changeItem(newItem) {
   _currentItem = newItem;

   // Update title
   if (_readerHeaderInstance) {
      if (_currentType === 'juz') {
         _readerHeaderInstance.setTitle(`Juz ${parseInt(newItem.index)}`);
      } else {
         _readerHeaderInstance.setTitle(`${parseInt(newItem.index, 10)}. ${newItem.title}`);
      }
   }

   // Reset scroll container to loading state (safe — preserves .custom-ptr)
   if (_scrollContainer) {
      _setLoadingState();
      _scrollContainer.scrollTop = 0;
   }

   // Cancel any in-flight renders and fetch new data
   _renderCtx.incrementAndGet();
   _fetchAndRender(newItem);
}

async function _fetchAndRender(item) {
   _renderCtx.setContainer(_scrollContainer);
   const renderId = _renderCtx.incrementAndGet();

   try {
      const itemsToRender = [];

      if (_currentType === 'juz') {
         const surahList = await getSurahList();
         const startSurahIndex = parseInt(item.start.index, 10);
         const endSurahIndex = parseInt(item.end.index, 10);
         const startVerseNum = parseInt(item.start.verse.replace('verse_', ''), 10);
         const endVerseNum = parseInt(item.end.verse.replace('verse_', ''), 10);

         // Fetch all surahs spanned by this juz in parallel chunks
         const fetchPromises = [];
         for (let i = startSurahIndex; i <= endSurahIndex; i++) {
            fetchPromises.push(getFullSurahPayload(i));
         }
         const allPayloads = await Promise.all(fetchPromises);

         if (_renderCtx.shouldCancelRender(renderId)) return;

         for (let i = 0; i < allPayloads.length; i++) {
            const surahIndex = startSurahIndex + i;
            const surahMeta = surahList.find(s => parseInt(s.index, 10) === surahIndex);
            const [surahData, transData, tajData, latinData] = allPayloads[i];

            itemsToRender.push({ type: 'banner', surah: surahMeta });

            let verses = _buildAyahList(surahData, transData, tajData, latinData, surahMeta);

            if (surahIndex === startSurahIndex) {
               verses = verses.filter(v => v.number === 0 || v.number >= startVerseNum);
            }
            if (surahIndex === endSurahIndex) {
               verses = verses.filter(v => v.number === 0 || v.number <= endVerseNum);
            }

            verses.forEach(v => itemsToRender.push({ type: 'ayah', data: v }));
         }
      } else {
         // Standard Surah render mode
         const [surahData, transData, tajData, latinData] = await getFullSurahPayload(parseInt(item.index));

         if (_renderCtx.shouldCancelRender(renderId)) return;

         itemsToRender.push({ type: 'banner', surah: item });
         const verses = _buildAyahList(surahData, transData, tajData, latinData, item);
         verses.forEach(v => itemsToRender.push({ type: 'ayah', data: v }));
      }

      // Store processed data for search filtering
      _currentReaderData = itemsToRender;

      // Render to DOM (deep-link scroll handled inside _renderItems)
      await _renderItems(itemsToRender, renderId, true);

   } catch (error) {
      logError('[QuranReader]', error);
      if (!_renderCtx.shouldCancelRender(renderId) && _scrollContainer) {
         QuranCard.renderErrorState(_scrollContainer, t('modules/quran/quran-reader:error_load'));
      }
   }
}

function _buildAyahList(surahData, translationData, tajweedData, latinData, surahMeta) {
   const verseObj = surahData.verse || {};
   const transObj = translationData.verse || {};
   const latinObj = latinData?.verse || {};
   const ayahList = [];

   // V8/JSC return integer-like string keys in ascending numeric order,
   // so Object.keys already gives us sorted verse keys without explicit sort.
   const verseKeys = Object.keys(verseObj);

   verseKeys.forEach(key => {
      const verseNum = parseInt(key.replace('verse_', ''));
      const rawArabic = verseObj[key] || '';
      const cleanArabic = rawArabic.replace(/^[\uFEFF\u200B]+/, '');

      ayahList.push({
         key,
         number: verseNum,
         isBismillah: verseNum === 0,
         arabic: cleanArabic,
         translation: transObj[key] || '',
         latin: latinObj[key] || '',
         tajweedRules: getVerseRules(tajweedData, key),
         surahIndex: parseInt(surahMeta.index),
         surahName: surahMeta.title,
         surahTitleAr: surahMeta.titleAr || '',
         surahType: surahMeta.type || ''
      });
   });

   return ayahList;
}

function _createSurahBannerElement(surah) {
   const surahNum = parseInt(surah.index);
   const totalAyahs = parseInt(surah.count) || 0;
   const typeText = surah.type === 'Makkiyah' ? t('components/quran/quran-card:makkiyah') : t('components/quran/quran-card:madaniyah');

   const banner = document.createElement('div');
   banner.className = 'quran-reader-surah-info-card';
   banner.dataset.surahIndex = surahNum;
   banner.dataset.surahTitle = surah.title;
   banner.dataset.totalAyahs = totalAyahs;
   // Additional margin to space out multiple banners inside Juz mode
   banner.style.marginTop = '1rem';
   banner.style.marginBottom = '2rem';

   // Content section
   const content = document.createElement('div');
   content.className = 'quran-reader-surah-info-content';
   content.innerHTML = `
      <div class="quran-reader-surah-info-latin">${surahNum}. ${surah.title}</div>
      <div class="quran-reader-surah-name-ar">${surah.titleAr}</div>
      <div class="quran-reader-surah-meta">
         <span class="quran-reader-meta-tag">${typeText}</span>
         <span class="quran-reader-meta-tag">${t('modules/quran/quran-reader:verse_count', { count: surah.count })}</span>
      </div>
   `;

   // Action container — rebuilt dynamically based on state
   const actionContainer = document.createElement('div');
   actionContainer.className = 'quran-reader-surah-action-container';

   _rebuildBannerActions(actionContainer, surahNum, totalAyahs);

   banner.appendChild(content);
   banner.appendChild(actionContainer);

   return banner;
}

/**
 * Rebuilds the entire action container for a surah banner
 * based on the current download/playback state.
 * @param {HTMLElement} container - The .quran-reader-surah-action-container
 * @param {number} surahIndex
 * @param {number} totalAyahs
 */
function _rebuildBannerActions(container, surahIndex, totalAyahs) {
   const downloadState = DownloadManager.getDownloadState();
   const playbackState = AudioService.getPlaybackState();
   const downloadedCount = DownloadManager.getDownloadedCount(surahIndex);
   const isFullyDownloaded = DownloadManager.isSurahFullyDownloaded(surahIndex, totalAyahs);
   const isStreaming = !isAudioOfflineEnabled();
   const isPlayReady = isStreaming || isFullyDownloaded;

   // Remove previous state classes from parent banner card
   const bannerCard = container.closest('.quran-reader-surah-info-card');
   if (bannerCard) {
      bannerCard.classList.remove('state-idle', 'state-downloading', 'state-downloaded', 'state-playing');
   }

   // Clear container
   container.innerHTML = '';

   if (playbackState.isPlaying && playbackState.surahIndex === surahIndex) {
      // ── State 4: Currently Playing ──
      if (bannerCard) bannerCard.classList.add('state-playing');

      const controls = document.createElement('div');
      controls.className = 'banner-playback-controls';

      const prevBtn = _createBannerCtrlBtn('banner-prev', 'bx-skip-previous', t('modules/quran/quran-reader:prev_ayah'));
      const playPauseBtn = _createBannerCtrlBtn(
         'banner-play-pause',
         playbackState.isPaused ? 'bx-play-circle' : 'bx-pause-circle',
         playbackState.isPaused ? t('modules/quran/quran-reader:play_surah') : t('modules/quran/quran-reader:pause_playback'),
      );
      playPauseBtn.classList.add('banner-ctrl-primary');
      const nextBtn = _createBannerCtrlBtn('banner-next', 'bx-skip-next', t('modules/quran/quran-reader:next_ayah'));
      const stopBtn = _createBannerCtrlBtn('banner-stop', 'bx-stop', t('modules/quran/quran-reader:stop_playback'));

      controls.appendChild(prevBtn);
      controls.appendChild(playPauseBtn);
      controls.appendChild(nextBtn);
      controls.appendChild(stopBtn);
      container.appendChild(controls);

      // Info label: "Ayat 3 / 7"
      const infoLabel = document.createElement('span');
      infoLabel.className = 'quran-reader-surah-action-label';
      infoLabel.textContent = t('modules/quran/quran-reader:playing_ayah', {
         current: playbackState.ayahNumber,
         total: totalAyahs,
      });
      container.appendChild(infoLabel);

   } else if (downloadState.isDownloading && downloadState.surahIndex === surahIndex) {
      // ── State 2: Downloading ──
      if (bannerCard) bannerCard.classList.add('state-downloading');

      const controls = document.createElement('div');
      controls.className = 'banner-download-controls';

      // Pause / Resume toggle
      if (downloadState.isPaused) {
         const resumeBtn = _createBannerCtrlBtn('banner-resume-dl', 'bx-play-circle', t('modules/quran/quran-reader:resume_download'));
         resumeBtn.classList.add('banner-ctrl-primary');
         controls.appendChild(resumeBtn);
      } else {
         const pauseBtn = _createBannerCtrlBtn('banner-pause-dl', 'bx-pause-circle', t('modules/quran/quran-reader:pause_download'));
         pauseBtn.classList.add('banner-ctrl-primary', 'is-loading');
         controls.appendChild(pauseBtn);
      }

      // Cancel button
      const cancelBtn = _createBannerCtrlBtn('banner-cancel-dl', 'bx-x', t('modules/quran/quran-reader:cancel_download'));
      cancelBtn.classList.add('banner-ctrl-danger');
      controls.appendChild(cancelBtn);

      container.appendChild(controls);

      // Progress label
      const progress = downloadState.total > 0 ? (downloadState.current / downloadState.total) * 100 : 0;
      const progressLabel = document.createElement('span');
      progressLabel.className = 'quran-reader-surah-action-label';
      progressLabel.textContent = downloadState.isPaused
         ? t('modules/quran/quran-reader:download_paused') + ` (${downloadState.current}/${downloadState.total})`
         : t('modules/quran/quran-reader:download_progress', { current: downloadState.current, total: downloadState.total });
      container.appendChild(progressLabel);

      // Set progress CSS custom property for the progress bar
      if (bannerCard) {
         bannerCard.style.setProperty('--download-progress', `${progress}%`);
      }

   } else if (isPlayReady) {
      // ── State 3: Ready to Play ──
      if (bannerCard) bannerCard.classList.add('state-downloaded');

      // Mode switch pill for Native
      let redownloadBtn = null;
      if (Capacitor.isNativePlatform()) {
         if (isStreaming) {
            // Streaming → offer switch to offline mode
            const switchBtn = document.createElement('button');
            switchBtn.className = 'quran-reader-redownload-pill';
            switchBtn.dataset.action = 'banner-switch-offline';
            switchBtn.innerHTML = `<i class='bx bx-cloud-download'></i> <span>${t('modules/quran/quran-reader:switch_to_offline')}</span>`;
            container.appendChild(switchBtn);
         } else {
            // Offline → offer switch to streaming mode
            const switchBtn = document.createElement('button');
            switchBtn.className = 'quran-reader-redownload-pill';
            switchBtn.dataset.action = 'banner-switch-streaming';
            switchBtn.innerHTML = `<i class='bx bx-wifi'></i> <span>${t('modules/quran/quran-reader:switch_to_streaming')}</span>`;
            container.appendChild(switchBtn);

            // Keep redownload pill for fully downloaded surahs (corrupt file recovery)
            // Deferred to append after the play button
            if (isFullyDownloaded) {
               redownloadBtn = document.createElement('button');
               redownloadBtn.className = 'quran-reader-redownload-pill';
               redownloadBtn.dataset.action = 'banner-redownload';
               redownloadBtn.innerHTML = `<i class='bx bx-refresh'></i> <span>${t('modules/quran/quran-reader:redownload_surah')}</span>`;
            }
         }
      }

      const playBtn = document.createElement('button');
      playBtn.className = 'quran-reader-surah-action-btn surah-downloaded';
      playBtn.dataset.action = 'banner-play';
      playBtn.setAttribute('aria-label', t('modules/quran/quran-reader:play_surah'));
      playBtn.innerHTML = `<i class='bx bx-play-circle'></i>`;
      container.appendChild(playBtn);

      const label = document.createElement('span');
      label.className = 'quran-reader-surah-action-label';
      label.textContent = t('modules/quran/quran-reader:play_surah');
      container.appendChild(label);

      // Append redownload button at the very bottom
      if (redownloadBtn) {
         container.appendChild(redownloadBtn);
      }
   } else {
      // ── State 1: Not Downloaded (or partially) ──
      if (bannerCard) bannerCard.classList.add('state-idle');

      // Mode switch pill: offer switch to streaming (Native only)
      if (Capacitor.isNativePlatform()) {
         const switchBtn = document.createElement('button');
         switchBtn.className = 'quran-reader-redownload-pill';
         switchBtn.dataset.action = 'banner-switch-streaming';
         switchBtn.innerHTML = `<i class='bx bx-wifi'></i> <span>${t('modules/quran/quran-reader:switch_to_streaming')}</span>`;
         container.appendChild(switchBtn);
      }

      const dlBtn = document.createElement('button');
      dlBtn.className = 'quran-reader-surah-action-btn';
      dlBtn.dataset.action = 'banner-download';
      dlBtn.setAttribute('aria-label', t('modules/quran/quran-reader:download_surah'));
      dlBtn.innerHTML = `<i class='bx bx-cloud-download'></i>`;
      container.appendChild(dlBtn);

      const label = document.createElement('span');
      label.className = 'quran-reader-surah-action-label';
      if (downloadedCount > 0) {
         label.textContent = t('modules/quran/quran-reader:download_progress', { current: downloadedCount, total: totalAyahs });
      } else {
         label.textContent = t('modules/quran/quran-reader:download_surah');
      }
      container.appendChild(label);
   }
}

/**
 * Creates a small control button for banner action groups.
 * @param {string} action - data-action value for delegation
 * @param {string} iconClass - Boxicons v2 icon class (e.g. 'bx-play')
 * @param {string} ariaLabel
 * @returns {HTMLButtonElement}
 */
function _createBannerCtrlBtn(action, iconClass, ariaLabel) {
   const btn = document.createElement('button');
   btn.className = 'banner-ctrl-btn';
   btn.dataset.action = action;
   btn.setAttribute('aria-label', ariaLabel);
   btn.innerHTML = `<i class='bx ${iconClass}'></i>`;
   return btn;
}

function _createAyahElement(ayah) {
   if (ayah.isBismillah) {
      return _createBismillahElement(ayah);
   }
   return _createRegularAyahElement(ayah);
}

function _createBismillahElement(ayah) {
   const el = document.createElement('div');
   el.className = 'quran-ayah-bismillah';

   const textEl = document.createElement('div');
   textEl.className = 'quran-ayah-bismillah-text';
   textEl.textContent = ayah.arabic;

   el.appendChild(textEl);
   return el;
}

function _createRegularAyahElement(ayah) {
   const card = document.createElement('div');
   card.className = 'quran-ayah-card';
   card.dataset.ayahNumber = ayah.number;
   card.dataset.surahIndex = ayah.surahIndex;

   // Header with ayah number + action buttons
   const header = document.createElement('div');
   header.className = 'quran-ayah-header';

   const numberBadge = document.createElement('span');
   numberBadge.className = 'quran-ayah-number';
   numberBadge.textContent = ayah.number;

   // Action buttons container (right side)
   const actions = document.createElement('div');
   actions.className = 'quran-ayah-actions';

   // Play button — rendered if streaming mode is enabled OR if the ayah audio is downloaded
   let playBtn = null;
   if (!isAudioOfflineEnabled() || DownloadManager.isAyahDownloaded(ayah.surahIndex, ayah.number)) {
      playBtn = document.createElement('button');
      playBtn.className = 'quran-ayah-action-btn';
      playBtn.setAttribute('aria-label', t('modules/quran/quran-reader:play_ayah'));
      playBtn.dataset.action = 'play';
      playBtn.innerHTML = `<i class='bx bx-play-circle'></i>`;
   }

   // Copy button — no inline listener, handled via delegation
   const copyBtn = document.createElement('button');
   copyBtn.className = 'quran-ayah-action-btn';
   copyBtn.setAttribute('aria-label', t('modules/quran/quran-reader:copy_ayah'));
   copyBtn.dataset.action = 'copy';
   copyBtn.innerHTML = `<i class='bx bx-copy-alt'></i>`;

   // Bookmark button — no inline listener, handled via delegation
   const bookmarkBtn = document.createElement('button');
   bookmarkBtn.className = 'quran-ayah-action-btn';
   bookmarkBtn.setAttribute('aria-label', t('modules/quran/quran-reader:bookmark_ayah'));
   bookmarkBtn.dataset.action = 'bookmark';

   // Set initial bookmark icon state
   const isMarked = BookmarkManager.isBookmarkedSync(ayah.surahIndex, ayah.number);
   bookmarkBtn.innerHTML = isMarked
      ? `<i class='bx bxs-bookmark-alt'></i>`
      : `<i class='bx bx-bookmark-alt'></i>`;
   if (isMarked) bookmarkBtn.classList.add('bookmarked');

   if (playBtn) actions.appendChild(playBtn);
   actions.appendChild(copyBtn);
   actions.appendChild(bookmarkBtn);

   header.appendChild(numberBadge);
   header.appendChild(actions);

   // Arabic text
   const arabicEl = document.createElement('div');
   arabicEl.className = 'quran-ayah-arabic';

   if (ayah.tajweedRules?.length && getTajweedEnabled()) {
      arabicEl.appendChild(buildTajweedFragment(ayah.arabic, ayah.tajweedRules));
   } else {
      arabicEl.textContent = ayah.arabic;
   }

   // Latin text
   const latinEl = document.createElement('div');
   latinEl.className = 'quran-ayah-latin';
   if (ayah.latin && getTransliterationEnabled()) {
      latinEl.textContent = ayah.latin;
   } else {
      latinEl.style.display = 'none'; // hide if no data or disabled
   }

   // Translation
   const translationEl = document.createElement('div');
   translationEl.className = 'quran-ayah-translation';
   translationEl.textContent = ayah.translation;

   card.appendChild(header);
   card.appendChild(arabicEl);
   card.appendChild(latinEl);
   card.appendChild(translationEl);

   return card;
}

/**
 * Renders the loading skeleton inside _scrollContainer while preserving
 * the .custom-ptr node at the top (DOM Safe-Cleanup).
 */
function _setLoadingState() {
   if (!_scrollContainer) return;
   _clearScrollContainer();
   const loadingEl = document.createElement('div');
   loadingEl.className = 'quran-loading';
   loadingEl.innerHTML = `<i class='bx bx-book-reader'></i><p>${t('modules/quran/quran-reader:loading')}</p>`;
   _scrollContainer.appendChild(loadingEl);
}

/**
 * Clears the scroll container content while preserving the PTR element.
 * Replacing innerHTML directly would destroy the .custom-ptr node and break PTR.
 */
function _clearScrollContainer() {
   if (!_scrollContainer) return;
   safeClear(_scrollContainer);
}

async function _renderItems(data, renderId, isInitialLoad = false) {
   _clearScrollContainer();

   if (!data.length) {
      _renderNoResults();
      return;
   }

   const createEl = (itemDesc, index, animated) => {
      const el = itemDesc.type === 'banner'
         ? _createSurahBannerElement(itemDesc.surah)
         : _createAyahElement(itemDesc.data);
      if (isInitialLoad && animated) {
         el.style.animationDelay = `${index * 0.025}s`;
      } else {
         el.style.animation = 'none';
         el.style.opacity = '1';
      }
      return el;
   };

   // Deep-link: render only items around the target verse for instant visibility.
   // A height spacer holds position for items above. The rest fills in via rAF.
   if (_targetVerseNumber) {
      const tVerse = typeof _targetVerseNumber === 'object' ? _targetVerseNumber.verseNumber : _targetVerseNumber;
      const tSurah = typeof _targetVerseNumber === 'object' ? _targetVerseNumber.surahIndex : null;
      _targetVerseNumber = null;

      const targetIdx = data.findIndex(item =>
         item.type === 'ayah' &&
         item.data.number === parseInt(tVerse, 10) &&
         (tSurah ? item.data.surahIndex === parseInt(tSurah, 10) : true)
      );

      if (targetIdx !== -1) {
         const BUFFER = 25;
         const winStart = Math.max(0, targetIdx - BUFFER);
         const winEnd = Math.min(data.length, targetIdx + BUFFER);

         const list = document.createElement('div');
         list.className = 'quran-reader-ayah-list';

         // Height spacer for items above the window
         const spacer = winStart > 0 ? document.createElement('div') : null;
         if (spacer) {
            spacer.style.height = `${winStart * 200}px`;
            list.appendChild(spacer);
         }

         // Render window items synchronously
         const frag = document.createDocumentFragment();
         for (let i = winStart; i < winEnd; i++) {
            frag.appendChild(createEl(data[i], i - winStart, false));
         }
         list.appendChild(frag);

         safeClear(_scrollContainer, '.custom-ptr, .quran-loading');
         _scrollContainer.appendChild(list);

         // Instant jump to target card
         let selector = `.quran-ayah-card[data-ayah-number="${tVerse}"]`;
         if (tSurah) selector += `[data-surah-index="${tSurah}"]`;
         const targetCard = list.querySelector(selector);
         if (targetCard) {
            const header = _overlay?.querySelector('.quran-unified-header');
            const headerHeight = header ? header.offsetHeight : 0;
            _scrollContainer.style.scrollPaddingTop = `${headerHeight + 12}px`;
            _scrollContainer.style.scrollBehavior = 'auto';
            targetCard.scrollIntoView({ behavior: 'auto', block: 'start' });
            _scrollContainer.style.scrollBehavior = '';
         }

         // Fill remaining items in background
         const rafId = requestAnimationFrame(() => {
            _scrollContainer.__quranRenderCancel = null;
            if (_renderCtx.shouldCancelRender(renderId)) return;

            if (spacer) {
               const beforeFrag = document.createDocumentFragment();
               for (let i = 0; i < winStart; i++) {
                  beforeFrag.appendChild(createEl(data[i], i, false));
               }
               list.insertBefore(beforeFrag, spacer);
               spacer.remove();
            }

            if (winEnd < data.length) {
               const afterFrag = document.createDocumentFragment();
               for (let i = winEnd; i < data.length; i++) {
                  afterFrag.appendChild(createEl(data[i], i, false));
               }
               list.appendChild(afterFrag);
            }
         });

         _scrollContainer.__quranRenderCancel = () => cancelAnimationFrame(rafId);
         return;
      }
   }

   // Normal rendering: 3-batch sync buffer, rest via rAF
   await renderBatchedList({
      data,
      container: _scrollContainer,
      listCreatorFn: () => {
         const list = document.createElement('div');
         list.className = 'quran-reader-ayah-list';
         return list;
      },
      onCheckCancel: () => _renderCtx.shouldCancelRender(renderId),
      batchSize: 20,
      initialBatchCount: 3,
      createItemFn: (itemDesc, index, isInitialBatch) => createEl(itemDesc, index, isInitialBatch),
   });
}


function _renderNoResults() {
   if (!_scrollContainer) return;
   _scrollContainer.innerHTML = `
      <div class="quran-reader-no-results">
         <i class='bx bx-search-alt'></i>
         <p>${t('modules/quran/quran-reader:not_found')}</p>
      </div>
   `;
}

function _toggleReaderSearch() {
   if (_isReaderSearchActive) {
      _exitReaderSearch();
   } else {
      _enterReaderSearch();
   }
}

function _enterReaderSearch() {
   if (_isReaderSearchActive) return;
   _isReaderSearchActive = true;

   if (_readerHeaderInstance) {
      _readerHeaderInstance.toggleSearchMode(true);
      _readerHeaderInstance.setRightIcon('bx-x');
      const input = _readerHeaderInstance.getSearchInput();
      if (input) setTimeout(() => input.focus(), 300);
   }

   registerModalDismiss(_exitReaderSearch);
}

function _exitReaderSearch() {
   if (!_isReaderSearchActive) return;
   _isReaderSearchActive = false;

   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   unregisterModalDismiss(_exitReaderSearch);

   if (_readerHeaderInstance) {
      _readerHeaderInstance.toggleSearchMode(false);
      _readerHeaderInstance.setRightIcon('bx-search');
      const input = _readerHeaderInstance.getSearchInput();
      if (input) input.value = '';
   }

   // Re-render full data
   if (_currentReaderData.length) {
      const renderId = _renderCtx.incrementAndGet();
      _renderItems(_currentReaderData, renderId);
   }
}

function _onSearchInput(e) {
   if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
   const query = e.target.value.trim();

   _searchDebounceTimer = setTimeout(() => {
      _filterVerses(query);
   }, 250);
}

function _filterVerses(query) {
   const renderId = _renderCtx.incrementAndGet();

   if (!query) {
      // Show all
      _renderItems(_currentReaderData, renderId);
      return;
   }

   // Filter ayahs matching the verse number
   const matchedAyahs = _currentReaderData.filter(
      item => item.type === 'ayah' && !item.data.isBismillah && item.data.number.toString() === query
   );

   if (!matchedAyahs.length) {
      _renderItems([], renderId);
      return;
   }

   // Build result list with contextual surah banners
   const results = [];
   let lastSurahIndex = null;

   matchedAyahs.forEach(ayahItem => {
      const surahIdx = ayahItem.data.surahIndex;

      // Insert banner if surah changed (important for Juz mode with multi-surah)
      if (surahIdx !== lastSurahIndex) {
         const banner = _currentReaderData.find(
            b => b.type === 'banner' && parseInt(b.surah.index) === surahIdx
         );
         if (banner) results.push(banner);
         lastSurahIndex = surahIdx;
      }

      results.push(ayahItem);
   });

   _renderItems(results, renderId);
}

/**
 * Single delegated handler on _scrollContainer — replaces per-card listeners.
 * Handles both banner action buttons and per-ayah action buttons via delegation.
 */
function _onScrollContainerClick(e) {
   // Check for banner action buttons (new multi-button layout)
   const bannerActionBtn = e.target.closest('.quran-reader-surah-action-container [data-action]');
   if (bannerActionBtn) {
      e.stopPropagation();
      _handleBannerAction(bannerActionBtn);
      return;
   }

   // Per-ayah action buttons
   const btn = e.target.closest('.quran-ayah-action-btn');
   if (!btn) return;

   e.stopPropagation();

   const card = btn.closest('.quran-ayah-card');
   if (!card) return;

   const ayahNumber = parseInt(card.dataset.ayahNumber, 10);
   const surahIndex = parseInt(card.dataset.surahIndex, 10);

   // Find the ayah data from the current reader data set
   const ayahItem = _currentReaderData.find(
      item => item.type === 'ayah' && item.data.number === ayahNumber && item.data.surahIndex === surahIndex
   );
   if (!ayahItem) return;

   const action = btn.dataset.action;
   if (action === 'copy') {
      _handleCopyAyah(ayahItem.data, btn);
   } else if (action === 'bookmark') {
      _handleToggleBookmark(ayahItem.data, btn);
   } else if (action === 'play') {
      AudioService.playAyah(ayahItem.data.surahIndex, ayahItem.data.number, ayahItem.data.surahName);
   }
}

function _handleCopyAyah(ayah, btnEl) {
   const text = `${ayah.arabic}\n\n${ayah.translation}\n\n— QS. ${ayah.surahName}: ${ayah.number}`;

   navigator.clipboard.writeText(text).then(() => {
      // Visual feedback
      const icon = btnEl.querySelector('i');
      btnEl.classList.add('copied');
      if (icon) icon.className = 'bx bx-check';

      setTimeout(() => {
         btnEl.classList.remove('copied');
         if (icon) icon.className = 'bx bx-copy-alt';
      }, 1500);
   }).catch(err => {
      console.warn('[QuranReader] Failed to copy:', err);
   });
}

async function _handleToggleBookmark(ayah, btnEl) {
   const isNowBookmarked = await BookmarkManager.toggle({
      surahIndex: ayah.surahIndex,
      surahName: ayah.surahName,
      surahTitleAr: ayah.surahTitleAr,
      verseNumber: ayah.number,
      type: ayah.surahType,
      readMode: _currentType,
      juzIndex: _currentType === 'juz' ? _currentItem.index : null
   });

   const icon = btnEl.querySelector('i');

   if (isNowBookmarked) {
      btnEl.classList.add('bookmarked');
      if (icon) icon.className = 'bx bxs-bookmark-alt';
      Notification.success(t('modules/quran/quran-reader:bookmark_added', { surahName: ayah.surahName, verseNumber: ayah.number }));
   } else {
      btnEl.classList.remove('bookmarked');
      if (icon) icon.className = 'bx bx-bookmark-alt';
      Notification.info(t('modules/quran/quran-reader:bookmark_removed'));
   }
}

// Murottal Banner Click Handler 

/**
 * Handles clicks on banner action buttons.
 * Routes actions from the multi-button layout to the appropriate service.
 * @param {HTMLElement} btn - The clicked button with data-action
 */
function _handleBannerAction(btn) {
   const action = btn.dataset.action;
   const bannerCard = btn.closest('.quran-reader-surah-info-card');
   if (!bannerCard) return;

   const surahIndex = parseInt(bannerCard.dataset.surahIndex, 10);
   const surahTitle = bannerCard.dataset.surahTitle || '';
   const totalAyahs = parseInt(bannerCard.dataset.totalAyahs, 10);

   switch (action) {
      // ── Download Actions ──
      case 'banner-download':
         _startDownloadWithPermission(surahIndex, totalAyahs, surahTitle);
         break;
      case 'banner-pause-dl':
         DownloadManager.pauseDownload();
         break;
      case 'banner-resume-dl':
         DownloadManager.resumeDownload();
         break;
      case 'banner-cancel-dl':
         DownloadManager.cancelDownload();
         break;

      // ── Playback Actions ──
      case 'banner-play':
         AudioService.playSurah(surahIndex, surahTitle, totalAyahs);
         break;
      case 'banner-play-pause': {
         const state = AudioService.getPlaybackState();
         if (state.isPaused) {
            AudioService.resume();
         } else {
            AudioService.pause();
         }
         break;
      }
      case 'banner-prev':
         AudioService.skipPrev();
         break;
      case 'banner-next':
         AudioService.skipNext();
         break;
      case 'banner-stop':
         AudioService.stop();
         break;

      // ── Re-download (corrupt/missing file recovery) ──
      case 'banner-redownload':
         _startRedownloadWithPermission(surahIndex, totalAyahs, surahTitle);
         break;

      // ── Mode Switch Actions ──
      case 'banner-switch-streaming':
         setAudioMode('streaming');
         break;
      case 'banner-switch-offline':
         setAudioMode('offline');
         break;
   }
}

/**
 * Ensures storage permission is granted before starting a murottal download.
 * On web, downloads are handled without filesystem permission.
 * On native Android < 13, shows a rationale dialog before requesting.
 * If permission is denied, the banner stays in idle state (no side effects).
 */
async function _startDownloadWithPermission(surahIndex, totalAyahs, surahTitle) {
   if (Capacitor.isNativePlatform()) {
      const granted = await ensureStoragePermission('murottal_storage');
      if (!granted) return;
   }
   DownloadManager.startSurahDownload(surahIndex, totalAyahs, surahTitle);
}

/**
 * Stops any active playback for the surah, then re-downloads all its audio files.
 * Ensures storage permission first (same guard as a normal download).
 *
 * Called when the user taps the re-download button on a fully-downloaded banner.
 * Displays a multi-language confirmation modal to prevent accidental data usage.
 */
async function _startRedownloadWithPermission(surahIndex, totalAyahs, surahTitle) {
   showConfirmModal({
      title: t('modules/quran/quran-reader:redownload_confirm_title'),
      message: t('modules/quran/quran-reader:redownload_confirm_desc'),
      confirmText: t('modules/quran/quran-reader:redownload_confirm_btn'),
      isDanger: true,
      theme: 'quran',
      onConfirm: async () => {
         if (Capacitor.isNativePlatform()) {
            const granted = await ensureStoragePermission('murottal_storage');
            if (!granted) return;
         }

         // Stop playback if this surah (or any other) is currently playing,
         // so the audio asset is not in use while files are being overwritten.
         const playbackState = AudioService.getPlaybackState();
         if (playbackState.isPlaying) {
            await AudioService.stop();
         }

         DownloadManager.redownloadSurah(surahIndex, totalAyahs, surahTitle);
      }
   });
}

// Murottal Event System 

/**
 * Registers document-level listeners for all murottal events.
 * These drive reactive UI updates on the banner and ayah cards.
 */
function _registerMurottalEvents() {
   _unregisterMurottalEvents();

   const handlers = [
      ['murottal:download-progress', _onMurottalDownloadProgress],
      ['murottal:download-complete', _onMurottalDownloadComplete],
      ['murottal:download-error', _onMurottalDownloadError],
      ['murottal:download-cancelled', _onMurottalDownloadCancelled],
      ['murottal:download-paused', _onMurottalDownloadProgress],
      ['murottal:play-start', _onMurottalPlayStateChange],
      ['murottal:play-pause', _onMurottalPlayStateChange],
      ['murottal:play-resume', _onMurottalPlayStateChange],
      ['murottal:play-stop', _onMurottalPlayStop],
      ['murottal:play-error', _onMurottalPlayError],
      ['murottal:ayah-change', _onMurottalAyahChange],
      ['murottal:buffering-start', _onMurottalBufferingStart],
      ['murottal:buffering-end', _onMurottalBufferingEnd],
   ];

   handlers.forEach(([event, handler]) => {
      document.addEventListener(event, handler);
   });

   _murottalEventHandlers = handlers;
}

/**
 * Unregisters all murottal event listeners.
 */
function _unregisterMurottalEvents() {
   _murottalEventHandlers.forEach(([event, handler]) => {
      document.removeEventListener(event, handler);
   });
   _murottalEventHandlers = [];
}

/**
 * Refreshes all banner buttons in the current view for a given surah.
 * @param {number} surahIndex
 */
function _refreshBannerForSurah(surahIndex) {
   if (!_scrollContainer) return;

   // Find all banner cards for this surah and rebuild their action containers
   const bannerCards = _scrollContainer.querySelectorAll(
      `.quran-reader-surah-info-card[data-surah-index="${surahIndex}"]`
   );

   bannerCards.forEach(card => {
      const totalAyahs = parseInt(card.dataset.totalAyahs, 10);
      const actionContainer = card.querySelector('.quran-reader-surah-action-container');
      if (actionContainer) {
         _rebuildBannerActions(actionContainer, surahIndex, totalAyahs);
      }
   });
}

function _onMurottalDownloadProgress(e) {
   _refreshBannerForSurah(e.detail.surahIndex);
}

function _onMurottalDownloadComplete(e) {
   _refreshBannerForSurah(e.detail.surahIndex);

   // Re-render ayah list so play buttons appear on newly-downloaded ayahs
   if (_currentReaderData.length && !_isReaderSearchActive) {
      const renderId = _renderCtx.incrementAndGet();
      _renderItems(_currentReaderData, renderId);
   }
}

function _onMurottalDownloadError(e) {
   _refreshBannerForSurah(e.detail.surahIndex);
   Notification.info(t('modules/quran/quran-reader:download_failed'));
}

function _onMurottalDownloadCancelled(e) {
   _refreshBannerForSurah(e.detail.surahIndex);
}

function _onMurottalPlayStateChange(e) {
   const idx = e.detail.surahIndex;
   if (idx != null) _refreshBannerForSurah(idx);
}

function _onMurottalPlayStop() {
   // Refresh all banners (we don't know which surah was playing)
   if (!_scrollContainer) return;
   const allBannerCards = _scrollContainer.querySelectorAll('.quran-reader-surah-info-card');
   allBannerCards.forEach(card => {
      const surahIdx = parseInt(card.dataset.surahIndex, 10);
      const totalAyahs = parseInt(card.dataset.totalAyahs, 10);
      const actionContainer = card.querySelector('.quran-reader-surah-action-container');
      if (actionContainer) {
         _rebuildBannerActions(actionContainer, surahIdx, totalAyahs);
      }
   });

   // Remove karaoke highlight
   _clearKaraokeHighlight();
}

/**
 * Handles audio playback errors — notifies the user that recitation could not be played.
 * Triggered by `murottal:play-error` events from the AudioService.
 */
function _onMurottalPlayError() {
   Notification.error(t('modules/quran/quran-reader:play_error'));
}

/**
 * Handles ayah change events — scrolls to and highlights the active ayah (karaoke mode).
 */
function _onMurottalAyahChange(e) {
   if (!_scrollContainer) return;

   const { surahIndex, ayahNumber } = e.detail;

   // Refresh banner to update playing_ayah label
   _refreshBannerForSurah(surahIndex);

   // Remove previous highlight
   _clearKaraokeHighlight();

   // Find and highlight the new active card
   const selector = `.quran-ayah-card[data-ayah-number="${ayahNumber}"][data-surah-index="${surahIndex}"]`;
   const card = _scrollContainer.querySelector(selector);

   if (card) {
      card.classList.add('now-playing');

      // Smooth scroll into view with header offset
      const header = _overlay?.querySelector('.quran-unified-header');
      const headerHeight = header ? header.offsetHeight : 0;
      _scrollContainer.style.scrollPaddingTop = `${headerHeight + 16}px`;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
   }
}

/**
 * Removes the karaoke highlight from all ayah cards.
 */
function _clearKaraokeHighlight() {
   if (!_scrollContainer) return;
   const prev = _scrollContainer.querySelector('.quran-ayah-card.now-playing');
   if (prev) prev.classList.remove('now-playing');
}

function _onMurottalBufferingStart(e) {
   if (!e.detail?.isInitial) return;

   const surahIndex = e.detail.surahIndex;
   if (surahIndex == null || !_scrollContainer) return;

   const activeBanner = _scrollContainer.querySelector(
      `.quran-reader-surah-info-card[data-surah-index="${surahIndex}"] .banner-ctrl-primary`
   );
   if (activeBanner) activeBanner.classList.add('is-loading');
}

function _onMurottalBufferingEnd(e) {
   const surahIndex = e.detail.surahIndex;
   if (surahIndex == null || !_scrollContainer) return;

   const activeBanner = _scrollContainer.querySelector(
      `.quran-reader-surah-info-card[data-surah-index="${surahIndex}"] .banner-ctrl-primary`
   );
   if (activeBanner) activeBanner.classList.remove('is-loading');
}
