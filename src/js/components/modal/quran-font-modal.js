/**
 * Quran Font Style Modal Component
 *
 * Bottom sheet for adjusting Quran display settings:
 *   1. Font Family (LPMQ / Indopak) — via registry in quran-fonts.js
 *   2. Font Size (Arabic, Latin, Translation) — sliders
 *
 * The preview box is sticky so users always see live changes
 * as they scroll through the options below it.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';
import {
    getQuranFontSize, setQuranFontSize, applyQuranFontScale,
    getQuranFontFamily, setQuranFontFamily, applyQuranFontFamily
} from '../../modules/quran/quran-settings.js';
import { QURAN_FONTS } from '../../config/quran-fonts.js';
import { escapeHtml } from '../../utils/sanitize.js';

let _overlayEl = null;
let _releaseFocus = null;

// Temporary states before saving
let _fonts = {
    arabic: 1,
    latin: 1,
    translation: 1
};

let _selectedFontId = 'lpmq';
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
    _selectedFontId = getQuranFontFamily();

    _overlayEl = _createModalDOM();
    getModalRoot().appendChild(_overlayEl);

    _updateAllSliderBackgrounds();
    _updateFontFamilyCards();

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
    setQuranFontFamily(_selectedFontId);

    applyQuranFontScale();
    applyQuranFontFamily();
}

function _getLabelForStep(step) {
    if (step === 3) return t('components/modal/quran-font-modal:step_large');
    if (step === 2) return t('components/modal/quran-font-modal:step_medium');
    return t('components/modal/quran-font-modal:step_normal');
}

/**
 * Updates visual active state of font family cards.
 */
function _updateFontFamilyCards() {
    if (!_overlayEl) return;
    const cards = _overlayEl.querySelectorAll('.qfm-font-card');
    cards.forEach(card => {
        const isActive = card.dataset.fontId === _selectedFontId;
        card.classList.toggle('is-active', isActive);
        card.setAttribute('aria-pressed', String(isActive));
    });
}

/**
 * Live-previews the selected font family in the preview box without saving.
 * @param {string} fontId
 */
function _previewFontFamily(fontId) {
    _selectedFontId = fontId;
    _updateFontFamilyCards();

    // Apply temporarily to DOM for live preview
    if (fontId === 'lpmq') {
        document.documentElement.removeAttribute('data-quran-font');
    } else {
        document.documentElement.setAttribute('data-quran-font', fontId);
    }

    impact('light');
}

function _bindEvents() {
    if (!_overlayEl) return;

    // Close on backdrop click
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) _handleClose(e);
    });

    // Font family card selection
    _overlayEl.addEventListener('click', (e) => {
        const card = e.target.closest('.qfm-font-card');
        if (card && card.dataset.fontId) {
            _previewFontFamily(card.dataset.fontId);
        }
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

    // Done button
    const doneBtn = _overlayEl.querySelector('.quran-font-sheet-done');
    if (doneBtn) {
        doneBtn.addEventListener('click', _handleClose);
    }
}

function _hideModal() {
    if (!_overlayEl) return;

    // Restore persisted font state in case user only previewed without applying
    applyQuranFontFamily();

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
    _onSelectCallback = null;
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
    overlay.className = 'modal-overlay-base modal-overlay-base--bottom quran-font-modal-overlay modal-overlay-blur';
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

    // Build font family cards from registry
    const fontCardsHtml = QURAN_FONTS.map(font => `
        <button
            class="qfm-font-card"
            data-font-id="${escapeHtml(font.id)}"
            aria-pressed="${font.id === _selectedFontId}"
            type="button"
        >
            <div class="qfm-font-card__sample">${escapeHtml(font.sampleText)}</div>
            <div class="qfm-font-card__info">
                <span class="qfm-font-card__label">${escapeHtml(font.label)}</span>
                <span class="qfm-font-card__desc">${escapeHtml(t(`components/modal/quran-font-modal:${font.descKey}`))}</span>
            </div>
            <div class="qfm-font-card__check"><i class='bx bx-check'></i></div>
        </button>
    `).join('');

    overlay.innerHTML = `
        <div class="modal-sheet-base quran-font-sheet" role="dialog" aria-modal="true" aria-labelledby="quran-font-modal-title">
            <div class="quran-font-sheet-header">
                <h3 id="quran-font-modal-title" class="quran-font-sheet-title">
                    ${t('components/modal/quran-font-modal:title')}
                </h3>
            </div>
            
            <div class="quran-font-static-preview">
                <div class="quran-font-preview-box">
                    <div class="quran-font-preview-arabic quran-ayah-arabic">
                        بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ
                    </div>
                    <div class="quran-font-preview-latin quran-ayah-latin">
                        Bismillāhir-raḥmānir-raḥīm(i).
                    </div>
                    <div class="quran-font-preview-translation quran-ayah-translation">
                        ${t('components/modal/quran-font-modal:preview_translation', { defaultValue: 'Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.' })}
                    </div>
                </div>
            </div>
            
            <div class="quran-font-sheet-content">

                <!-- Section: Font Family -->
                <div class="qfm-section">
                    <p class="qfm-section-label">${t('components/modal/quran-font-modal:label_font_family', { defaultValue: 'Jenis Font' })}</p>
                    <div class="qfm-font-cards">
                        ${fontCardsHtml}
                    </div>
                </div>

                <!-- Section: Font Size -->
                <div class="qfm-section">
                    <p class="qfm-section-label">${t('components/modal/quran-font-modal:label_font_size', { defaultValue: 'Ukuran Font' })}</p>
                    <div class="quran-font-sliders-wrapper">
                        ${createSliderRow('arabic', 'bx-pen', 'label_arabic')}
                        ${createSliderRow('latin', 'bx-italic', 'label_latin')}
                        ${createSliderRow('translation', 'bx-text', 'label_translation')}
                    </div>
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

    return overlay;
}
