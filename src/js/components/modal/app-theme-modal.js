/**
 * App Theme Modal Component
 * Slider Modal UI for choosing application theme (Dark, Teal, Auto)
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { executeThemeTransition } from '../../utils/theme-transition.js';
import { t, loadNS } from '../../core/i18n.js';
import { store } from '../../core/store.js';
import { isDarkPrayer, applyToDOM } from '../../core/theme.js';

let _overlayEl = null;
let _releaseFocus = null;

const THEMES = [
    { code: 'dark', icon: 'bx-moon', tlKey: 'theme_dark' },
    { code: 'teal', icon: 'bx-sun', tlKey: 'theme_teal' },
    { code: 'auto', icon: 'bxs-hourglass', tlKey: 'theme_auto' }
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

let _isTransitioning = false;

async function handleSelect(themeCode, event) {
    if (_isTransitioning) return;
    if (event) event.stopPropagation();

    const currentThemeSetting = store.getState('settings.theme');
    if (currentThemeSetting === themeCode) return;

    const selectedItem = _overlayEl.querySelector(`.lang-option[data-code="${themeCode}"]`);
    if (selectedItem) {
        _overlayEl.querySelectorAll('.lang-option').forEach(el => el.classList.remove('selected'));
        selectedItem.classList.add('selected');
    }

    impact('light');

    let startX = document.documentElement.clientWidth / 2;
    let startY = document.documentElement.clientHeight / 2;
    if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        startX = event.clientX ?? (rect.left + rect.width / 2);
        startY = event.clientY ?? (rect.top + rect.height / 2);
    }

    let isTargetDark = themeCode === 'dark';

    if (themeCode === 'auto') {
        try {
            const [pwm, pt] = await Promise.all([
                import('../../modules/prayer/prayer-watcher.js'),
                import('../../modules/prayer/prayer-times.js')
            ]);

            const timings = pwm.getCurrentTimings ? pwm.getCurrentTimings() : null;
            if (timings) {
                const state = pt.getCurrentPrayer(timings);
                if (state && state.current) {
                    isTargetDark = isDarkPrayer(state.current.key);
                }
            }
        } catch (e) {
            isTargetDark = false;
        }
    }

    const isCurrentlyDark = document.documentElement.dataset.theme === 'dark';

    if (isCurrentlyDark === isTargetDark) {
        store.setState('settings.theme', themeCode);
        hideModal();
        return;
    }

    hideModal(() => {
        _isTransitioning = true;
        executeThemeTransition({
            x: startX,
            y: startY,
            updateDOMCallback: () => {
                // Force sync DOM state for correct View Transition capture
                applyToDOM(isTargetDark);

                // Sync global state
                store.setState('settings.theme', themeCode);
            }
        }).then(() => {
            _isTransitioning = false;
        });
    });
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

