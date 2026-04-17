/**
 * Tasbih Preset Editor Modal
 * Displays form to create or edit a custom Tasbih Dzikir preset.
 */

// Stylesheet
import '../../../css/components/modal/tasbih-preset-modal.css';

// Core & Libraries
import { store } from '../../core/store.js';
import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import * as notif from '../../modules/notification/notification.js';
import { impact } from '../../modules/system/haptic.js';

// Utilities & Helpers
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';

let _overlayEl = null;
let _releaseFocus = null;

// Unique ID generator
const generateId = () => 'custom_' + Date.now().toString(36) + Math.random().toString(36).substring(2);

/**
 * Show the tasbih custom preset editor modal.
 * @param {object} config
 * @param {string} [config.presetId] - ID of custom preset to edit, if null then Create Mode.
 * @param {Function} config.onComplete - Callback when save/delete is done
 */
export async function showTasbihPresetModal({ onComplete } = {}) {
    await loadNS('pages/tasbih-page');
    await loadNS('common');

    if (_overlayEl) {
        unregisterModalDismiss(hideModal);
        removeModal();
    }

    const customPresets = store.getState('tasbih.customPresets') || [];

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    registerModalDismiss(hideModal);

    // Trigger entrance animation next frame
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    addEscHandler(_overlayEl, hideModal);

    // Bind Events
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) hideModal();
    });

    // Handle virtual keyboard scroll behavior
    _overlayEl.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    });

    const nameInput = _overlayEl.querySelector('#tb-preset-name');
    const targetInput = _overlayEl.querySelector('#tb-preset-target');
    const saveBtn = _overlayEl.querySelector('#tb-preset-save');
    const cancelBtn = _overlayEl.querySelector('#tb-preset-cancel');

    // Suggestion pills
    _overlayEl.querySelectorAll('.tb-preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            targetInput.value = chip.dataset.val;
            impact('light');
        });
    });

    cancelBtn.addEventListener('click', () => {
        hideModal();
    });

    saveBtn.addEventListener('click', () => {
        const nameText = nameInput.value.trim();
        const targetVal = parseInt(targetInput.value.trim() || '0', 10);

        if (!nameText) {
            notif.warning(t('pages/tasbih-page:err_name_empty'));
            return;
        }

        impact('light');
        const finalTarget = isNaN(targetVal) || targetVal < 0 ? 0 : targetVal;

        // Create Mode
        const newPreset = {
            id: generateId(),
            name: nameText,
            target: finalTarget
        };
        store.setState('tasbih.customPresets', [...customPresets, newPreset]);
        // Automatically switch to it
        store.setState('tasbih.activeZikir', newPreset.id);
        notif.success(t('pages/tasbih-page:preset_created', { defaultValue: 'Preset berhasil dibuat' }));

        hideModal();
        if (onComplete) onComplete();
    });
}

function hideModal() {
    if (!_overlayEl) return;
    unregisterModalDismiss(hideModal);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.tb-preset-sheet');
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
}

function createModalDOM() {
    const title = t('pages/tasbih-page:modal_create_title');
    const defaultName = '';
    const defaultTarget = '';

    const overlay = document.createElement('div');
    overlay.className = 'tb-preset-overlay';

    overlay.innerHTML = `
        <div class="tb-preset-sheet">
            <div class="tb-preset-header">
                <h3 class="tb-preset-title">${title}</h3>
            </div>
            
            <div class="tb-preset-form-group">
                <label class="tb-preset-label">${t('pages/tasbih-page:form_name_label')}</label>
                <input type="text" class="tb-preset-input" id="tb-preset-name" value="${defaultName}" placeholder="${t('pages/tasbih-page:form_name_ph')}">
            </div>
            
            <div class="tb-preset-form-group">
                <label class="tb-preset-label">${t('pages/tasbih-page:form_target_label')}</label>
                <input type="number" class="tb-preset-input" id="tb-preset-target" value="${defaultTarget}" placeholder="${t('pages/tasbih-page:form_target_ph')}" inputmode="numeric">
                
                <div class="tb-preset-suggestions-title"><i class='bx bx-bulb'></i> ${t('pages/tasbih-page:suggestion_title')}</div>
                <div class="tb-preset-chips">
                    <button class="tb-preset-chip" data-val="0">${t('pages/tasbih-page:target_free')}</button>
                    <button class="tb-preset-chip" data-val="10">10x</button>
                    <button class="tb-preset-chip" data-val="25">25x</button>
                    <button class="tb-preset-chip" data-val="33">33x</button>
                    <button class="tb-preset-chip" data-val="100">100x</button>
                </div>
            </div>

            <div class="tb-preset-actions">
                <button class="tb-preset-btn tb-preset-btn--outline" id="tb-preset-cancel">${t('common:cancel')}</button>
                <button class="tb-preset-btn tb-preset-btn--primary" id="tb-preset-save">${t('common:save')}</button>
            </div>
        </div>
    `;

    return overlay;
}
