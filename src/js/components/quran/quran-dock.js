/**
 * Al-Quran Dock Component
 */

const DOCK_ITEMS = [
   { id: 'surah', icon: 'bx-book-content', label: 'Surah' },
   { id: 'read', icon: 'bx-book-open', label: 'Juz' },
   { id: 'bookmark', icon: 'bxs-book-bookmark', label: 'Bookmark' },
   { id: 'settings', icon: 'bx-cog', label: 'Setelan' }
];

let _container = null;
let _dockEl = null;
let _slider = null;
let _onNavigate = null;
let _currentItem = 'surah';

/**
 * Render Quran dock
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
 * Handle dock item click
 */
function handleItemClick(itemId) {
   setActive(itemId);
   if (_onNavigate) {
      _onNavigate(itemId);
   }
}

/**
 * Set active dock item
 */
export function setActive(itemId) {
   if (!_dockEl) return;

   _currentItem = itemId;

   const items = _dockEl.querySelectorAll('.quran-dock-item');
   let activeIndex = 0;

   items.forEach((item, i) => {
      const isActive = item.dataset.item === itemId;
      item.classList.toggle('active', isActive);
      if (isActive) activeIndex = i;
   });

   if (_slider && items.length > 0) {
      const activeItem = items[activeIndex];
      if (activeItem) {
         const centerX = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
         _slider.style.left = `${centerX}px`;
      }
   }
}

/**
 * Get current active item
 */
export function getActive() {
   return _currentItem;
}

/**
 * Show dock
 */
export function show() {
   if (!_dockEl) return;
   _dockEl.classList.remove('hide');
   _dockEl.classList.add('show');
}

/**
 * Hide dock
 */
export function hide() {
   if (!_dockEl) return;
   _dockEl.classList.remove('show');
   _dockEl.classList.add('hide');
}

/**
 * Cleanup
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
 * Reposition active indicator on resize
 */
let _resizeTimer;
window.addEventListener('resize', () => {
   clearTimeout(_resizeTimer);
   _resizeTimer = setTimeout(() => {
      const activeItem = _dockEl?.querySelector('.quran-dock-item.active');
      if (activeItem && _slider) {
         const centerX = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
         _slider.style.left = `${centerX}px`;
      }
   }, 100);
});