/**
 * Mushaf Guide Modal Component
 * Shows mushaf reading and navigation instructions.
 */

// Core & Libraries
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

let _overlayEl = null;
let _releaseFocus = null;

/**
 * Show the mushaf guide modal.
 */
export async function showMushafGuideModal() {
    await loadNS('components/modal/mushaf-guide-modal');
    
    // Prevent duplicates
    if (_overlayEl) removeModal();

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideModal);

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    const btnClose = _overlayEl.querySelector('#mushaf-guide-close');
    btnClose?.addEventListener('click', hideModal);

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) {
            hideModal();
        }
    });

    addEscHandler(_overlayEl, hideModal);
}

/**
 * Hide the modal with exit animation, then remove from DOM.
 */
export function hideModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');

    let isRemoved = false;
    const finalize = () => {
        if (isRemoved) return;
        isRemoved = true;
        removeModal();
    };

    _overlayEl.addEventListener('transitionend', finalize, { once: true });
    // Safety: force remove after animation duration
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
    // Unregister from hardware back handler
    unregisterModalDismiss(hideModal);
}

/**
 * Create the modal DOM tree.
 */
function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'mushaf-guide-modal-overlay';

    overlay.innerHTML = `
        <div class="mushaf-guide-modal">
            <div class="mushaf-guide-modal__icon">
                <i class='bx bx-book-reader'></i>
            </div>
            <h2 class="mushaf-guide-modal__title">${t('components/modal/mushaf-guide-modal:title')}</h2>
            <div class="mushaf-guide-modal__items">
                <div class="mushaf-guide-item">
                    <i class='bx bx-navigation'></i>
                    <span>${t('components/modal/mushaf-guide-modal:item_1')}</span>
                </div>
                <div class="mushaf-guide-item">
                    <i class='bx bx-zoom-in'></i>
                    <span>${t('components/modal/mushaf-guide-modal:item_2')}</span>
                </div>
                <div class="mushaf-guide-item">
                    <i class='bx bx-menu'></i>
                    <span>${t('components/modal/mushaf-guide-modal:item_3')}</span>
                </div>
            </div>
            <div class="mushaf-guide-modal__buttons">
                <button class="mushaf-guide-modal__btn-close" id="mushaf-guide-close">
                    ${t('components/modal/mushaf-guide-modal:close')}
                </button>
            </div>
        </div>
    `;

    return overlay;
}
