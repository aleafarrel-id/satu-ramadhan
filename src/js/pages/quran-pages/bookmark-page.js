/**
 * Bookmark Subpage Component
 *
 * Folder-based bookmark system. Architecture:
 *   - Folder carousel at the top (scrolls with content)
 *   - Bookmark list filtered by active folder
 *   - Long-press a folder chip to manage (rename/delete)
 *   - Search works cross-folder (not limited to active folder)
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import * as BookmarkManager from '../../modules/quran/bookmark-manager.js';
import * as QuranReader from '../../modules/quran/quran-reader.js';
import * as Notification from '../../modules/notification/notification.js';
import { getSurahList, getJuzList } from '../../modules/quran/quran-api.js';
import { renderBatchedList } from '../../modules/quran/quran-utility.js';
import { showConfirmModal } from '../../components/modal/confirm-modal.js';
import { showBookmarkNoteModal } from '../../components/modal/bookmark-note-modal.js';
import { showCreateFolderModal } from '../../components/modal/bookmark-folder-modal.js';
import { showBookmarkCategoryModal } from '../../components/modal/bookmark-move-modal.js';
import { t, loadNS } from '../../core/i18n.js';
import { impact } from '../../modules/system/haptic.js';
import { logError } from '../../utils/error-boundary.js';
import { escapeHtml } from '../../utils/sanitize.js';

const NS = 'pages/quran-pages/bookmark-page';

// Module State 

let _container = null;
let _callbacks = null;
let _activeFolderId = 'all';
let _folders = [];
let _countByFolder = new Map();
let _surahList = [];
let _folderBarEl = null;

// Long-press detection state
let _lpTimer = null;
const LP_DELAY = 500;  // ms

// Public Interface 

/**
 * Renders the bookmark list page with folder carousel.
 * @param {HTMLElement} container
 * @param {object}      callbacks
 */
export async function render(container, callbacks = {}) {
    _container = container;
    _callbacks = callbacks;

    await loadNS(NS);
    QuranCard.renderLoadingState(container);

    try {
        const [folders, countByFolder, surahList, allBookmarks] = await Promise.all([
            BookmarkManager.getAllFolders(),
            BookmarkManager.getCountByFolder(),
            getSurahList(),
            BookmarkManager.getAll()
        ]);

        if (!_container) return;

        _folders = folders;
        _countByFolder = countByFolder;
        _surahList = surahList;


        const folderExists = _folders.some(f => f.id === _activeFolderId);
        if (!folderExists) _activeFolderId = 'all';

        _container.innerHTML = '';

        const latestBookmark = allBookmarks.length > 0 ? allBookmarks[0] : null;
        const banner = QuranCard.createBookmarkBanner(latestBookmark, (bookmark) => {
            const surah = _surahList.find(s => parseInt(s.index) === bookmark.surahIndex);
            _openBookmarkedVerse(bookmark, surah);
        });
        _container.appendChild(banner);

        _renderFolderBar(_container);
        await _renderBookmarkList(_container);

    } catch (error) {
        logError('[BookmarkPage]', error);
        if (_container) {
            QuranCard.renderErrorState(_container, t(`${NS}:error_load`));
        }
    }
}

/**
 * Handles search queries — cross-folder, not limited to active folder.
 * @param {string}      query
 * @param {HTMLElement} resultsContainer
 * @param {object}      searchCallbacks
 */
