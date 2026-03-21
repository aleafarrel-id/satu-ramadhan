/**
 * Dock Navigation Component
 */

const DOCK_ITEMS = [
   { id: 'surah', icon: 'bx-book-content', label: 'Surah' },
   { id: 'juz', icon: 'bx-book-open', label: 'Juz' },
   { id: 'mushaf', icon: 'bx-book-reader', label: 'Mushaf' },
   { id: 'bookmark', icon: 'bxs-book-bookmark', label: 'Bookmark' }
];

let _container = null;
let _dockEl = null;
let _slider = null;
let _onNavigate = null;
let _currentItem = 'surah';

/**
 * Initializes and renders the dock.
 */
export function render(container, onNavigate) {
   _container = container;
   _onNavigate = onNavigate;
   _dockEl = document.createElement('div');
   _dockEl.className = 'quran-dock';

   const bgOval = document.createElement('div');
   bgOval.className = 'quran-dock-bg-oval';
   _dockEl.appendChild(bgOval);

   const list = document.createElement('div');
   list.className = 'quran-dock-list';
   list.setAttribute('data-focus-group', 'quran-dock');
   list.setAttribute('data-focus-direction', 'horizontal');
   list.setAttribute('data-focus-wrap', 'true');

   _slider = document.createElement('span');
   _slider.className = 'quran-dock-slider';
   list.appendChild(_slider);

   DOCK_ITEMS.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'quran-dock-item';
      btn.dataset.item = item.id;
      btn.setAttribute('aria-label', item.label);
      btn.setAttribute('data-focus-item', '');

      const icon = document.createElement('i');
      icon.className = `bx ${item.icon}`;
      btn.appendChild(icon);

      btn.addEventListener('click', () => handleItemClick(item.id));
      list.appendChild(btn);
   });

   _dockEl.appendChild(list);
   _container.appendChild(_dockEl);

   requestAnimationFrame(() => {
      _dockEl.classList.add('show');
   });

   setActive('surah');
}

/**
 * Handles dock item clicks.
 */
function handleItemClick(itemId) {
   setActive(itemId);
   if (_onNavigate) {
      _onNavigate(itemId);
   }
}

/**
 * Sets the active dock item.
 */
export function setActive(itemId) {
   if (!_dockEl) return;

   _currentItem = itemId;

   const items = _dockEl.querySelectorAll('.quran-dock-item');
   let activeItem = null;

   items.forEach((item) => {
      const isActive = item.dataset.item === itemId;
      item.classList.toggle('active', isActive);
      if (isActive) activeItem = item;
   });

   updateSliderPosition(activeItem);
}

/**
 * Updates the active indicator slider position.
 */
function updateSliderPosition(activeItem) {
   if (_slider && activeItem) {
      const centerX = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
      _slider.style.left = `${centerX}px`;
   }
}

/**
 * Returns the currently active item ID.
 */
export function getActive() {
   return _currentItem;
}

/**
 * Shows the dock.
 */
export function show() {
   if (!_dockEl) return;
   _dockEl.classList.remove('hide');
   _dockEl.classList.add('show');
}

/**
 * Hides the dock.
 */
export function hide() {
   if (!_dockEl) return;
   _dockEl.classList.remove('show');
   _dockEl.classList.add('hide');
}

/**
 * Destroys the dock and cleans up DOM.
 */
export function destroy() {
   if (_dockEl && _dockEl.parentNode) {
      _dockEl.parentNode.removeChild(_dockEl);
   }

   _container = null;
   _dockEl = null;
   _slider = null;
   _onNavigate = null;
   _currentItem = 'surah';
}

/**
 * Refreshes slider position on window resize.
 */
let _resizeTimer;
window.addEventListener('resize', () => {
   clearTimeout(_resizeTimer);
   _resizeTimer = setTimeout(() => {
      const activeItem = _dockEl?.querySelector('.quran-dock-item.active');
      updateSliderPosition(activeItem);
   }, 100);
});