/**
 * Surah Card Component
 */

// Utilities & Helpers
import { safeClear, safeAppend } from '../../utils/dom-utils.js';
import { makeAccessibleBtn } from '../../utils/a11y.js';
import { t } from '../../core/i18n.js';
import { escapeHtml } from '../../utils/sanitize.js';

/**
 * Renders a single Surah card.
 */
export function createSurahCard(surah, onClick) {
   const card = document.createElement('div');
   card.className = 'surah-card';
   card.dataset.surahId = surah.index;
   card.setAttribute('data-focus-item', '');
   const typeText = surah.type === 'Makkiyah' ? t('components/quran/quran-card:makkiyah') : t('components/quran/quran-card:madaniyah');

   card.innerHTML = `
      <div class="surah-number-wrapper">
         <div class="surah-number-ornament"></div>
         <span class="surah-number-text">${parseInt(surah.index)}</span>
      </div>
      <div class="surah-info">
         <div class="surah-title-latin">${escapeHtml(surah.title)}</div>
         <div class="surah-details">
            <span class="surah-type surah-type-pill">${typeText}</span>
            <span class="surah-detail-dot"></span>
            <span class="surah-verse-count">${t('components/quran/quran-card:verse_count', { count: surah.count })}</span>
         </div>
      </div>
      <div class="surah-title-arabic">${escapeHtml(surah.titleAr)}</div>
   `;

   if (onClick) {
      makeAccessibleBtn(card, () => onClick(surah));
   }

   return card;
}

/**
 * Converts Western numerals to Arabic numerals.
 */
const _toArabicNumeral = (num) => String(num).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

/**
 * Renders a single Juz card.
 */
export function createJuzCard(juz, onClick) {
   const card = document.createElement('div');
   card.className = 'surah-card';
   card.dataset.juzId = juz.index;
   card.setAttribute('data-focus-item', '');

   const juzIndex = parseInt(juz.index);
   const verseStart = juz.start.verse.replace('verse_', '');
   const verseEnd = juz.end.verse.replace('verse_', '');

   const isSameSurah = juz.start.name === juz.end.name;

   let detailsHtml = '';
   if (isSameSurah) {
      detailsHtml = `
         <span class="surah-type surah-type-pill">${escapeHtml(juz.start.name)} : ${verseStart} - ${verseEnd}</span>
      `;
   } else {
      detailsHtml = `
         <span class="surah-type surah-type-pill">${escapeHtml(juz.start.name)} : ${verseStart}</span>
         <span class="surah-range-dash">-</span>
         <span class="surah-type surah-type-pill">${escapeHtml(juz.end.name)} : ${verseEnd}</span>
      `;
   }

   card.innerHTML = `
      <div class="surah-number-wrapper">
         <div class="surah-number-ornament"></div>
         <span class="surah-number-text">${juzIndex}</span>
      </div>
      <div class="surah-info">
         <div class="surah-title-latin">Juz ${juzIndex}</div>
         <div class="surah-details juz-surah-details">
            ${detailsHtml}
         </div>
      </div>
      <div class="surah-title-arabic">الجزء ${_toArabicNumeral(parseInt(juz.index))}</div>
   `;

   if (onClick) {
      makeAccessibleBtn(card, () => onClick(juz));
   }

   return card;
}

/**
 * Renders a skeleton loading state.
 */
export function createSkeletonCard() {
   const card = document.createElement('div');
   card.className = 'surah-card skeleton';

   card.innerHTML = `
      <div class="surah-number-wrapper"></div>
      <div class="surah-info">
         <div class="surah-title-latin"></div>
         <div class="surah-details"></div>
      </div>
      <div class="surah-title-arabic"></div>
   `;

   return card;
}

/**
 * Creates the Surah list container.
 */
export function createSurahList() {
   const list = document.createElement('div');
   list.className = 'surah-list';
   list.setAttribute('data-focus-group', 'quran-surah-list');
   list.setAttribute('data-focus-direction', 'vertical');
   return list;
}

/**
 * Creates the Juz list container.
 */