export async function onSearch(query, resultsContainer, searchCallbacks = {}) {
    const [bookmarks, surahList] = await Promise.all([
        BookmarkManager.getAll(),
        getSurahList(),
    ]);

    const q = query.toLowerCase();

    const filtered = bookmarks.filter(b => {
        const titleMatch = b.surahTitle.toLowerCase().includes(q);
        const verseMatch = b.verseNumber.toString() === query;
        const indexMatch = b.surahIndex.toString() === query;
        const noteMatch = b.note && b.note.toLowerCase().includes(query);
        const typeMatch = b.type && b.type.toLowerCase().includes(query);
        return titleMatch || verseMatch || indexMatch || noteMatch || typeMatch;
    });

    if (!filtered.length) {
        if (searchCallbacks.renderPlaceholder) {
            searchCallbacks.renderPlaceholder(
                resultsContainer,
                t('components/quran/quran-search:not_found', { query: escapeHtml(query) }),
                'bx-info-circle'
            );
        }
        return;
    }

    await renderBatchedList({
        data: filtered,
        container: resultsContainer,
        listCreatorFn: () => QuranCard.createBookmarkList(),
        batchSize: 10,
        createItemFn: (bookmark) => {
            const surah = surahList.find(s => parseInt(s.index) === bookmark.surahIndex);
            return QuranCard.createBookmarkCard(
                bookmark,
                surah,
                (bm, s) => {
                    if (searchCallbacks.onItemSelected) searchCallbacks.onItemSelected();
                    _openBookmarkedVerse(bm, s);
                },
                _handleDeleteBookmark,
                _handleEditNote,
                // No onMove in search results — keep it focused
            );
        },
    });
}

/**
 * Called when exiting search mode — re-renders the full list.
 */
export function onSearchExit() {
    if (_container) {
        render(_container, _callbacks);
    }
}

/**
 * Cleans up the component.
 */
export async function destroy() {
    _clearLongPress();
    _container = null;
    _callbacks = null;
    _folderBarEl = null;
    _folders = [];
    _countByFolder = new Map();
    _surahList = [];
}

// Folder Bar Rendering 

/**
 * Renders the horizontal folder chip carousel.
 * Appended at the top of container, scrolls with the content.
 * @param {HTMLElement} container
 */
function _renderFolderBar(container) {
    const bar = document.createElement('div');
    bar.className = 'bookmark-folder-bar';

    const scroll = document.createElement('div');
    scroll.className = 'bookmark-folder-scroll';

    // Chip for every folder
    _folders.forEach(folder => {
        const chip = _createFolderChip(folder);
        scroll.appendChild(chip);
    });

    // "Add folder" chip at the end
    const addChip = document.createElement('button');
    addChip.className = 'bookmark-folder-chip bookmark-folder-chip--add';
    addChip.setAttribute('aria-label', t(`${NS}:folder_create_title`));
    addChip.innerHTML = `<i class='bx bx-plus'></i><span>${t(`${NS}:folder_add_label`)}</span>`;
    addChip.addEventListener('click', _handleAddFolder);
    scroll.appendChild(addChip);

    bar.appendChild(scroll);
    container.appendChild(bar);
    _folderBarEl = bar;
}

/**
 * Refreshes only the folder bar chips (counts and active state).
 * Avoids full re-render of the whole page.
 */
async function _refreshFolderBar() {
    _countByFolder = await BookmarkManager.getCountByFolder();
    _folders = await BookmarkManager.getAllFolders();

    if (!_folderBarEl) return;

    const scroll = _folderBarEl.querySelector('.bookmark-folder-scroll');
    if (!scroll) return;

    scroll.innerHTML = '';

    _folders.forEach(folder => {
        scroll.appendChild(_createFolderChip(folder));
    });

    const addChip = document.createElement('button');
    addChip.className = 'bookmark-folder-chip bookmark-folder-chip--add';
    addChip.setAttribute('aria-label', t(`${NS}:folder_create_title`));
    addChip.innerHTML = `<i class='bx bx-plus'></i><span>${t(`${NS}:folder_add_label`)}</span>`;
    addChip.addEventListener('click', _handleAddFolder);
    scroll.appendChild(addChip);
}

/**
 * Refreshes the Bookmark Banner when the underlying data changes (e.g. deletion).
 */
async function _refreshBanner() {
    if (!_container) return;

    const allBookmarks = await BookmarkManager.getAll();
    const latestBookmark = allBookmarks.length > 0 ? allBookmarks[0] : null;

    const currentBanner = _container.querySelector('.last-read-banner--bookmark');
    if (!currentBanner) return;

    const newBanner = QuranCard.createBookmarkBanner(latestBookmark, (bookmark) => {
        const surah = _surahList.find(s => parseInt(s.index) === bookmark.surahIndex);
        _openBookmarkedVerse(bookmark, surah);
    });

    if (currentBanner.parentNode) {
        currentBanner.parentNode.replaceChild(newBanner, currentBanner);
    }
}

