/**
 * Bottom Navigation Bar Component
 * Renders bottom nav with 4 tabs and sliding active indicator
 */

const TABS = [
    { id: 'home', icon: 'bx-home-alt', label: 'Home' },
    { id: 'schedule', icon: 'bx-calendar', label: 'Jadwal' },
    { id: 'compass', icon: 'bx-compass', label: 'Kompas' },
    { id: 'settings', icon: 'bx-cog', label: 'Setelan' },
];

let _container = null;
let _onNavigate = null;
let _slider = null;

/**
 * Render the navigation bar
 */
export function render(container, onNavigate) {
    _container = container;
    _onNavigate = onNavigate;
    _container.innerHTML = '';

    // Background oval
    const bgOval = document.createElement('div');
    bgOval.className = 'nav-background-oval';
    _container.appendChild(bgOval);

    // Foreground nav list
    const list = document.createElement('div');
    list.className = 'nav-list';

    // Sliding indicator (single element that moves)
    _slider = document.createElement('span');
    _slider.className = 'nav-slider';
    list.appendChild(_slider);

    TABS.forEach(tab => {
        const item = document.createElement('button');
        item.className = 'nav-item';
        item.dataset.tab = tab.id;
        item.setAttribute('aria-label', tab.label);

        const icon = document.createElement('i');
        icon.className = `bx ${tab.icon}`;
        item.appendChild(icon);

        item.addEventListener('click', () => handleClick(tab.id));
        list.appendChild(item);
    });

    _container.appendChild(list);
    setActive('home');
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
        const list = _slider.parentElement;
        if (activeItem && list) {
            const listRect = list.getBoundingClientRect();
            const itemRect = activeItem.getBoundingClientRect();
            const offsetX = itemRect.left - listRect.left + (itemRect.width / 2);
            _slider.style.left = `${offsetX}px`;
        }
    }
}

/**
 * Cleanup
 */
export function destroy() {
    _container = null;
    _onNavigate = null;
    _slider = null;
}