export function createJuzList() {
   const list = document.createElement('div');
   list.className = 'surah-list';
   list.setAttribute('data-focus-group', 'quran-juz-list');
   list.setAttribute('data-focus-direction', 'vertical');
   return list;
}

/**
 * Renders the loading indicator.
 */
export function renderLoadingState(container) {
   safeClear(container);
   const loadingEl = document.createElement('div');
   loadingEl.className = 'quran-loading';
   loadingEl.innerHTML = `
      <i class='bx bx-book-reader'></i>
      <p>${t('components/quran/quran-card:loading')}</p>
   `;
   safeAppend(container, loadingEl);
}

/**
 * Renders the empty state.
 */
export function renderEmptyState(container) {
   safeClear(container);
   const emptyEl = document.createElement('div');
   emptyEl.className = 'quran-empty';
   emptyEl.innerHTML = `
      <i class='bx bx-bookmark-alt-minus'></i>   
      <p>${t('components/quran/quran-card:not_found')}</p>
   `;
   safeAppend(container, emptyEl);
}

/**
 * Renders the error state.
 */
export function renderErrorState(container, message = null) {
   const errMsg = escapeHtml(message || t('components/quran/quran-card:error_load'));
   safeClear(container);
   const errorEl = document.createElement('div');
   errorEl.className = 'quran-empty';
   errorEl.innerHTML = `
      <i class='bx bx-error-circle'></i>
      <p>${errMsg}</p>
   `;
   safeAppend(container, errorEl);
}

/**
 * Renders a single Bookmark card.
 * @param {Object} bookmark - Bookmark data
 * @param {Object} surah - Surah metadata
 * @param {Function} onClick - Handler for opening the bookmarked verse
 * @param {Function} [onDelete] - Handler for removing the bookmark
 * @param {Function} [onEditNote] - Handler for editing the custom note
 * @param {Function} [onToggleCategory] - Handler for managing folder tags
 */
export function createBookmarkCard(bookmark, surah, onClick, onDelete, onEditNote, onToggleCategory) {
   const card = document.createElement('div');
   card.className = 'surah-card bookmark-card';
   card.setAttribute('data-focus-item', '');
   card.dataset.bookmarkKey = bookmark.key;

   const typeText = bookmark.type === 'Makkiyah' ? t('components/quran/quran-card:makkiyah') : t('components/quran/quran-card:madaniyah');
   const isJuzMode = bookmark.readMode === 'juz' && bookmark.juzIndex;

   const titleLatin = isJuzMode ? `Juz ${bookmark.juzIndex}` : (surah ? surah.title : bookmark.surahTitle);
   const titleAr = isJuzMode ? `الجزء ${_toArabicNumeral(parseInt(bookmark.juzIndex))}` : (surah ? surah.titleAr : bookmark.surahTitleAr);
   const topNumber = isJuzMode ? bookmark.juzIndex : bookmark.surahIndex;

   let primaryBadge = isJuzMode ? (surah ? surah.title : bookmark.surahTitle) : typeText;

   let noteHtml = '';
   if (bookmark.note && bookmark.note.trim() !== '') {
      noteHtml = `
         <div class="bookmark-note-container">
            <span class="bookmark-note-badge">
               <i class='bx bxs-note'></i>
               ${escapeHtml(bookmark.note)}
            </span>
         </div>
      `;
   }

   card.innerHTML = `
      <div class="surah-number-wrapper">
         <div class="surah-number-ornament"></div>
         <span class="surah-number-text">${topNumber}</span>
      </div>
      <div class="surah-info">
         <div class="surah-title-latin">${escapeHtml(titleLatin)}</div>
         <div class="surah-details">
            <span class="surah-type surah-type-pill">${escapeHtml(primaryBadge)}</span>
            <span class="surah-detail-dot"></span>
            <span class="bookmark-verse-badge">
               <i class='bx bxs-bookmark-alt'></i>
               ${t('components/quran/quran-card:ayat', { verseNumber: bookmark.verseNumber })}
            </span>
         </div>
         ${noteHtml}
      </div>
      <div class="bookmark-actions"></div>
   `;

   if (onClick) {
      makeAccessibleBtn(card, () => onClick(bookmark, surah));
   }

   const actionsContainer = card.querySelector('.bookmark-actions');

   const hasActions = onDelete || onEditNote || onToggleCategory;
   if (hasActions) {
      const kebabBtn = document.createElement('button');
      kebabBtn.className = 'bookmark-action-btn bookmark-action-btn--menu';
      kebabBtn.setAttribute('aria-label', t('components/quran/quran-card:menu'));
      kebabBtn.innerHTML = `<i class='bx bx-dots-vertical-rounded'></i>`;
      kebabBtn.addEventListener('click', (e) => {
         e.stopPropagation();
         _showBookmarkDropdown(kebabBtn, bookmark, card, onEditNote, onToggleCategory, onDelete);
      });
      actionsContainer.appendChild(kebabBtn);
   }

   return card;
}