/**
 * Creates a single folder chip element.
 * @param {object} folder
 * @returns {HTMLElement}
 */
function _createFolderChip(folder) {
    const isActive = folder.id === _activeFolderId;
    const count = _countByFolder.get(folder.id) || 0;

    const chip = document.createElement('button');
    chip.className = `bookmark-folder-chip${isActive ? ' bookmark-folder-chip--active' : ''}`;
    chip.setAttribute('data-folder-id', folder.id);
    chip.setAttribute('aria-pressed', String(isActive));

    const folderLabel = folder.isDefault
        ? t(`${NS}:${folder.name}`)
        : escapeHtml(folder.name);

    const iconMap = {
        'all': 'bx-bookmarks',
        'last_read': 'bx-history',
        'memorization': 'bx-brain'
    };
    const iconClass = folder.isDefault ? (iconMap[folder.id] || 'bx-folder') : 'bx-folder';

    chip.innerHTML = `
        <i class='bx ${iconClass}'></i>
        <span>${folderLabel}</span>
        <span class="bookmark-folder-chip__count">${count}</span>
    `;

    // Tap → select folder
    chip.addEventListener('click', () => _handleFolderSelect(folder.id));

    // Long-press → manage folder (non-default folders only)
    if (!folder.isDefault) {
        _bindLongPress(chip, () => _handleFolderManage(folder, chip));
    }

    return chip;
}

// Bookmark List Rendering 

/**
 * Renders the bookmark list for the currently active folder.
 * @param {HTMLElement} container
 */
async function _renderBookmarkList(container) {
    const listWrapper = document.createElement('div');
    listWrapper.className = 'bookmark-list-wrapper';
    container.appendChild(listWrapper);

    const bookmarks = await BookmarkManager.getByFolder(_activeFolderId);

    if (!bookmarks.length) {
        _renderEmptyState(listWrapper);
        return;
    }

    // Only show the move button if there are multiple folders to move to
    const hasMultipleFolders = _folders.length > 1;

    await renderBatchedList({
        data: bookmarks,
        container: listWrapper,
        listCreatorFn: () => QuranCard.createBookmarkList(),
        batchSize: 15,
        createItemFn: (bookmark) => {
            const surah = _surahList.find(s => parseInt(s.index) === bookmark.surahIndex);
            return QuranCard.createBookmarkCard(
                bookmark,
                surah,
                (selectedBookmark, selectedSurah) => {
                    if (_callbacks?.onItemSelected) _callbacks.onItemSelected();
                    _openBookmarkedVerse(selectedBookmark, selectedSurah);
                },
                _handleDeleteBookmark,
                _handleEditNote,
                hasMultipleFolders ? _handleToggleCategory : undefined,
            );
        },
    });
}

// Folder Handlers 

/**
 * Selects a folder and re-renders the bookmark list.
 * @param {string} folderId
 */
async function _handleFolderSelect(folderId) {
    if (_activeFolderId === folderId) return;
    _activeFolderId = folderId;


    if (_folderBarEl) {
        _folderBarEl.querySelectorAll('.bookmark-folder-chip[data-folder-id]').forEach(chip => {
            const isActive = chip.dataset.folderId === folderId;
            chip.classList.toggle('bookmark-folder-chip--active', isActive);
            chip.setAttribute('aria-pressed', String(isActive));
        });
    }

    // Re-render only the list wrapper
    const existingWrapper = _container?.querySelector('.bookmark-list-wrapper');
    if (existingWrapper) existingWrapper.remove();

    if (_container) {
        await _renderBookmarkList(_container);
    }
}

/**
 * Opens the create-folder modal.
 */
async function _handleAddFolder() {
    showCreateFolderModal(async (name) => {
        if (!name) return;

        const result = await BookmarkManager.createFolder(name);
        if (!result.success) {
            const key = result.error === 'duplicate'
                ? `${NS}:folder_name_duplicate`
                : result.error === 'too_long'
                    ? `${NS}:folder_name_too_long`
                    : `${NS}:folder_name_empty`;
            Notification.warning(t(key));
            return;
        }

        Notification.success(t(`${NS}:folder_created_notif`, { name: result.folder.name }));
        await _refreshFolderBar();
    });
}

