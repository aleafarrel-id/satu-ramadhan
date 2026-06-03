/**
 * Preset Manager Modal (Bottom-sheet)
 * Displays all Ramadhan presets with CRUD operations.
 */

// Core & Libraries
import {
    getAllPresets,
    getSelectedOrg,
    setSelectedOrg,
    updatePreset,
    addCustomPreset,
    deleteCustomPreset,
    resetBasePreset,
} from '../../modules/schedule/ramadhan.js';
import { isIndonesiaMode } from '../../core/calculation-resolver.js';

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import * as notif from '../../modules/notification/notification.js';
import { impact } from '../../modules/system/haptic.js';

// UI Components
import { showConfirmModal } from './confirm-modal.js';
import { showDatePickerModal } from './date-picker-modal.js';

// Utilities & Helpers
import { formatDateShort, formatDateVerbose, calcRamadhanEndDates } from '../../utils/datetime.js';
import { makeAccessibleBtn, addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';
import { escapeHtml } from '../../utils/sanitize.js';

let _overlayEl = null;
let _onPresetsChanged = null;
let _editingId = null;
let _releaseFocus = null;

/**
 * Show the preset manager modal.
 * @param {object} [options]
 * @param {Function} [options.onPresetsChanged] - Called when any CRUD operation completes
 */
export async function showPresetManagerModal({ onPresetsChanged } = {}) {
    await loadNS('components/modal/preset-manager-modal');
    if (_overlayEl) {
        unregisterModalDismiss(hideModal);
        removeModal();
    }

    _onPresetsChanged = onPresetsChanged || null;
    _editingId = null;

    _overlayEl = createModalDOM();
    getModalRoot().appendChild(_overlayEl);

    registerModalDismiss(hideModal);

    // Trigger entrance animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    // Dismiss on overlay click
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) hideModal();
    });

    addEscHandler(_overlayEl, hideModal);

    // Handle virtual keyboard scroll behavior
    _overlayEl.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    });

    // Populate list
    refreshList();
}

/**
 * Hide modal with exit animation.
 */
export function hideModal() {
    if (!_overlayEl) return;
    unregisterModalDismiss(hideModal);
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.preset-mgr-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    // Safety: force remove after animation
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
    _editingId = null;
    _onPresetsChanged = null;
}

/**
 * Notify parent components that presets have changed.
 */
function emitChange() {
    if (_onPresetsChanged) _onPresetsChanged();
}

/**
 * Refresh the preset list inside the modal.
 */
async function refreshList() {
    if (!_overlayEl) return;

    const listEl = _overlayEl.querySelector('.preset-mgr-list');
    if (!listEl) return;

    const presets = await getAllPresets();
    const selectedId = await getSelectedOrg();

    listEl.innerHTML = presets.map(p => renderPresetItem(p, selectedId)).join('');

    // Bind item events
    bindListEvents(listEl, presets, selectedId);

    // Show expanded edit form if one was being edited
    if (_editingId) {
        showEditForm(_editingId, presets);
    }
}

/**
 * Render a single preset list item.
 * @param {object} preset
 * @param {string} selectedId
 * @returns {string} HTML
 */
function renderPresetItem(preset, selectedId) {
    const monthsShort = t('components/ui/header:months_short', { returnObjects: true }) || [];

    const isActive = preset.id === selectedId;
    const badge = preset.isCustom
        ? `<span class="preset-mgr-badge preset-mgr-badge--custom">${t('components/modal/preset-manager-modal:badge_custom')}</span>`
        : `<span class="preset-mgr-badge preset-mgr-badge--base">${t('components/modal/preset-manager-modal:badge_base')}</span>`;

    const overrideBadge = preset.isOverridden
        ? `<span class="preset-mgr-badge preset-mgr-badge--override">${t('components/modal/preset-manager-modal:badge_override')}</span>`
        : '';

    const activeBadge = isActive
        ? `<span class="preset-mgr-badge preset-mgr-badge--active">${t('components/modal/preset-manager-modal:badge_active')}</span>`
        : '';

    const deleteBtn = preset.isCustom
        ? `<button class="preset-mgr-item-action preset-mgr-item-action--delete" data-id="${preset.id}" title="${t('components/modal/preset-manager-modal:delete_title')}"><i class='bx bx-trash'></i></button>`
        : '';

    const resetBtn = (!preset.isCustom && preset.isOverridden)
        ? `<button class="preset-mgr-item-action preset-mgr-item-action--reset" data-id="${preset.id}" title="${t('components/modal/preset-manager-modal:reset_title')}"><i class='bx bx-reset'></i></button>`
        : '';

    return `
        <div class="preset-mgr-item${isActive ? ' preset-mgr-item--active' : ''}" data-id="${preset.id}" data-focus-item>
            <div class="preset-mgr-item-select" data-id="${preset.id}">
                <div class="preset-mgr-item-radio ${isActive ? 'preset-mgr-item-radio--checked' : ''}">
                    ${isActive ? '<i class="bx bx-check"></i>' : ''}
                </div>
                <div class="preset-mgr-item-info">
                    <div class="preset-mgr-item-name">
                        ${escapeHtml(preset.name)}
                        ${activeBadge}
                    </div>
                    <div class="preset-mgr-item-dates">
                        ${formatDateShort(preset.startDate, monthsShort)} — ${formatDateShort(preset.endDate, monthsShort)}
                    </div>
                    <div class="preset-mgr-item-badges">
                        ${badge}${overrideBadge}
                    </div>
                </div>
            </div>
            <div class="preset-mgr-item-actions">
                <button class="preset-mgr-item-action preset-mgr-item-action--edit" data-id="${preset.id}" title="${t('components/modal/preset-manager-modal:edit_title')}"><i class='bx bx-pencil'></i></button>
                ${resetBtn}
                ${deleteBtn}
            </div>
            <div class="preset-mgr-edit-form" id="edit-form-${preset.id}"></div>
        </div>
    `;
}

