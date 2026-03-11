/**
 * Preset Manager Modal (Bottom-sheet)
 * Displays all Ramadhan presets with CRUD operations.
 * Follows the same animation/structure pattern as location-search-modal.js.
 *
 * Separation of Concerns: All storage operations go through ramadhan.js module.
 * This modal NEVER calls storage.js or Preferences directly.
 */

import {
    getAllPresets,
    getSelectedOrg,
    setSelectedOrg,
    updatePreset,
    addCustomPreset,
    deleteCustomPreset,
    resetBasePreset,
} from '../../modules/schedule/ramadhan.js';

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import * as notif from '../../modules/notification/notification.js';
import { impact } from '../../modules/system/haptic.js';
import { showConfirmModal } from './confirm-modal.js';
import { showDatePickerModal } from './date-picker-modal.js';
import { formatDateShort, formatDateVerbose, calcRamadhanEndDates } from '../../utils/datetime.js';

/* ── State ── */
let _overlayEl = null;
let _onPresetsChanged = null;
let _editingId = null;

/* ── Public API ── */

/**
 * Show the preset manager modal.
 * @param {object} [options]
 * @param {Function} [options.onPresetsChanged] - Called when any CRUD operation completes
 */
export function showPresetManagerModal({ onPresetsChanged } = {}) {
    if (_overlayEl) {
        unregisterModalDismiss(hideModal);
        removeModal();
    }

    _onPresetsChanged = onPresetsChanged || null;
    _editingId = null;

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    registerModalDismiss(hideModal);

    // Trigger entrance animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Dismiss on overlay click
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

/* ── Internal Helpers ── */

function removeModal() {
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

/* ── List Rendering ── */

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
    const isActive = preset.id === selectedId;
    const badge = preset.isCustom
        ? '<span class="preset-mgr-badge preset-mgr-badge--custom">Kustom</span>'
        : '<span class="preset-mgr-badge preset-mgr-badge--base">Bawaan</span>';

    const overrideBadge = preset.isOverridden
        ? '<span class="preset-mgr-badge preset-mgr-badge--override">Diubah</span>'
        : '';

    const activeBadge = isActive
        ? '<span class="preset-mgr-badge preset-mgr-badge--active">Aktif</span>'
        : '';

    const deleteBtn = preset.isCustom
        ? `<button class="preset-mgr-item-action preset-mgr-item-action--delete" data-id="${preset.id}" title="Hapus"><i class='bx bx-trash'></i></button>`
        : '';

    const resetBtn = (!preset.isCustom && preset.isOverridden)
        ? `<button class="preset-mgr-item-action preset-mgr-item-action--reset" data-id="${preset.id}" title="Reset ke default"><i class='bx bx-reset'></i></button>`
        : '';

    return `
        <div class="preset-mgr-item${isActive ? ' preset-mgr-item--active' : ''}" data-id="${preset.id}">
            <div class="preset-mgr-item-select" data-id="${preset.id}">
                <div class="preset-mgr-item-radio ${isActive ? 'preset-mgr-item-radio--checked' : ''}">
                    ${isActive ? '<i class="bx bx-check"></i>' : ''}
                </div>
                <div class="preset-mgr-item-info">
                    <div class="preset-mgr-item-name">
                        ${preset.name}
                        ${activeBadge}
                    </div>
                    <div class="preset-mgr-item-dates">
                        ${formatDateShort(preset.startDate)} — ${formatDateShort(preset.endDate)}
                    </div>
                    <div class="preset-mgr-item-badges">
                        ${badge}${overrideBadge}
                    </div>
                </div>
            </div>
            <div class="preset-mgr-item-actions">
                <button class="preset-mgr-item-action preset-mgr-item-action--edit" data-id="${preset.id}" title="Edit"><i class='bx bx-pencil'></i></button>
                ${resetBtn}
                ${deleteBtn}
            </div>
            <div class="preset-mgr-edit-form" id="edit-form-${preset.id}"></div>
        </div>
    `;
}

/* ── Event Binding ── */

/**
 * Bind click events for all interactive elements in the list.
 */
function bindListEvents(listEl, presets, selectedId) {
    // Select preset (click on the select area)
    listEl.querySelectorAll('.preset-mgr-item-select').forEach(el => {
        el.addEventListener('click', async () => {
            const id = el.dataset.id;
            if (id !== selectedId) {
                impact('light');
                await setSelectedOrg(id);
                notif.success(`Organisasi aktif: ${presets.find(p => p.id === id)?.name}`);
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
            const presetName = presets.find(p => p.id === id)?.name || 'preset ini';

            showConfirmModal({
                title: 'Kembalikan Pengaturan',
                message: `Apakah Anda yakin ingin mengembalikan tanggal <strong>${presetName}</strong> ke bawaan awal?`,
                confirmText: 'Kembalikan',
                cancelText: 'Batal',
                isDanger: false,
                onConfirm: async () => {
                    impact('medium');
                    await resetBasePreset(id);
                    notif.success('Preset direset ke default');
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
            const presetName = presets.find(p => p.id === id)?.name || 'preset ini';

            showConfirmModal({
                title: 'Hapus Preset',
                message: `Apakah Anda yakin ingin menghapus <strong>${presetName}</strong>? Aksi ini tidak dapat dibatalkan.`,
                confirmText: 'Hapus',
                cancelText: 'Batal',
                isDanger: true,
                onConfirm: async () => {
                    impact('medium');
                    await deleteCustomPreset(id);
                    notif.success('Preset kustom dihapus');
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

/* ── Shared Form Helpers ── */

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

    fieldEl.addEventListener('click', () => {
        const constraints = getConstraints ? getConstraints() : {};

        showDatePickerModal({
            initialDate: fieldEl.dataset.date || new Date(),
            minDate: constraints.minDate,
            maxDate: constraints.maxDate,
            onSelect: (dateStr) => {
                fieldEl.dataset.date = dateStr;
                fieldEl.querySelector('span').textContent = formatDateVerbose(dateStr);
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
        <div class="preset-mgr-suggestion-title"><i class='bx bx-bulb'></i> Rekomendasi Tanggal Akhir</div>
        <div class="preset-mgr-suggestion-chips">
            <button class="preset-mgr-date-chip" data-date="${day29}">
                <span class="chip-duration">29 Hari</span>
                <span class="chip-date">${formatDateShort(day29)}</span>
            </button>
            <button class="preset-mgr-date-chip" data-date="${day30}">
                <span class="chip-duration">30 Hari</span>
                <span class="chip-date">${formatDateShort(day30)}</span>
            </button>
        </div>
    `;

    container.querySelectorAll('.preset-mgr-date-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            const d = chip.dataset.date;
            targetField.dataset.date = d;
            targetField.querySelector('span').textContent = formatDateVerbose(d);
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
        notif.warning('Tanggal mulai dan akhir wajib diisi');
        return false;
    }
    if (endDate < startDate) {
        notif.warning('Tanggal akhir harus setelah tanggal mulai');
        return false;
    }

    // Durasi Ramadhan harus 29 atau 30 hari
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays !== 29 && diffDays !== 30) {
        notif.warning(`Durasi Ramadhan harus 29 atau 30 hari`);
        return false;
    }

    return true;
}

/* ── Edit Form ── */

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

    formContainer.innerHTML = `
        <div class="preset-mgr-form">
            ${showName ? `
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">Nama</label>
                <input type="text" class="preset-mgr-form-input" id="edit-name-${id}" value="${preset.name}" placeholder="Nama organisasi">
            </div>
            ` : ''}
            <div class="preset-mgr-form-row">
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">Tanggal Mulai</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="edit-start-${id}" data-date="${preset.startDate}">
                        <span>${formatDateVerbose(preset.startDate)}</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">Tanggal Akhir</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="edit-end-${id}" data-date="${preset.endDate}">
                        <span>${formatDateVerbose(preset.endDate)}</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
            </div>
            <div id="edit-suggestions-${id}" class="preset-mgr-date-suggestions"></div>
            ${showName ? `
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">Keterangan (opsional)</label>
                <input type="text" class="preset-mgr-form-input" id="edit-desc-${id}" value="${preset.description || ''}" placeholder="Keterangan singkat">
            </div>
            ` : ''}
            <div class="preset-mgr-form-actions">
                <button class="btn preset-mgr-form-btn btn--outline" id="edit-cancel-${id}">Batal</button>
                <button class="btn preset-mgr-form-btn btn--gold" id="edit-save-${id}">Simpan</button>
            </div>
        </div>
    `;

    // Bind save/cancel
    formContainer.querySelector(`#edit-cancel-${id}`)?.addEventListener('click', () => {
        _editingId = null;
        formContainer.innerHTML = '';
    });

    const editStartField = formContainer.querySelector(`#edit-start-${id}`);
    const editEndField = formContainer.querySelector(`#edit-end-${id}`);
    const suggestionsContainer = formContainer.querySelector(`#edit-suggestions-${id}`);

    // Initial render
    renderSuggestions(editStartField?.dataset.date, suggestionsContainer, editEndField);

    bindDateField(editStartField, {
        onSelectCallback: (dateStr) => renderSuggestions(dateStr, suggestionsContainer, editEndField)
    });

    bindDateField(editEndField, {
        getConstraints: () => {
            const startStr = editStartField?.dataset.date;
            if (!startStr) return {};
            const { day29, day30 } = calcRamadhanEndDates(startStr);
            return { minDate: day29, maxDate: day30 };
        }
    });

    formContainer.querySelector(`#edit-save-${id}`)?.addEventListener('click', async () => {
        const startDate = editStartField?.dataset.date;
        const endDate = editEndField?.dataset.date;

        if (!validateDates(startDate, endDate)) return;

        const newData = { startDate, endDate };

        // For custom presets, also save name and description
        if (preset.isCustom) {
            const nameInput = formContainer.querySelector(`#edit-name-${id}`);
            const descInput = formContainer.querySelector(`#edit-desc-${id}`);
            if (nameInput) newData.name = nameInput.value.trim() || preset.name;
            if (descInput) newData.description = descInput.value.trim();
        }

        impact('light');
        await updatePreset(id, newData);
        _editingId = null;
        notif.success('Preset berhasil diperbarui');
        emitChange();
        await refreshList();
    });
}

/* ── Add Form ── */

/**
 * Show the "add new custom preset" form at the bottom of the list.
 */
function showAddForm() {
    const addFormContainer = _overlayEl?.querySelector('.preset-mgr-add-form');
    if (!addFormContainer) return;

    addFormContainer.innerHTML = `
        <div class="preset-mgr-form">
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">Nama Organisasi</label>
                <input type="text" class="preset-mgr-form-input" id="add-name" placeholder="e.g. Organisasi Saya">
            </div>
            <div class="preset-mgr-form-row">
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">Tanggal Mulai</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="add-start" data-date="">
                        <span>Pilih Tanggal</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">Tanggal Akhir</label>
                    <div class="preset-mgr-form-input preset-mgr-date-input" id="add-end" data-date="">
                        <span>Pilih Tanggal</span>
                        <i class='bx bx-calendar'></i>
                    </div>
                </div>
            </div>
            <div id="add-suggestions" class="preset-mgr-date-suggestions"></div>
            <div class="preset-mgr-form-group">
                <label class="preset-mgr-form-label">Keterangan (opsional)</label>
                <input type="text" class="preset-mgr-form-input" id="add-desc" placeholder="Keterangan singkat">
            </div>
            <div class="preset-mgr-form-actions">
                <button class="btn preset-mgr-form-btn btn--outline" id="add-cancel">Batal</button>
                <button class="btn preset-mgr-form-btn btn--gold" id="add-save">Tambah</button>
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
            notif.warning('Nama organisasi wajib diisi');
            return;
        }
        if (!validateDates(startDate, endDate)) return;

        impact('light');
        await addCustomPreset({ name, startDate, endDate, description });
        _editingId = null;
        addFormContainer.innerHTML = '';
        notif.success('Preset kustom berhasil ditambahkan');
        emitChange();
        await refreshList();
    });
}

/* ── DOM Construction ── */

/**
 * Create the modal DOM structure.
 * @returns {HTMLElement}
 */
function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'preset-mgr-overlay';

    overlay.innerHTML = `
        <div class="preset-mgr-sheet">
            <div class="preset-mgr-header">
                <h3 class="preset-mgr-title">Preset Ramadhan</h3>
            </div>
            <div class="preset-mgr-content">
                <div class="preset-mgr-list"></div>
                <div class="preset-mgr-add-form"></div>
            </div>
            <div class="preset-mgr-footer">
                <button class="btn btn--outline preset-mgr-add-btn">
                    <i class='bx bx-plus'></i>
                    <span>Tambah Preset Baru</span>
                </button>
            </div>
        </div>
    `;

    return overlay;
}
