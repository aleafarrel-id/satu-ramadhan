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
    });
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
                    <input type="date" class="preset-mgr-form-input" id="edit-start-${id}" value="${preset.startDate}">
                </div>
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">Tanggal Akhir</label>
                    <input type="date" class="preset-mgr-form-input" id="edit-end-${id}" value="${preset.endDate}">
                </div>
            </div>
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

    formContainer.querySelector(`#edit-save-${id}`)?.addEventListener('click', async () => {
        const startDate = formContainer.querySelector(`#edit-start-${id}`)?.value;
        const endDate = formContainer.querySelector(`#edit-end-${id}`)?.value;

        // Validation: endDate >= startDate
        if (!startDate || !endDate) {
            notif.warning('Tanggal mulai dan akhir wajib diisi');
            return;
        }
        if (endDate < startDate) {
            notif.warning('Tanggal akhir harus sama atau setelah tanggal mulai');
            return;
        }

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
                    <input type="date" class="preset-mgr-form-input" id="add-start">
                </div>
                <div class="preset-mgr-form-group">
                    <label class="preset-mgr-form-label">Tanggal Akhir</label>
                    <input type="date" class="preset-mgr-form-input" id="add-end">
                </div>
            </div>
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

    addFormContainer.querySelector('#add-save')?.addEventListener('click', async () => {
        const name = addFormContainer.querySelector('#add-name')?.value.trim();
        const startDate = addFormContainer.querySelector('#add-start')?.value;
        const endDate = addFormContainer.querySelector('#add-end')?.value;
        const description = addFormContainer.querySelector('#add-desc')?.value.trim();

        if (!name) {
            notif.warning('Nama organisasi wajib diisi');
            return;
        }
        if (!startDate || !endDate) {
            notif.warning('Tanggal mulai dan akhir wajib diisi');
            return;
        }
        if (endDate < startDate) {
            notif.warning('Tanggal akhir harus sama atau setelah tanggal mulai');
            return;
        }

        impact('light');
        await addCustomPreset({ name, startDate, endDate, description });
        _editingId = null;
        addFormContainer.innerHTML = '';
        notif.success('Preset kustom berhasil ditambahkan');
        emitChange();
        await refreshList();
    });
}

/* ── Date Formatting ── */

/**
 * Short date format for list items.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} e.g. "19 Feb"
 */
function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
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
            <div class="preset-mgr-list"></div>
            <div class="preset-mgr-add-form"></div>
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
