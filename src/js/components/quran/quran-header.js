/**
 * Centralized Al-Qur'an Header Component
 * Implements DRY principle for unified headers across page, reader overlay, and pickers.
 */

import { makeAccessibleBtn } from '../../utils/a11y.js';

let _activeHeaders = new Set(); // Keep track of headers to clean up event listeners if needed

/**
 * Creates a unified header element.
 * @param {Object} options
 * @param {string} options.title - The header title.
 * @param {Function} [options.onBack] - Back button callback.
 * @param {string} [options.backAriaLabel='Kembali'] - Accessibility label for back button.
 * @param {string} [options.rightBtnIcon] - E.g. 'bx-search' or 'bx-x'. If omitted, a spacer is left.
 * @param {string} [options.rightBtnAriaLabel=''] - Accessibility label for right action button.
 * @param {Function} [options.onRightBtnClick] - Right action callback.
 * @param {boolean} [options.titleClickable=false] - If true, title has chevron and is clickable.
 * @param {Function} [options.onTitleClick] - Title click callback.
 * @param {string} [options.titleAriaLabel=''] - Accessibility label for title button.
 * @param {boolean} [options.hasSearchInput=false] - If true, adds an integrated search input field.
 * @param {string} [options.searchPlaceholder='Cari...'] - Placeholder for search input.
 * @param {Function} [options.onSearchInput] - Input event callback for the search field.
 * @param {string} [options.className='quran-unified-header'] - Custom root class name (default: unified).
 * @returns {Object} An object containing the element and control methods.
 */
export function createHeader(options = {}) {
   const {
      title = '',
      onBack = null,
      backAriaLabel = 'Kembali',
      rightBtnIcon = null,
      rightBtnAriaLabel = '',
      onRightBtnClick = null,
      titleClickable = false,
      onTitleClick = null,
      titleAriaLabel = '',
      hasSearchInput = false,
      searchPlaceholder = 'Cari...',
      searchInputType = 'text',
      searchInputMode = 'search',
      onSearchInput = null,
      className = 'quran-unified-header'
   } = options;

   const header = document.createElement('div');
   header.className = className;
   // Ensure it can be styled using flexbox
   header.style.display = 'flex';
   header.style.alignItems = 'center';
   header.style.justifyContent = 'space-between';

   // Back Btn
   const backBtn = document.createElement('button');
   backBtn.className = 'quran-header-back-btn quran-icon-btn';
   backBtn.setAttribute('aria-label', backAriaLabel);
   backBtn.innerHTML = `<i class='bx bx-chevron-left'></i>`;
   // In unified layout, back btn usually acts as left slot
   header.appendChild(backBtn);
   if (onBack) makeAccessibleBtn(backBtn, onBack);

   // Title Wrapper
   const titleWrapper = document.createElement(titleClickable ? 'button' : 'div');
   titleWrapper.className = 'quran-header-title-wrapper';
   if (titleAriaLabel) titleWrapper.setAttribute('aria-label', titleAriaLabel);

   const titleText = document.createElement('h1');
   titleText.className = 'quran-header-title';
   titleText.textContent = title;
   titleWrapper.appendChild(titleText);

   if (titleClickable) {
      titleWrapper.classList.add('is-clickable');
      const chevron = document.createElement('i');
      chevron.className = 'bx bx-chevron-down quran-header-title-chevron';
      titleWrapper.appendChild(chevron);
      
      // Style the title wrapper to keep title + chevron centered
      titleWrapper.style.display = 'inline-flex';
      titleWrapper.style.alignItems = 'center';
      titleWrapper.style.gap = '8px';
      titleWrapper.style.cursor = 'pointer';
      titleWrapper.style.border = 'none';
      titleWrapper.style.background = 'transparent';
      titleWrapper.style.padding = '4px 8px';
      
      if (onTitleClick) titleWrapper.addEventListener('click', onTitleClick);
   }
   header.appendChild(titleWrapper);

   // Embedded Search Input (Hidden by default, shown when 'is-searching' class is active)
   let searchInput = null;
   if (hasSearchInput) {
      searchInput = document.createElement('input');
      searchInput.className = 'quran-header-search-input';
      searchInput.type = searchInputType;
      searchInput.inputMode = searchInputMode;
      searchInput.placeholder = searchPlaceholder;
      searchInput.autocomplete = 'off';
      if (onSearchInput) searchInput.addEventListener('input', onSearchInput);
      header.appendChild(searchInput);
   }

   // Right Action Btn or Spacer
   if (rightBtnIcon) {
      const rightBtn = document.createElement('button');
      rightBtn.className = 'quran-header-right-btn quran-icon-btn';
      if (rightBtnAriaLabel) rightBtn.setAttribute('aria-label', rightBtnAriaLabel);
      rightBtn.innerHTML = `<i class='bx ${rightBtnIcon}'></i>`;
      if (onRightBtnClick) makeAccessibleBtn(rightBtn, onRightBtnClick);
      header.appendChild(rightBtn);
   } else {
      const spacer = document.createElement('div');
      spacer.className = 'quran-header-spacer';
      // Ensure spacer has same width as icon btn to keep center aligned
      spacer.style.width = 'var(--header-btn-size, 40px)';
      header.appendChild(spacer);
   }

   const headerInstance = {
      element: header,
      setTitle: (newTitle) => {
         titleText.textContent = newTitle;
      },
      getSearchInput: () => searchInput,
      setRightIcon: (iconClass) => {
         const i = header.querySelector('.quran-header-right-btn i');
         if (i) i.className = `bx ${iconClass}`;
      },
      toggleSearchMode: (isActive) => {
         if (isActive) header.classList.add('is-searching');
         else header.classList.remove('is-searching');
      },
      destroy: () => {
         if (onBack) backBtn.removeEventListener('click', onBack);
         if (titleClickable && onTitleClick) titleWrapper.removeEventListener('click', onTitleClick);
         if (onRightBtnClick) {
            const rightBtn = header.querySelector('.quran-header-right-btn');
            if (rightBtn) rightBtn.removeEventListener('click', onRightBtnClick);
         }
         _activeHeaders.delete(headerInstance);
      }
   };

   _activeHeaders.add(headerInstance);
   return headerInstance;
}

/**
 * Optional legacy wrapper for components setting global title manually 
 * if they don't hold the instance.
 */
export function setTitle(title) {
   const titleEl = document.querySelector('.quran-header-title');
   if (titleEl) {
      titleEl.textContent = title;
   }
}

/**
 * Clean up all tracked headers.
 */
export function destroyAll() {
   _activeHeaders.forEach(instance => instance.destroy());
   _activeHeaders.clear();
}