/**
 * Closes any open bookmark card dropdown.
 */
function _closeActiveDropdown() {
   document.querySelectorAll('.bookmark-card-dropdown').forEach(d => d.remove());
}

/**
 * Opens a kebab dropdown menu anchored to the given button.
 * @param {HTMLElement} anchorEl
 * @param {Object} bookmark
 * @param {HTMLElement} cardEl
 * @param {Function} [onEditNote]
 * @param {Function} [onToggleCategory]
 * @param {Function} [onDelete]
 */
function _showBookmarkDropdown(anchorEl, bookmark, cardEl, onEditNote, onToggleCategory, onDelete) {
   _closeActiveDropdown();

   const rect = anchorEl.getBoundingClientRect();
   const dropdown = document.createElement('div');
   dropdown.className = 'bookmark-action-dropdown bookmark-card-dropdown active';

   // Runtime-computed coordinates (cannot be expressed in CSS)
   dropdown.style.top = `${rect.bottom + 8}px`;
   dropdown.style.right = `${window.innerWidth - rect.right}px`;

   if (onEditNote) {
      const editItem = document.createElement('button');
      editItem.className = 'bookmark-dropdown-item';
      editItem.innerHTML = `<i class='bx bx-pencil'></i> <span>${t('components/quran/quran-card:edit_note')}</span>`;
      editItem.addEventListener('click', (e) => {
         e.stopPropagation();
         dropdown.remove();
         onEditNote(bookmark, cardEl);
      });
      dropdown.appendChild(editItem);
   }

   if (onToggleCategory) {
      const moveItem = document.createElement('button');
      moveItem.className = 'bookmark-dropdown-item';
      moveItem.innerHTML = `<i class='bx bx-folder'></i> <span>${t('components/quran/quran-card:move_to_folder')}</span>`;
      moveItem.addEventListener('click', (e) => {
         e.stopPropagation();
         dropdown.remove();
         onToggleCategory(bookmark, cardEl);
      });
      dropdown.appendChild(moveItem);
   }

   if (onDelete) {
      const deleteItem = document.createElement('button');
      deleteItem.className = 'bookmark-dropdown-item bookmark-dropdown-item--danger';
      deleteItem.innerHTML = `<i class='bx bx-trash'></i> <span>${t('components/quran/quran-card:delete_bookmark')}</span>`;
      deleteItem.addEventListener('click', (e) => {
         e.stopPropagation();
         dropdown.remove();
         onDelete(bookmark, cardEl);
      });
      dropdown.appendChild(deleteItem);
   }

   document.body.appendChild(dropdown);

   // Close on outside click
   setTimeout(() => {
      const closeHandler = (e) => {
         if (!dropdown.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', closeHandler);
         }
      };
      document.addEventListener('click', closeHandler);

      // Close on scroll inside list wrapper
      const scrollParent = cardEl.closest('.bookmark-list-wrapper');
      if (scrollParent) {
         scrollParent.addEventListener('scroll', () => {
            dropdown.remove();
            document.removeEventListener('click', closeHandler);
         }, { once: true });
      }
   }, 10);
}

/**
 * Creates the Bookmark list container.
 */
export function createBookmarkList() {
   const list = document.createElement('div');
   list.className = 'surah-list';
   list.setAttribute('data-focus-group', 'quran-bookmark-list');
   list.setAttribute('data-focus-direction', 'vertical');
   return list;
}