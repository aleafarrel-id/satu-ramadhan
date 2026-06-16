/**
 * Calculation Method Modal Component
 * Allows user to manually select a prayer calculation method or revert to Automatic.
 */

import methodsData from '../../../data/calculation-methods.json';
import { getActiveMethodConfig, setManualMethod, resetToAutoMethod } from '../../core/calculation-resolver.js';
import { store } from '../../core/store.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';
import { setSelectedOrg } from '../../modules/schedule/ramadhan.js';

let _overlayEl = null;
let _onSelectCallback = null;
let _releaseFocus = null;

export async function showCalculationMethodModal({ onMethodChanged } = {}) {
    if (_overlayEl) {
        unregisterModalDismiss(handleCancel);
        removeModal();
    }

    await loadNS('components/modal/calculation-method-modal');

    _onSelectCallback = onMethodChanged;

    _overlayEl = createModalDOM();
    getModalRoot().appendChild(_overlayEl);

    registerModalDismiss(handleCancel);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);

    bindEvents();
}

async function handleSelect(id, e) {
    if (e) e.stopPropagation();
    impact('light');

    if (id === 'auto') {
        resetToAutoMethod();
        // If user is in Indonesia, auto resolves to Kemenag RI. Sync org to 'nu'
        const loc = store.getState('location');
        if (loc?.countryCode === 'ID') {
            await setSelectedOrg('nu');
        }
    } else {
        const methodId = parseInt(id, 10);
        setManualMethod(methodId);
        
        // Sync org if applicable
        if (methodId === 24) {
            await setSelectedOrg('muhammadiyah');
        } else if (methodId === 20) {
            await setSelectedOrg('nu');
        }
    }

    if (_onSelectCallback) {
        _onSelectCallback();
    }

    hideModal();
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

    const items = _overlayEl.querySelectorAll('.calc-method-item');
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            const id = item.getAttribute('data-id');
            handleSelect(id, e);
        });
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const id = item.getAttribute('data-id');
                handleSelect(id, e);
            }
        });
    });

    addEscHandler(_overlayEl, handleCancel);
}

function hideModal() {
    if (!_overlayEl) return;

    unregisterModalDismiss(handleCancel);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.language-selector-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    setTimeout(removeModal, 450);
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
    _onSelectCallback = null;
}

function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-base modal-overlay-base--bottom calc-method-overlay';

    const isAuto = store.getState('settings.calculation.isAutoDetected');
    const currentMethod = store.getState('settings.calculation.method');
    const activeConfig = getActiveMethodConfig();

    // Auto Option
    const autoOptionHTML = `
        <div class="calc-method-item ${isAuto ? 'selected' : ''}" data-id="auto" data-focus-item tabindex="0">
            <div class="calc-method-radio">
                ${isAuto ? '<i class="bx bx-check"></i>' : ''}
            </div>
            <div class="calc-method-info">
                <div class="calc-method-name">
                    ${t('components/settings/settings-calculation-panel:mode_auto')}
                </div>
                <div class="calc-method-desc">
                    ${t('components/settings/settings-calculation-panel:desc')}
                </div>
                <div class="calc-method-badges">
                    <span class="calc-method-badge calc-method-badge--auto">${t('components/modal/calculation-method-modal:badge_auto')}</span>
                    ${isAuto ? `<span class="calc-method-badge calc-method-badge--resolved"><i class='bx bx-check-double'></i> ${activeConfig.shortName || activeConfig.name}</span>` : ''}
                </div>
            </div>
        </div>
    `;

    // Method List
    const methodListHTML = methodsData.methods.map(method => {
        const isSelected = !isAuto && currentMethod === method.id;

        return `
            <div class="calc-method-item ${isSelected ? 'selected' : ''}" data-id="${method.id}" data-focus-item tabindex="0">
                <div class="calc-method-radio">
                    ${isSelected ? '<i class="bx bx-check"></i>' : ''}
                </div>
                <div class="calc-method-info">
                    <div class="calc-method-name">
                        ${method.shortName || method.name}
                    </div>
                    <div class="calc-method-desc">
                        ${method.name}
                    </div>
                    <div class="calc-method-badges">
                        ${method.region ? `<span class="calc-method-badge">${method.region}</span>` : ''}
                        <span class="calc-method-badge">${t('components/modal/calculation-method-modal:ihtiyat_value', { minutes: method.ihtiyatMinutes })} Ihtiyat</span>
                        ${method.id === 24 ? `<span class="calc-method-badge calc-method-badge--muhammadiyah">${t('components/modal/calculation-method-modal:muhammadiyah_note')}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="modal-sheet-base calc-method-sheet" role="dialog" aria-modal="true" aria-labelledby="calc-modal-title">
            <div class="calc-method-header">
                <h3 class="calc-method-title" id="calc-modal-title">${t('components/modal/calculation-method-modal:title')}</h3>
                <p class="calc-method-subtitle">${t('components/modal/calculation-method-modal:subtitle')}</p>
            </div>
            <div class="calc-options-container" data-focus-group="calc-options" data-focus-direction="vertical">
                ${autoOptionHTML}
                <div style="height: 1px; background: var(--border-color); margin: 8px 0;"></div>
                ${methodListHTML}
            </div>
            <div class="calc-method-footer">
                <button class="btn btn--outline" id="calc-btn-cancel" style="width: 100%; justify-content: center;">${t('close')}</button>
            </div>
        </div>
    `;

    const cancelBtn = overlay.querySelector('#calc-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    return overlay;
}
