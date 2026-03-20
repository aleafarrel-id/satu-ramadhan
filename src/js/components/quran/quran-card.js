/**
 * Surah Card Component
 */

import { makeAccessibleBtn } from '../../utils/a11y.js';

/**
 * Renders a single Surah card.
 */
export function createSurahCard(surah, onClick) {
   const card = document.createElement('div');
   card.className = 'surah-card';
   card.dataset.surahId = surah.index;
   card.setAttribute('data-focus-item', '');
   const typeText = surah.type === 'Makkiyah' ? 'Makkiyah' : 'Madaniyah';

   card.innerHTML = `
      <div class="surah-number-wrapper">
         <div class="surah-number-ornament"></div>
         <span class="surah-number-text">${parseInt(surah.index)}</span>
      </div>
      <div class="surah-info">
         <div class="surah-title-latin">${surah.title}</div>
         <div class="surah-details">
            <span class="surah-type surah-type-pill">${typeText}</span>
            <span class="surah-detail-dot"></span>
            <span class="surah-verse-count">${surah.count} Ayat</span>
         </div>
      </div>
      <div class="surah-title-arabic">${surah.titleAr}</div>
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
         <span class="surah-type surah-type-pill">${juz.start.name} : ${verseStart} - ${verseEnd}</span>
      `;
   } else {
      detailsHtml = `
         <span class="surah-type surah-type-pill">${juz.start.name} : ${verseStart}</span>
         <span class="surah-range-dash">-</span>
         <span class="surah-type surah-type-pill">${juz.end.name} : ${verseEnd}</span>
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
   container.innerHTML = `
      <div class="quran-loading">
         <i class='bx bx-book-reader'></i>
         <p>Memuat Al-Qur'an</p>
      </div>
   `;
}

/**
 * Renders the empty state.
 */
export function renderEmptyState(container) {
   container.innerHTML = `
      <div class="quran-empty">
         <i class='bx bx-bookmark-alt-minus'></i>   
         <p>Surah tidak ditemukan</p>
      </div>
   `;
}

/**
 * Renders the error state.
 */
export function renderErrorState(container, message = "Gagal Memuat Al-Qur'an") {
   container.innerHTML = `
      <div class="quran-empty">
         <i class='bx bx-error-circle'></i>
         <p>${message}</p>
      </div>
   `;
}

/**
 * Renders a single Bookmark card.
 * @param {Object} bookmark - Bookmark data
 * @param {Object} surah - Surah metadata
 * @param {Function} onClick - Handler for opening the bookmarked verse
 * @param {Function} [onDelete] - Handler for removing the bookmark
 */
export function createBookmarkCard(bookmark, surah, onClick, onDelete) {
   const card = document.createElement('div');
   card.className = 'surah-card bookmark-card';
   card.setAttribute('data-focus-item', '');
   card.dataset.bookmarkKey = bookmark.key;

   const typeText = bookmark.type === 'Makkiyah' ? 'Makkiyah' : 'Madaniyah';
   const titleLatin = surah ? surah.title : bookmark.surahTitle;
   const titleAr = surah ? surah.titleAr : bookmark.surahTitleAr;
   const surahNum = bookmark.surahIndex;

   card.innerHTML = `
      <div class="surah-number-wrapper">
         <div class="surah-number-ornament"></div>
         <span class="surah-number-text">${surahNum}</span>
      </div>
      <div class="surah-info">
         <div class="surah-title-latin">${titleLatin}</div>
         <div class="surah-details">
            <span class="surah-type surah-type-pill">${typeText}</span>
            <span class="surah-detail-dot"></span>
            <span class="bookmark-verse-badge">
               <i class='bx bxs-bookmark-alt'></i>
               Ayat ${bookmark.verseNumber}
            </span>
         </div>
      </div>
      <div class="surah-title-arabic">${titleAr}</div>
   `;

   if (onClick) {
      makeAccessibleBtn(card, () => onClick(bookmark, surah));
   }

   // Delete button (overlays the Arabic title area)
   if (onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'bookmark-delete-btn';
      deleteBtn.setAttribute('aria-label', 'Hapus bookmark');
      deleteBtn.innerHTML = `<i class='bx bx-trash'></i>`;
      deleteBtn.addEventListener('click', (e) => {
         e.stopPropagation();
         onDelete(bookmark, card);
      });
      card.appendChild(deleteBtn);
   }

   return card;
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