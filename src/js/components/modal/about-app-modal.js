import { t, loadNS } from '../../core/i18n.js';
import { makeAccessibleBtn, addEscHandler, trapFocus } from '../../utils/a11y.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { CONFIG } from '../../config/version-config.js';

let _overlayEl = null;
let _releaseFocus = null;

export async function showAboutAppModal() {
    if (_overlayEl) removeModal();

    await loadNS('components/modal/about-app-modal');

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    registerModalDismiss(hideAboutAppModal);

    requestAnimationFrame(() => _overlayEl.classList.add('active'));
    _releaseFocus = trapFocus(_overlayEl);
}

export function hideAboutAppModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');

    let isRemoved = false;
    const finalize = () => {
        if (isRemoved) return;
        isRemoved = true;
        removeModal();
    };

    _overlayEl.addEventListener('transitionend', finalize, { once: true });
    // Safety fallback
    setTimeout(finalize, 400);
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
    unregisterModalDismiss(hideAboutAppModal);
}

function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'about-modal-overlay';

    overlay.innerHTML = `
        <div class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
            <div class="about-modal__header">
                <div class="about-modal__logo">
                    <img src="/favicon/favicon.png" alt="App Logo" loading="lazy">
                </div>
                <div class="about-modal__title-group">
                    <div class="about-modal__app-name" id="about-modal-title">${t('common:app_name', { defaultValue: CONFIG.appName })}</div>
                    <div class="about-modal__developer">by ${CONFIG.developer}</div>
                    <div class="about-modal__version">v${CONFIG.version}</div>
                </div>
            </div>
            
            <div class="about-modal__divider"></div>
            
            <div class="about-modal__content">
                <p>${t('components/modal/about-app-modal:description_1', { defaultValue: 'Satu Ramadhan adalah aplikasi islami komprehensif...' })}</p>
                <p>${t('components/modal/about-app-modal:description_2', { defaultValue: 'Dibangun dengan dedikasi tinggi...' })}</p>
            </div>
            
            <div class="about-modal__divider"></div>
            
            <div class="about-modal__footer">
                <button class="btn btn--outline about-modal__close-btn" id="about-modal-close" data-focus-item="true">
                    ${t('common:close', { defaultValue: 'Tutup' })}
                </button>
            </div>
        </div>
    `;

    const closeBtn = overlay.querySelector('#about-modal-close');
    makeAccessibleBtn(closeBtn, hideAboutAppModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            hideAboutAppModal();
        }
    });

    addEscHandler(overlay, hideAboutAppModal);

    return overlay;
}
