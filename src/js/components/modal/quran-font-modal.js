/**
 * Quran Font Size Modal Component
 *
 * A modal for adjusting Quran font sizes (Arabic, Latin, Translation).
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';
import { getQuranFontSize, setQuranFontSize, applyQuranFontScale } from '../../modules/quran/quran-settings.js';

let _overlayEl = null;
let _releaseFocus = null;

// Temporary states before saving
let _fonts = {
    arabic: 1,
    latin: 1,
    translation: 1
};

let _onSelectCallback = null;

export async function showQuranFontModal({ onSelect } = {}) {
    if (_overlayEl) {
        unregisterModalDismiss(_handleClose);
        _removeModal();
    }

    _onSelectCallback = onSelect;

    await loadNS('components/modal/quran-font-modal');

    // Init temp states from store
    _fonts.arabic = getQuranFontSize('arabic');
    _fonts.latin = getQuranFontSize('latin');
    _fonts.translation = getQuranFontSize('translation');

    _overlayEl = _createModalDOM();
    getModalRoot().appendChild(_overlayEl);

    _updateAllSliderBackgrounds();

    registerModalDismiss(_handleClose);

    requestAnimationFrame(() => {
        setTimeout(() => {
            if (_overlayEl) {
                _overlayEl.classList.add('active');
            }
        }, 50);
    });

    _releaseFocus = trapFocus(_overlayEl);
    _bindEvents();
}

function _handleClose(e) {
    if (e) e.stopPropagation();

    _saveAndApply();

    if (_onSelectCallback) _onSelectCallback();

    _hideModal();
}

function _saveAndApply() {
    setQuranFontSize('arabic', _fonts.arabic);
    setQuranFontSize('latin', _fonts.latin);
    setQuranFontSize('translation', _fonts.translation);

    // Ensure CSS is updated
    applyQuranFontScale();
}

function _getLabelForStep(step) {
    if (step === 3) return t('components/modal/quran-font-modal:step_large');
    if (step === 2) return t('components/modal/quran-font-modal:step_medium');
    return t('components/modal/quran-font-modal:step_normal');
}

function _bindEvents() {
    if (!_overlayEl) return;

    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) _handleClose(e);
    });

    const bindSlider = (type) => {
        const slider = _overlayEl.querySelector(`#quran-font-slider-${type}`);
        const valueDisplay = _overlayEl.querySelector(`#quran-font-value-${type}`);

        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                _fonts[type] = parseInt(e.target.value, 10);
                valueDisplay.textContent = _getLabelForStep(_fonts[type]);
                _updateSliderBackground(slider);

                // Live preview
                _saveAndApply();
            });

            slider.addEventListener('change', () => {
                impact('light');
            });
        }
    };

    bindSlider('arabic');
    bindSlider('latin');
    bindSlider('translation');

    addEscHandler(_overlayEl, _handleClose);
}

function _hideModal() {
    if (!_overlayEl) return;

    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }

    _overlayEl.classList.remove('active');
    unregisterModalDismiss(_handleClose);

    setTimeout(() => {
        _removeModal();
    }, 400);
}

function _removeModal() {
    if (_overlayEl && _overlayEl.parentNode) {
        _overlayEl.parentNode.removeChild(_overlayEl);
    }
    _overlayEl = null;
}

function _updateAllSliderBackgrounds() {
    if (!_overlayEl) return;
    _updateSliderBackground(_overlayEl.querySelector('#quran-font-slider-arabic'));
    _updateSliderBackground(_overlayEl.querySelector('#quran-font-slider-latin'));
    _updateSliderBackground(_overlayEl.querySelector('#quran-font-slider-translation'));
}

function _updateSliderBackground(slider) {
    if (!slider) return;
    const percentage = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--clr-primary-500) 0%, var(--clr-primary-500) ${percentage}%, var(--clr-bg-card-solid) ${percentage}%, var(--clr-bg-card-solid) 100%)`;
}

function _createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'quran-font-modal-overlay modal-overlay-blur';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'quran-font-modal-title');

    const createSliderRow = (type, icon, titleKey) => {
        const title = t(`components/modal/quran-font-modal:${titleKey}`);
        const currentVal = _fonts[type];

        return `
            <div class="quran-font-slider-section">
                <div class="quran-font-value-display" aria-label="${title}">
                    <i class='bx ${icon}'></i>
                    <span class="quran-font-value-text" id="quran-font-value-${type}">${_getLabelForStep(currentVal)}</span>
                </div>
                <div class="quran-font-slider-container">
                    <span class="quran-font-icon-small">A</span>
                    <div class="quran-font-track-wrapper">
                        <input type="range" 
                            id="quran-font-slider-${type}" 
                            class="quran-font-slider styled-slider" 
                            min="1" 
                            max="3" 
                            step="1" 
                            value="${currentVal}" 
                            aria-label="${title}">
                        <div class="quran-font-ticks">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                    <span class="quran-font-icon-large">A</span>
                </div>
            </div>
        `;
    };

    overlay.innerHTML = `
        <div class="quran-font-sheet" role="dialog" aria-modal="true" aria-labelledby="quran-font-modal-title">
            <div class="quran-font-sheet-header">
                <h3 id="quran-font-modal-title" class="quran-font-sheet-title">
                    ${t('components/modal/quran-font-modal:title')}
                </h3>
            </div>
            
            <div class="quran-font-sheet-content">
                <div class="quran-font-preview-box">
                    <div class="quran-font-preview-arabic quran-ayah-arabic">
                        بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ
                    </div>
                    <div class="quran-font-preview-latin quran-ayah-latin">
                        Bismillāhir-raḥmānir-raḥīm(i).
                    </div>
                    <div class="quran-font-preview-translation quran-ayah-translation">
                        ${t('components/modal/quran-font-modal:preview_translation', { defaultValue: 'Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.' })}
                    </div>
                </div>

                <div class="quran-font-sliders-wrapper">
                    ${createSliderRow('arabic', 'bx-pen', 'label_arabic')}
                    ${createSliderRow('latin', 'bx-italic', 'label_latin')}
                    ${createSliderRow('translation', 'bx-text', 'label_translation')}
                </div>
                
                <p class="quran-font-desc">
                    ${t('components/modal/quran-font-modal:disclaimer', { defaultValue: 'Pengaturan ini hanya memengaruhi tampilan teks pada fitur bacaan Al-Quran.' })}
                </p>
            </div>

            <div class="quran-font-sheet-footer">
                <button class="btn btn--gold w-100 quran-font-sheet-done" aria-label="Done">
                    ${t('components/modal/quran-font-modal:done')}
                </button>
            </div>
        </div>
    `;

    const doneBtn = overlay.querySelector('.quran-font-sheet-done');
    if (doneBtn) {
        doneBtn.addEventListener('click', _handleClose);
    }

    return overlay;
}