/**
 * Bind click events for all interactive elements in the list.
 */
function bindListEvents(listEl, presets, selectedId) {
    // Select preset (click on the select area)
    listEl.querySelectorAll('.preset-mgr-item-select').forEach(el => {
        makeAccessibleBtn(el, async () => {
            const id = el.dataset.id;
            if (id !== selectedId) {
                impact('light');
                await setSelectedOrg(id);
                notif.success(t('components/modal/preset-manager-modal:active_org_changed', { name: presets.find(p => p.id === id)?.name }));
                emitChange();
                await refreshList();
            }
        });
    });

    // Edit buttons
    listEl.querySelectorAll('.preset-mgr-item-action--edit').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.id;
            _editingId = _editingId === id ? null : id;
            showEditForm(id, presets);

            if (_editingId === id) {
                setTimeout(() => {
                    const formContainer = _overlayEl?.querySelector(`#edit-form-${id}`);
                    if (formContainer) {
                        formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 150);
            }
        });
    });

    // Reset buttons
    listEl.querySelectorAll('.preset-mgr-item-action--reset').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.id;
            const presetName = escapeHtml(presets.find(p => p.id === id)?.name || t('components/modal/preset-manager-modal:this_preset'));

            showConfirmModal({
                title: t('components/modal/preset-manager-modal:reset_confirm_title'),
                message: t('components/modal/preset-manager-modal:reset_confirm_msg', { presetName }),
                confirmText: t('components/modal/preset-manager-modal:reset_confirm_btn'),
                cancelText: t('common:cancel'),
                isDanger: false,
                onConfirm: async () => {
                    impact('medium');
                    await resetBasePreset(id);
                    notif.success(t('components/modal/preset-manager-modal:reset_success_msg'));
                    emitChange();
                    await refreshList();
                }
            });
        });
    });

    // Delete buttons
    listEl.querySelectorAll('.preset-mgr-item-action--delete').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.id;
            const presetName = escapeHtml(presets.find(p => p.id === id)?.name || t('components/modal/preset-manager-modal:this_preset'));

            showConfirmModal({
                title: t('components/modal/preset-manager-modal:delete_confirm_title'),
                message: t('components/modal/preset-manager-modal:delete_confirm_msg', { presetName }),
                confirmText: t('components/modal/preset-manager-modal:delete_title'),
                cancelText: t('common:cancel'),
                isDanger: true,
                onConfirm: async () => {
                    impact('medium');
                    await deleteCustomPreset(id);
                    notif.success(t('components/modal/preset-manager-modal:delete_success_msg'));
                    emitChange();
                    await refreshList();
                }
            });
        });
    });

    // Add new button
    _overlayEl?.querySelector('.preset-mgr-add-btn')?.addEventListener('click', () => {
        _editingId = '__new__';
        showAddForm();
        setTimeout(() => {
            const contentContainer = _overlayEl?.querySelector('.preset-mgr-content');
            if (contentContainer) {
                contentContainer.scrollTo({
                    top: contentContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 150);
    });
}

/**
 * Bind a date-picker trigger to a field element.
 * When a date is selected it updates the field's data-date attribute and display text.
 * @param {HTMLElement} fieldEl  - Element with data-date attribute and a <span> child
 * @param {object}      [options]
 * @param {string}      [options.initial] - Optional initial date string YYYY-MM-DD
 * @param {Function}    [options.onSelectCallback] - Optional callback after selection
 * @param {Function}    [options.getConstraints] - Optional function returning {minDate, maxDate}
 */
function bindDateField(fieldEl, { initial, onSelectCallback, getConstraints } = {}) {
    if (!fieldEl) return;
    if (initial) fieldEl.dataset.date = initial;

    makeAccessibleBtn(fieldEl, () => {
        const constraints = getConstraints ? getConstraints() : {};

        showDatePickerModal({
            initialDate: fieldEl.dataset.date || new Date(),
            minDate: constraints.minDate,
            maxDate: constraints.maxDate,
            onSelect: (dateStr) => {
                const months = t('components/ui/header:months', { returnObjects: true }) || [];
                fieldEl.dataset.date = dateStr;
                fieldEl.querySelector('span').textContent = formatDateVerbose(dateStr, months);
                if (onSelectCallback) onSelectCallback(dateStr);
            },
        });
    });
}

/**
 * Shared helper to render End Date recommendations (29 & 30 days).
 * @param {string} startStr - Start date string (YYYY-MM-DD)
 * @param {HTMLElement} container - DOM element to render into
 * @param {HTMLElement} targetField - Field to update when suggestion is clicked
 */
function renderSuggestions(startStr, container, targetField) {
    if (!startStr || !container) {
        if (container) container.innerHTML = '';
        return;
    }
    const { day29, day30 } = calcRamadhanEndDates(startStr);

    container.innerHTML = `
        <div class="preset-mgr-suggestion-title"><i class='bx bx-bulb'></i> ${t('components/modal/preset-manager-modal:recommendation_title')}</div>
        <div class="preset-mgr-suggestion-chips" data-focus-group="preset-mgr-suggestions" data-focus-direction="horizontal">
            <button class="preset-mgr-date-chip" data-date="${day29}" data-focus-item>
                <span class="chip-duration">${t('components/modal/preset-manager-modal:days', { count: 29 })}</span>
                <span class="chip-date">${formatDateShort(day29, t('components/ui/header:months_short', { returnObjects: true }) || [])}</span>
            </button>
            <button class="preset-mgr-date-chip" data-date="${day30}" data-focus-item>
                <span class="chip-duration">${t('components/modal/preset-manager-modal:days', { count: 30 })}</span>
                <span class="chip-date">${formatDateShort(day30, t('components/ui/header:months_short', { returnObjects: true }) || [])}</span>
            </button>
        </div>
    `;

    container.querySelectorAll('.preset-mgr-date-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            const d = chip.dataset.date;
            const months = t('components/ui/header:months', { returnObjects: true }) || [];
            targetField.dataset.date = d;
            targetField.querySelector('span').textContent = formatDateVerbose(d, months);
            impact('light');
        });
    });
}