/**
 * Opens the manage-folder dropdown menu (rename / delete).
 * @param {object} folder
 * @param {HTMLElement} chipEl
 */
async function _handleFolderManage(folder, chipEl) {
    impact('medium');

    // Remove any existing menus
    document.querySelectorAll('.folder-action-dropdown').forEach(d => d.remove());

    const rect = chipEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'bookmark-action-dropdown folder-action-dropdown active';
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${Math.max(16, rect.left)}px`;
    dropdown.style.right = 'auto'; // Prevent stretching
    dropdown.style.zIndex = '9999';
    dropdown.style.width = 'max-content';
    dropdown.style.minWidth = '140px';

    // Rename Option
    const renameBtn = document.createElement('button');
    renameBtn.className = 'bookmark-dropdown-item';
    renameBtn.innerHTML = `<i class='bx bx-pencil'></i> <span>${t(`${NS}:folder_rename_title`) || 'Rename'}</span>`;
    renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.remove();
        showCreateFolderModal(async (newName) => {
            if (!newName) {
                Notification.warning(t(`${NS}:folder_name_empty`));
                return;
            }
            const res = await BookmarkManager.renameFolder(folder.id, newName);
            if (!res.success) {
                const key = res.error === 'duplicate'
                    ? `${NS}:folder_name_duplicate`
                    : res.error === 'too_long'
                        ? `${NS}:folder_name_too_long`
                        : `${NS}:folder_name_empty`;
                Notification.warning(t(key));
                return;
            }
            Notification.success(t(`${NS}:folder_renamed_notif`));
            await _refreshFolderBar();
        }, folder.name, t(`${NS}:folder_rename_btn`)); // Use button text as modal title override
    });

    // Delete Option
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bookmark-dropdown-item bookmark-dropdown-item--danger';
    deleteBtn.innerHTML = `<i class='bx bx-trash'></i> <span>${t(`${NS}:folder_delete_title`) || 'Delete'}</span>`;
    deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.remove();
        showConfirmModal({
            title: t(`${NS}:confirm_delete_title`) || 'Confirm Delete',
            message: t(`${NS}:folder_delete_msg`, { name: folder.name }),
            confirmText: t('common:delete'),
            cancelText: t('common:cancel'),
            isDanger: true,
            theme: 'quran',
            onConfirm: async () => {
                const folderName = folder.name;
                if (_activeFolderId === folder.id) {
                    _activeFolderId = 'all';
                }
                const res = await BookmarkManager.deleteFolder(folder.id);
                if (!res.success) return;

                Notification.info(t(`${NS}:folder_deleted_notif`, { name: folderName }));
                _folders = await BookmarkManager.getAllFolders();
                _countByFolder = await BookmarkManager.getCountByFolder();

                if (_container) await render(_container, _callbacks);
            }
        });
    });

    dropdown.appendChild(renameBtn);
    dropdown.appendChild(deleteBtn);
    document.body.appendChild(dropdown);

    // Global click listener to close menu
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    }, 10);
}

// Bookmark Handlers 

/**
 * Opens the reader at the bookmarked verse.
 * @param {object} bookmark
 * @param {object} surah
 */
async function _openBookmarkedVerse(bookmark, surah) {
    if (!surah) return;

    let targetItem = surah;
    const readMode = bookmark.readMode || 'surah';

    if (readMode === 'juz' && bookmark.juzIndex) {
        const juzList = await getJuzList();
        const juz = juzList.find(j => j.index == bookmark.juzIndex);
        if (juz) targetItem = juz;
    }

    const targetObj = {
        verseNumber: bookmark.verseNumber,
        surahIndex: bookmark.surahIndex,
    };

    QuranReader.open(targetItem, readMode, targetObj, {
        onClose: () => {
            if (_container) render(_container, _callbacks);
        },
    });
}

/**
 * Handles bookmark deletion with card exit animation.
 * @param {object}      bookmark
 * @param {HTMLElement} cardEl
 */
function _handleDeleteBookmark(bookmark, cardEl) {
    showConfirmModal({
        title: t(`${NS}:confirm_delete_title`),
        message: t(`${NS}:confirm_delete_msg`, {
            surah: escapeHtml(bookmark.surahTitle),
            verse: bookmark.verseNumber,
        }),
        confirmText: t('common:delete'),
        cancelText: t('common:cancel'),
        isDanger: true,
        theme: 'quran',
        onConfirm: () => {
            cardEl.classList.add('bookmark-card-exit');

            cardEl.addEventListener('animationend', async () => {
                cardEl.remove();
                await BookmarkManager.remove(bookmark.surahIndex, bookmark.verseNumber);
                Notification.info(t(`${NS}:deleted_notif`, {
                    surah: bookmark.surahTitle,
                    verse: bookmark.verseNumber,
                }));

                // Update count badge in carousel
                await _refreshFolderBar();

                // Update the banner in case the deleted bookmark was the latest one
                await _refreshBanner();

                // Show empty state if no more cards in the active list
                const wrapper = _container?.querySelector('.bookmark-list-wrapper');
                if (wrapper && !wrapper.querySelector('.surah-card')) {
                    _renderEmptyState(wrapper);
                }
            }, { once: true });
        },
    });
}

/**
 * Handles editing the custom note for a bookmark.
 * @param {object}      bookmark
 * @param {HTMLElement} cardEl
 */
function _handleEditNote(bookmark, cardEl) {
    showBookmarkNoteModal(bookmark.note || '', async (newNote) => {
        const success = await BookmarkManager.updateNote(
            bookmark.surahIndex,
            bookmark.verseNumber,
            newNote
        );
        if (success) {
            Notification.success(t(`${NS}:note_saved_notif`));
            if (_container) render(_container, _callbacks);
        }
    });
}

/**
 * Handles toggling category tags for a bookmark.
 * @param {object}      bookmark
 * @param {HTMLElement} cardEl
 */
async function _handleToggleCategory(bookmark, cardEl) {
    const [folders, countByFolder] = await Promise.all([
        BookmarkManager.getAllFolders(),
        BookmarkManager.getCountByFolder(),
    ]);

    const activeFolderIds = bookmark.folderIds || [];
    let hasChanged = false;

    showBookmarkCategoryModal(
        folders,
        countByFolder,
        activeFolderIds,
        async (toggledFolderId, isNowActive) => {
            hasChanged = true;
            await BookmarkManager.toggleFolderTag(bookmark.key, toggledFolderId);
        },
        async () => {
            // When modal is dismissed, refresh the UI only if changed
            if (hasChanged) {
                Notification.success(t(`${NS}:move_success_notif`));
                if (_container) await render(_container, _callbacks);
            }
        }
    );
}

// Empty State 

/**
 * Renders an empty state inside the given container.
 * @param {HTMLElement} container
 */
function _renderEmptyState(container) {
    if (!container) return;

    const isAllFolder = _activeFolderId === 'all';
    const msg = isAllFolder
        ? t(`${NS}:empty`)
        : t(`${NS}:empty_folder`);

    container.innerHTML = `
        <div class="quran-empty">
            <i class='bx bx-bookmark-alt'></i>
            <p>${msg}</p>
        </div>
    `;
}

// Long-Press Utility 

/**
 * Binds a long-press handler to an element using touch/pointer events.

 * @param {HTMLElement} el
 * @param {Function}    callback
 */
function _bindLongPress(el, callback) {
    let fired = false;

    const start = () => {
        fired = false;
        _lpTimer = setTimeout(() => {
            fired = true;
            impact('medium');
            callback();
        }, LP_DELAY);
    };

    const cancel = () => _clearLongPress();

    // Touch events
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });
    el.addEventListener('touchmove', cancel, { passive: true });

    // Mouse events for desktop support
    el.addEventListener('mousedown', start, { passive: true });
    el.addEventListener('mouseup', cancel, { passive: true });
    el.addEventListener('mouseleave', cancel, { passive: true });

    // Block the subsequent click event if a long press just fired
    el.addEventListener('click', (e) => {
        if (fired) {
            e.stopPropagation();
            e.preventDefault();
            fired = false; // Reset for next time
        }
    }, { capture: true });
}

function _clearLongPress() {
    if (_lpTimer) {
        clearTimeout(_lpTimer);
        _lpTimer = null;
    }
}
