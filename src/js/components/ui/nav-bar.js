/**
 * Bottom Navigation Bar Component
 * Renders bottom nav with 4 tabs and sliding active indicator
 */

import { t, loadNS } from '../../core/i18n.js';

const TAB_DEFS = [
    { id: 'home',     icon: 'bx-home-alt',    labelKey: 'home' },
    { id: 'schedule', icon: 'bx-calendar',     labelKey: 'schedule' },
    { id: 'compass',  icon: 'bx-compass',      labelKey: 'compass' },
    { id: 'quran',    icon: 'bx-book-reader',  labelKey: 'quran' },
    { id: 'settings', icon: 'bx-cog',          labelKey: 'settings' },
];

let _container = null;
let _onNavigate = null;
let _slider = null;

/**
 * Render the navigation bar
 */
export async function render(container, onNavigate, initialActiveTabId = 'home') {
    _container = container;
    _onNavigate = onNavigate;
    _container.innerHTML = '';

    await loadNS('components/ui/nav-bar');

    // Background oval
    const bgOval = document.createElement('div');
    bgOval.className = 'nav-background-oval';
    _container.appendChild(bgOval);

    // Foreground nav list
    const list = document.createElement('div');
    list.className = 'nav-list';
    list.setAttribute('data-focus-group', 'bottom-nav');
    list.setAttribute('data-focus-direction', 'horizontal');

    // Sliding indicator (single element that moves)
    _slider = document.createElement('span');
    _slider.className = 'nav-slider';
    // Temporarily disable transition during initial mount to prevent animated visual glitch
    _slider.style.transition = 'none';
    list.appendChild(_slider);

    TAB_DEFS.forEach(tab => {
        const label = t(`components/ui/nav-bar:${tab.labelKey}`);
        const item = document.createElement('button');
        item.className = 'nav-item';
        item.dataset.tab = tab.id;
        item.setAttribute('aria-label', label);
        item.setAttribute('data-focus-item', 'true');

        const icon = document.createElement('i');
        icon.className = `bx ${tab.icon}`;
        item.appendChild(icon);

        item.addEventListener('click', () => handleClick(tab.id));
        list.appendChild(item);
    });

    _container.appendChild(list);
    setActive(initialActiveTabId);

    // Restore transition after the very first paint so subsequent clicks animate
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (_slider) _slider.style.transition = '';
        });
    });
}

/**
 * Handle tab click with haptic feedback
 */
function handleClick(tabId) {
    setActive(tabId);
    if (_onNavigate) _onNavigate(tabId);
}

/**
 * Set the active tab and slide the indicator
 */
export function setActive(tabId) {
    if (!_container) return;

    const items = _container.querySelectorAll('.nav-item');
    let activeIndex = 0;

    items.forEach((item, i) => {
        const isActive = item.dataset.tab === tabId;
        item.classList.toggle('active', isActive);
        if (isActive) activeIndex = i;
    });

    // Move the slider to the active tab position
    if (_slider && items.length > 0) {
        const activeItem = items[activeIndex];
        if (activeItem) {
            // Using offsetLeft provides precise position relative to parent padding-box
            const centerX = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
            _slider.style.left = `${centerX}px`;
        }
    }
}

/**
 * Handle window resize to reposition active indicator
 */
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const activeItem = _container?.querySelector('.nav-item.active');
        if (activeItem && _slider) {
            const centerX = activeItem.offsetLeft + (activeItem.offsetWidth / 2);
            _slider.style.left = `${centerX}px`;
        }
    }, 100);
});

/**
 * Cleanup
 */
export function destroy() {
    _container = null;
    _onNavigate = null;
    _slider = null;
}