/**
 * Validate start/end date inputs and show a warning notification if invalid.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 * @returns {boolean} true if valid
 */
function validateDates(startDate, endDate) {
    if (!startDate || !endDate) {
        notif.warning(t('components/modal/preset-manager-modal:err_date_empty'));
        return false;
    }
    if (endDate < startDate) {
        notif.warning(t('components/modal/preset-manager-modal:err_date_order'));
        return false;
    }

    // Ramadhan duration must be exactly 29 or 30 days
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays !== 29 && diffDays !== 30) {
        notif.warning(t('components/modal/preset-manager-modal:err_duration'));
        return false;
    }

    return true;
}

/**
 * Show the inline edit form for a preset.
 * @param {string} id - preset ID
 * @param {Array} presets - full presets list
 */
function showEditForm(id, presets) {
    // Collapse all forms first
    _overlayEl?.querySelectorAll('.preset-mgr-edit-form').forEach(el => {
        if (el.id !== `edit-form-${id}`) el.innerHTML = '';
    });

    const formContainer = _overlayEl?.querySelector(`#edit-form-${id}`);
    if (!formContainer) return;

    if (_editingId !== id) {
        formContainer.innerHTML = '';
        return;
    }

    const preset = presets.find(p => p.id === id);
    if (!preset) return;

    const showName = preset.isCustom;

    // Snapshot of original values for dirty-checking
    const initialState = {
        startDate: preset.startDate,
        endDate: preset.endDate,
        name: preset.name,
        description: preset.description || '',
    };

    const months = t('components/ui/header:months', { returnObjects: true }) || [];

    formContainer.innerHTML = `
        <div class="preset-mgr-form">
            ${showName ? `
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_name')}</label>
                <input type="text" class="preset-mgr-form-input" id="edit-name-${id}" value="${escapeHtml(preset.name)}" placeholder="${t('components/modal/preset-manager-modal:form_name_ph')}">
            </div>
            ` : ''}
            <div class="preset-mgr-form-row">
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_start_date')}</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="edit-start-${id}" data-date="${preset.startDate}">
                        <span>${formatDateVerbose(preset.startDate, months)}</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_end_date')}</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="edit-end-${id}" data-date="${preset.endDate}">
                        <span>${formatDateVerbose(preset.endDate, months)}</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
            </div>
            <div id="edit-suggestions-${id}" class="preset-mgr-date-suggestions"></div>
            ${showName ? `
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_desc')}</label>
                <input type="text" class="preset-mgr-form-input" id="edit-desc-${id}" value="${escapeHtml(preset.description)}" placeholder="${t('components/modal/preset-manager-modal:form_desc_ph')}">
            </div>
            ` : ''}
            <div class="preset-mgr-form-actions" data-focus-group="preset-mgr-edit-actions" data-focus-direction="horizontal">
                <button class="btn preset-mgr-form-btn btn--outline" id="edit-cancel-${id}" data-focus-item>${t('common:cancel')}</button>
                <button class="btn preset-mgr-form-btn btn--gold" id="edit-save-${id}" data-focus-item disabled>${t('common:save')}</button>
            </div>
        </div>
    `;

    const saveBtn = formContainer.querySelector(`#edit-save-${id}`);
    const editStartField = formContainer.querySelector(`#edit-start-${id}`);
    const editEndField = formContainer.querySelector(`#edit-end-${id}`);
    const nameInput = formContainer.querySelector(`#edit-name-${id}`);
    const descInput = formContainer.querySelector(`#edit-desc-${id}`);
    const suggestionsContainer = formContainer.querySelector(`#edit-suggestions-${id}`);

    /**
     * Compare current form values against the initial snapshot.
     * Enables/disables the Save button accordingly.
     */
    function checkChanges() {
        const currentStart = editStartField?.dataset.date || '';
        const currentEnd = editEndField?.dataset.date || '';
        const currentName = nameInput ? nameInput.value.trim() : initialState.name;
        const currentDesc = descInput ? descInput.value.trim() : initialState.description;

        const hasChanges =
            currentStart !== initialState.startDate ||
            currentEnd !== initialState.endDate ||
            currentName !== initialState.name ||
            currentDesc !== initialState.description;

        saveBtn.disabled = !hasChanges;
    }

    // Bind save/cancel
    formContainer.querySelector(`#edit-cancel-${id}`)?.addEventListener('click', () => {
        _editingId = null;
        formContainer.innerHTML = '';
    });

    // Watch text inputs for changes
    if (nameInput) nameInput.addEventListener('input', checkChanges);
    if (descInput) descInput.addEventListener('input', checkChanges);

    // Initial suggestions render
    renderSuggestions(editStartField?.dataset.date, suggestionsContainer, editEndField);

    bindDateField(editStartField, {
        onSelectCallback: (dateStr) => {
            renderSuggestions(dateStr, suggestionsContainer, editEndField);
            checkChanges();
        }
    });

    bindDateField(editEndField, {
        getConstraints: () => {
            const startStr = editStartField?.dataset.date;
            if (!startStr) return {};
            const { day29, day30 } = calcRamadhanEndDates(startStr);
            return { minDate: day29, maxDate: day30 };
        },
        onSelectCallback: () => checkChanges(),
    });

    // Re-check after suggestion chips override the end date
    suggestionsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.preset-mgr-date-chip')) {
            // Small delay so the chip handler can update data-date first
            setTimeout(checkChanges, 0);
        }
    });

    saveBtn?.addEventListener('click', async () => {
        // Final guard: do nothing if save button was activated without actual changes
        const currentStart = editStartField?.dataset.date;
        const currentEnd = editEndField?.dataset.date;
        const currentName = nameInput ? nameInput.value.trim() : initialState.name;
        const currentDesc = descInput ? descInput.value.trim() : initialState.description;

        const hasChanges =
            currentStart !== initialState.startDate ||
            currentEnd !== initialState.endDate ||
            currentName !== initialState.name ||
            currentDesc !== initialState.description;

        if (!hasChanges) return;

        if (!validateDates(currentStart, currentEnd)) return;

        const newData = { startDate: currentStart, endDate: currentEnd };

        // For custom presets, also save name and description
        if (preset.isCustom) {
            if (nameInput) newData.name = currentName || preset.name;
            if (descInput) newData.description = currentDesc;
        }

        impact('light');
        await updatePreset(id, newData);
        _editingId = null;
        notif.success(t('components/modal/preset-manager-modal:success_update'));
        emitChange();
        await refreshList();
    });
}

