/**
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { impact } from '../../modules/system/haptic.js';
import { addEscHandler, trapFocus } from '../../utils/a11y.js';
import { t, loadNS } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';
import { escapeHtml } from '../../utils/sanitize.js';

const NS = 'pages/quran-pages/bookmark-page';

let _overlayEl = null;
let _releaseFocus = null;
let _boundDismiss = null;


/**
 * Show the category modal.
 * @param {Array}    folders       - All available folders
 * @param {Map}      countByFolder - folderId → count map
 * @param {Array}    activeFolderIds - array of folderIds this bookmark belongs to
 * @param {Function} onToggle      - Called with (folderId, isNowActive) when user taps a folder
 * @param {Function} onClose       - Called when modal is dismissed
 */
export async function showBookmarkCategoryModal(folders, countByFolder, activeFolderIds, onToggle, onClose) {
    if (_overlayEl) {
        unregisterModalDismiss(_handleDismiss);
        _removeModal();
    }

    await loadNS(NS);

    _overlayEl = _buildDOM(folders, countByFolder, activeFolderIds, onToggle, onClose);
    getModalRoot().appendChild(_overlayEl);

    _boundDismiss = () => _handleDismiss(onClose);
    registerModalDismiss(_boundDismiss);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => _overlayEl?.classList.add('active'));
    });

    _releaseFocus = trapFocus(_overlayEl);

    _overlayEl.addEventListener('click', e => {
        if (e.target === _overlayEl) _handleDismiss(onClose);
    });

    addEscHandler(_overlayEl, () => _handleDismiss(onClose));
}


function _handleDismiss(onClose) {
    if (onClose) onClose();
    _hideModal();
}

function _hideModal() {
    if (!_overlayEl) return;
    if (_boundDismiss) {
        unregisterModalDismiss(_boundDismiss);
        _boundDismiss = null;
    }
    
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.bookmark-mgr-sheet');
    const target = sheet || _overlayEl;

    let closed = false;
    const finalize = () => {
        if (closed) return;
        closed = true;
        _removeModal();
    };

    target.addEventListener('transitionend', finalize, { once: true });
    setTimeout(finalize, 450);
}

function _removeModal() {
    _releaseFocus?.();
    _releaseFocus = null;
    _overlayEl?.remove();
    _overlayEl = null;
}

function _buildDOM(folders, countByFolder, activeFolderIds, onToggle, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'bookmark-mgr-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'bookmark-mgr-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'bkmove-title');

    // Header
    const header = document.createElement('div');
    header.className = 'bookmark-mgr-header';
    const title = document.createElement('h3');
    title.className = 'bookmark-mgr-title';
    title.id = 'bkmove-title';
    title.textContent = t(`${NS}:move_to_folder_title`);
    header.appendChild(title);
    sheet.appendChild(header);

    // Folder list
    const list = document.createElement('div');
    list.className = 'bookmark-move-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t(`${NS}:move_to_folder_title`));
    list.setAttribute('aria-multiselectable', 'true');

    const sortedFolders = [...folders].sort((a, b) => a.order - b.order);
    const activeSet = new Set(activeFolderIds || []);

    sortedFolders.forEach(folder => {
        if (folder.id === 'all') return; // Cannot explicitly toggle 'all'

        let isActive = activeSet.has(folder.id);
        const count = countByFolder.get(folder.id) || 0;

        const item = document.createElement('button');
        item.className = `bookmark-move-item${isActive ? ' bookmark-move-item--active' : ''}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(isActive));

        const folderName = folder.isDefault
            ? t(`${NS}:${folder.name}`)
            : escapeHtml(folder.name);

        const iconMap = {
            'all': 'bx-bookmarks',
            'last_read': 'bx-history',
            'memorization': 'bx-brain'
        };
        const iconClass = folder.isDefault ? (iconMap[folder.id] || 'bx-folder') : 'bx-folder';

        item.innerHTML = `
            <i class="bx ${iconClass} bookmark-move-item__icon"></i>
            <div class="bookmark-move-item__info">
                <div class="bookmark-move-item__name">${folderName}</div>
                <div class="bookmark-move-item__count"><span class="count-val">${count}</span> bookmark</div>
            </div>
            <i class="bx bx-check bookmark-move-item__check"></i>
        `;

        item.addEventListener('click', () => {
            impact('light');
            isActive = !isActive;

            item.classList.toggle('bookmark-move-item--active', isActive);
            item.setAttribute('aria-selected', String(isActive));

            const countEl = item.querySelector('.count-val');
            if (countEl) {
                const currentCount = parseInt(countEl.textContent, 10);
                countEl.textContent = isActive ? (currentCount + 1) : Math.max(0, currentCount - 1);
            }

            if (onToggle) onToggle(folder.id, isActive);
        });

        list.appendChild(item);
    });

    sheet.appendChild(list);

    // Done button
    const actions = document.createElement('div');
    actions.className = 'bookmark-mgr-actions';
    const doneBtn = document.createElement('button');
    doneBtn.className = 'bookmark-mgr-btn bookmark-mgr-btn--primary';
    doneBtn.textContent = 'Selesai';
    doneBtn.addEventListener('click', () => _handleDismiss(onClose));
    actions.appendChild(doneBtn);
    sheet.appendChild(actions);

    overlay.appendChild(sheet);
    return overlay;
}
