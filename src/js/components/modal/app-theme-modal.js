/**
 * App Theme Modal Component
 * Slider Modal UI for choosing application theme (Dark, Teal, Auto)
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { store } from '../../core/store.js';

let _overlayEl = null;
let _releaseFocus = null;

const THEMES = [
    { code: 'dark', icon: 'bx-moon', tlKey: 'theme_dark' },
    { code: 'teal', icon: 'bx-sun', tlKey: 'theme_teal' },
    { code: 'auto', icon: 'bx-cog', tlKey: 'theme_auto' }
];

export async function showAppThemeModal() {
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    await loadNS('components/modal/app-theme-modal');

    const currentTheme = store.getState('settings.theme') ?? 'auto';

    _overlayEl = createModalDOM(currentTheme);
    document.body.appendChild(_overlayEl);

    registerModalDismiss(handleCancel);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);
    bindEvents();
}

function handleSelect(themeCode, event) {
    if (event) event.stopPropagation();
    impact('light');

    const selectedItem = _overlayEl.querySelector(`.lang-option[data-code="${themeCode}"]`);
    if (selectedItem) {
        _overlayEl.querySelectorAll('.lang-option').forEach(el => el.classList.remove('selected'));
        selectedItem.classList.add('selected');
    }

    // Pre-calculate coordinates before event is lost
    let startX = innerWidth / 2;
    let startY = innerHeight / 2;
    if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        startX = event.clientX ?? (rect.left + rect.width / 2);
        startY = event.clientY ?? (rect.top + rect.height / 2);
    }

    const currentTheme = store.getState('settings.theme');

    if (currentTheme !== themeCode) {
        executeThemeChangeWithTransition(themeCode, startX, startY);
    }
}

function handleCancel(e) {
    if (e) e.stopPropagation();
    hideModal();
}

function bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) handleCancel(e);
    });

    const options = _overlayEl.querySelectorAll('.lang-option');
    options.forEach(option => {
        option.addEventListener('click', (e) => {
            const code = option.getAttribute('data-code');
            handleSelect(code, e);
        });
    });

    addEscHandler(_overlayEl, handleCancel);
}

function hideModal(onClosed) {
    if (!_overlayEl) {
        if (onClosed) onClosed();
        return;
    }

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    let isClosed = false;
    const finalize = () => {
        if (isClosed) return;
        isClosed = true;
        removeModal();
        if (onClosed) onClosed();
    };

    const sheet = _overlayEl.querySelector('.language-selector-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', finalize, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', finalize, { once: true });
    }

    setTimeout(finalize, 450);
}

function removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
}

function createModalDOM(currentTheme) {
    const overlay = document.createElement('div');
    overlay.className = 'language-selector-overlay';

    const optionsHTML = THEMES.map(theme => {
        const isSelected = theme.code === currentTheme;
        return `
            <button class="lang-option ${isSelected ? 'selected' : ''}" data-code="${theme.code}" data-focus-item>
                <i class='bx ${theme.icon} lang-icon'></i>
                <div class="lang-info">
                    <div class="lang-label">${t(`components/modal/app-theme-modal:${theme.tlKey}`)}</div>
                    <div class="lang-desc">${t(`components/modal/app-theme-modal:${theme.tlKey}_desc`)}</div>
                </div>
                <i class='bx bx-check lang-check'></i>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="language-selector-sheet" role="dialog" aria-modal="true" aria-labelledby="app-theme-modal-title">
            <div class="language-selector-header">
                <h3 class="language-selector-title" id="app-theme-modal-title">${t('components/modal/app-theme-modal:title')}</h3>
            </div>
            <div class="lang-options-container" data-focus-group="lang-options" data-focus-direction="vertical">
                ${optionsHTML}
            </div>
            <div class="language-selector-footer">
                <button class="btn btn--outline w-100" id="theme-btn-cancel">${t('close')}</button>
            </div>
        </div>
    `;

    const cancelBtn = overlay.querySelector('#theme-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    return overlay;
}

/**
 * Handles the View Transition API for expanding circular reveal
 */
function executeThemeChangeWithTransition(themeCode, x, y) {
    // If the browser doesn't support View Transitions, just apply directly.
    if (!document.startViewTransition) {
        store.setState('settings.theme', themeCode);
        return;
    }

    // Calculate the distance to the farthest corner
    const endRadius = Math.hypot(
        Math.max(x, innerWidth - x),
        Math.max(y, innerHeight - y)
    );

    document.documentElement.classList.add('theme-transitioning');

    // Execution freezes frame
    const transition = document.startViewTransition(() => {
        store.setState('settings.theme', themeCode);
    });

    transition.ready.then(() => {
        // Dummy animation on old view to prevent browser from culling it early
        document.documentElement.animate(
            { opacity: [1, 1] },
            {
                duration: 900,
                pseudoElement: '::view-transition-old(root)'
            }
        );

        // Native CSS animation overriding the default crossfade
        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`
                ]
            },
            {
                duration: 900,
                easing: 'ease-in-out',
                pseudoElement: '::view-transition-new(root)'
            }
        );
    }).finally(() => {
        document.documentElement.classList.remove('theme-transitioning');
    });
}