/**
 * Show the "add new custom preset" form at the bottom of the list.
 */
function showAddForm() {
    const addFormContainer = _overlayEl?.querySelector('.preset-mgr-add-form');
    if (!addFormContainer) return;

    addFormContainer.innerHTML = `
        <div class="preset-mgr-form">
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_org_name')}</label>
                <input type="text" class="preset-mgr-form-input" id="add-name" placeholder="${t('components/modal/preset-manager-modal:form_org_name_ph')}">
            </div>
            <div class="preset-mgr-form-row">
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_start_date')}</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="add-start" data-date="">
                        <span>${t('components/modal/preset-manager-modal:choose_date')}</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_end_date')}</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="add-end" data-date="">
                        <span>${t('components/modal/preset-manager-modal:choose_date')}</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
            </div>
            <div id="add-suggestions" class="preset-mgr-date-suggestions"></div>
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">${t('components/modal/preset-manager-modal:form_desc')}</label>
                <input type="text" class="preset-mgr-form-input" id="add-desc" placeholder="${t('components/modal/preset-manager-modal:form_desc_ph')}">
            </div>
            <div class="preset-mgr-form-actions" data-focus-group="preset-mgr-add-actions" data-focus-direction="horizontal">
                <button class="btn preset-mgr-form-btn btn--outline" id="add-cancel" data-focus-item>${t('common:cancel')}</button>
                <button class="btn preset-mgr-form-btn btn--gold" id="add-save" data-focus-item>${t('common:add')}</button>
            </div>
        </div>
    `;

    // Bind events
    addFormContainer.querySelector('#add-cancel')?.addEventListener('click', () => {
        _editingId = null;
        addFormContainer.innerHTML = '';
    });

    const addStartField = addFormContainer.querySelector('#add-start');
    const addEndField = addFormContainer.querySelector('#add-end');
    const suggestionsContainer = addFormContainer.querySelector('#add-suggestions');

    // Initial render (likely empty)
    renderSuggestions(addStartField?.dataset.date, suggestionsContainer, addEndField);

    bindDateField(addStartField, {
        onSelectCallback: (dateStr) => renderSuggestions(dateStr, suggestionsContainer, addEndField)
    });

    bindDateField(addEndField, {
        getConstraints: () => {
            const startStr = addStartField?.dataset.date;
            if (!startStr) return {};
            const { day29, day30 } = calcRamadhanEndDates(startStr);
            return { minDate: day29, maxDate: day30 };
        }
    });

    addFormContainer.querySelector('#add-save')?.addEventListener('click', async () => {
        const name = addFormContainer.querySelector('#add-name')?.value.trim();
        const startDate = addStartField?.dataset.date;
        const endDate = addEndField?.dataset.date;
        const description = addFormContainer.querySelector('#add-desc')?.value.trim();

        if (!name) {
            notif.warning(t('components/modal/preset-manager-modal:err_name_empty'));
            return;
        }
        if (!validateDates(startDate, endDate)) return;

        impact('light');
        await addCustomPreset({ name, startDate, endDate, description });
        _editingId = null;
        addFormContainer.innerHTML = '';
        notif.success(t('components/modal/preset-manager-modal:success_add'));
        emitChange();
        await refreshList();
    });
}

/**
 * Create the modal DOM structure.
 * @returns {HTMLElement}
 */
function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-base modal-overlay-base--bottom preset-mgr-overlay';

    const isIndo = isIndonesiaMode();

    overlay.innerHTML = `
        <div class="modal-sheet-base preset-mgr-sheet">
            <div class="preset-mgr-header">
                <h3 class="preset-mgr-title">${t('components/modal/preset-manager-modal:modal_title')}</h3>
            </div>
            <div class="preset-mgr-content">
                <div class="preset-mgr-list" data-focus-group="preset-mgr-list" data-focus-direction="vertical"></div>
                <div class="preset-mgr-add-form"></div>
            </div>
            ${isIndo ? `
            <div class="preset-mgr-footer">
                <button class="btn btn--outline preset-mgr-add-btn">
                    <i class='bx bx-plus'></i>
                    <span>${t('components/modal/preset-manager-modal:add_preset_btn')}</span>
                </button>
            </div>
            ` : ''}
        </div>
    `;

    return overlay;
}
