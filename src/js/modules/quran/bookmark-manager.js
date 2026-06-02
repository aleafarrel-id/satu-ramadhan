/**
 * Bookmark Manager Module
 * Provides CRUD operations for bookmarks and folder-based categorization.
 * Storage uses separate keys for bookmarks and folder registry.
 */

import * as Storage from '../../core/storage.js';
import { impact } from '../system/haptic.js';

const BOOKMARKS_KEY = 'quran_bookmarks';
const FOLDERS_KEY = 'quran_bookmark_folders';

const DEFAULT_FOLDERS = [
   { id: 'all', name: 'folder_all', isDefault: true, order: 0 },
   { id: 'last_read', name: 'folder_last_read', isDefault: true, order: 1 },
   { id: 'memorization', name: 'folder_memorization', isDefault: true, order: 2 }
];

let _cache = null;
let _folders = null;
let _initPromise = null;

/**
 * Loads bookmarks and folder registry from storage.
 * Handles auto-migration from legacy flat-array format.
 * @returns {Promise<void>}
 */
async function _ensureLoaded() {
   if (_cache !== null) return;
   if (_initPromise) return _initPromise;

   _initPromise = Promise.all([
      Storage.get(BOOKMARKS_KEY),
      Storage.get(FOLDERS_KEY)
   ]).then(([bookmarkData, folderData]) => {
      let rawBookmarks = bookmarkData;

      // Recovery: extract bookmarks if stored as nested object
      if (rawBookmarks && typeof rawBookmarks === 'object' && !Array.isArray(rawBookmarks)) {
         rawBookmarks = Array.isArray(rawBookmarks.bookmarks)
            ? rawBookmarks.bookmarks
            : [];
      }

      _cache = Array.isArray(rawBookmarks) ? rawBookmarks : [];
      const rawFolders = Array.isArray(folderData) ? folderData : [];

      // Deduplicate: strip default folder IDs from custom storage
      const defaultIds = new Set(DEFAULT_FOLDERS.map(f => f.id));
      _folders = rawFolders.filter(f => !defaultIds.has(f.id));
      if (_folders.length !== rawFolders.length) {
         Storage.set(FOLDERS_KEY, _folders).catch(() => {});
      }

      // Auto-migration: ensure every entry carries a folderIds array
      let needsMigration = false;
      _cache.forEach(entry => {
         if (!Array.isArray(entry.folderIds)) {
            entry.folderIds = [];
            needsMigration = true;
         }
      });

      if (needsMigration) {
         Storage.set(BOOKMARKS_KEY, _cache).catch(err => {
            console.warn('[BookmarkManager] Migration persist failed:', err);
         });
      }

      // Recovery: extract folders embedded in old format
      if (bookmarkData && typeof bookmarkData === 'object' && !Array.isArray(bookmarkData)) {
         if (Array.isArray(bookmarkData.folders) && bookmarkData.folders.length && !_folders.length) {
            _folders = bookmarkData.folders;
            Storage.set(FOLDERS_KEY, _folders).catch(() => {});
         }
      }

      _initPromise = null;
   });

   return _initPromise;
}

/**
 * Persists bookmark entries to storage.
 */
async function _persistBookmarks() {
   await Storage.set(BOOKMARKS_KEY, _cache);
}

/**
 * Persists folder registry to storage.
 */
async function _persistFolders() {
   await Storage.set(FOLDERS_KEY, _folders);
}

/**
 * Creates a bookmark entry object from ayah data.
 * @param {Object} ayahData
 * @param {string[]} [folderIds=[]]
 * @returns {Object}
 */
function _createEntry(ayahData, folderIds = []) {
   return {
      key: createKey(ayahData.surahIndex, ayahData.verseNumber),
      surahIndex: ayahData.surahIndex,
      surahTitle: ayahData.surahName,
      surahTitleAr: ayahData.surahTitleAr || '',
      verseNumber: ayahData.verseNumber,
      type: ayahData.type || '',
      readMode: ayahData.readMode || 'surah',
      juzIndex: ayahData.juzIndex || null,
      note: ayahData.note || '',
      folderIds,
      timestamp: Math.floor(Date.now() / 1000)
   };
}

/**
 * Generates a unique bookmark key from ayah coordinates.
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @returns {string}
 */
export function createKey(surahIndex, verseNumber) {
   return `surah_${surahIndex}_verse_${verseNumber}`;
}

/* Bookmark Queries */

/**
 * Returns all saved bookmarks, newest first.
 * @returns {Promise<Array>}
 */
export async function getAll() {
   await _ensureLoaded();
   return [..._cache];
}

/**
 * Returns bookmarks belonging to a specific folder.
 * The 'all' folder returns every bookmark regardless of tags.
 * @param {string} folderId
 * @returns {Promise<Array>}
 */
export async function getByFolder(folderId) {
   await _ensureLoaded();
   if (folderId === 'all') return [..._cache];
   return _cache.filter(b => b.folderIds && b.folderIds.includes(folderId));
}

/**
 * Checks whether a specific ayah is bookmarked.
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @returns {Promise<boolean>}
 */
export async function isBookmarked(surahIndex, verseNumber) {
   await _ensureLoaded();
   const key = createKey(surahIndex, verseNumber);
   return _cache.some(b => b.key === key);
}

/**
 * Synchronous bookmark check (only valid after cache is loaded).
 * Used by quran-reader for instant icon rendering.
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @returns {boolean}
 */
export function isBookmarkedSync(surahIndex, verseNumber) {
   if (!_cache) return false;
   const key = createKey(surahIndex, verseNumber);
   return _cache.some(b => b.key === key);
}

/* Bookmark Mutations */

/**
 * Saves an ayah to bookmarks.
 * @param {Object} ayahData
 * @returns {Promise<boolean>} true if added, false if already existed
 */
export async function save(ayahData) {
   await _ensureLoaded();
   const key = createKey(ayahData.surahIndex, ayahData.verseNumber);

   if (_cache.some(b => b.key === key)) return false;

   _cache.unshift(_createEntry(ayahData));
   await _persistBookmarks();
   document.dispatchEvent(new CustomEvent('quran:bookmarks-updated'));
   return true;
}

/**
 * Removes a bookmark by surah index and verse number.
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @returns {Promise<boolean>} true if removed
 */
export async function remove(surahIndex, verseNumber) {
   await _ensureLoaded();
   const key = createKey(surahIndex, verseNumber);
   const idx = _cache.findIndex(b => b.key === key);
   if (idx === -1) return false;

   _cache.splice(idx, 1);
   await _persistBookmarks();
   document.dispatchEvent(new CustomEvent('quran:bookmarks-updated'));
   return true;
}

/**
 * Updates the custom note for a specific bookmark.
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @param {string} note
 * @returns {Promise<boolean>} true if updated
 */
export async function updateNote(surahIndex, verseNumber, note) {
   await _ensureLoaded();
   const key = createKey(surahIndex, verseNumber);
   const idx = _cache.findIndex(b => b.key === key);
   if (idx === -1) return false;

   _cache[idx].note = note;
   await _persistBookmarks();
   return true;
}

/**
 * Toggles the bookmark state for an ayah.
 * When adding, automatically assigns the 'last_read' tag
 * and shifts it from the previous holder (Smart Last Read).
 * @param {Object} ayahData
 * @returns {Promise<boolean>} true if now bookmarked, false if removed
 */
export async function toggle(ayahData) {
   impact('light');
   const key = createKey(ayahData.surahIndex, ayahData.verseNumber);
   await _ensureLoaded();

   const idx = _cache.findIndex(b => b.key === key);
   if (idx !== -1) {
      _cache.splice(idx, 1);
      await _persistBookmarks();
      document.dispatchEvent(new CustomEvent('quran:bookmarks-updated'));
      return false;
   }

   // Smart Last Read: clear tag from all existing entries
   _cache.forEach(b => {
      if (b.folderIds) {
         b.folderIds = b.folderIds.filter(id => id !== 'last_read');
      }
   });

   _cache.unshift(_createEntry(ayahData, ['last_read']));
   await _persistBookmarks();
   document.dispatchEvent(new CustomEvent('quran:bookmarks-updated'));
   return true;
}

/**
 * Preloads the bookmark cache for instant subsequent access.
 */
export function preload() {
   _ensureLoaded().catch(err => {
      console.warn('[BookmarkManager] Preload failed:', err);
   });
}

/* Folder Queries */

/**
 * Returns all folders (defaults + custom), ordered.
 * @returns {Promise<Array>}
 */
export async function getAllFolders() {
   await _ensureLoaded();
   return [...DEFAULT_FOLDERS, ..._folders];
}

/**
 * Returns bookmark count per folder as a Map.
 * @returns {Promise<Map<string, number>>}
 */
export async function getCountByFolder() {
   await _ensureLoaded();
   const countMap = new Map();
   const allFolders = [...DEFAULT_FOLDERS, ..._folders];
   allFolders.forEach(f => countMap.set(f.id, 0));

   countMap.set('all', _cache.length);

   _cache.forEach(b => {
      if (!b.folderIds) return;
      b.folderIds.forEach(id => {
         if (countMap.has(id)) {
            countMap.set(id, countMap.get(id) + 1);
         }
      });
   });

   return countMap;
}

/* Folder Mutations */

/**
 * Creates a new custom folder.
 * @param {string} name
 * @returns {Promise<{success: boolean, folder?: Object, error?: string}>}
 */
export async function createFolder(name) {
   await _ensureLoaded();
   const trimmed = name.trim();

   if (!trimmed) return { success: false, error: 'empty' };
   if (trimmed.length > 30) return { success: false, error: 'too_long' };

   const isDuplicate = _folders.some(
      f => f.name.toLowerCase() === trimmed.toLowerCase()
   );
   if (isDuplicate) return { success: false, error: 'duplicate' };

   const maxOrder = _folders.reduce(
      (max, f) => Math.max(max, f.order || 0),
      DEFAULT_FOLDERS.length
   );

   const folder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      isDefault: false,
      order: maxOrder + 1
   };

   _folders.push(folder);
   await _persistFolders();
   return { success: true, folder };
}

/**
 * Renames an existing custom folder.
 * @param {string} id
 * @param {string} newName
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function renameFolder(id, newName) {
   await _ensureLoaded();
   const trimmed = newName.trim();

   if (!trimmed) return { success: false, error: 'empty' };
   if (trimmed.length > 30) return { success: false, error: 'too_long' };

   const isDuplicate = _folders.some(
      f => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase()
   );
   if (isDuplicate) return { success: false, error: 'duplicate' };

   const folder = _folders.find(f => f.id === id);
   if (!folder) return { success: false, error: 'not_found' };

   folder.name = trimmed;
   await _persistFolders();
   return { success: true };
}

/**
 * Deletes a custom folder and removes its tag from all bookmarks.
 * Bookmark entries themselves are preserved.
 * @param {string} id
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteFolder(id) {
   await _ensureLoaded();
   const idx = _folders.findIndex(f => f.id === id);
   if (idx === -1) return { success: false };

   _folders.splice(idx, 1);

   // Atomic: strip the deleted folder tag from every bookmark
   _cache.forEach(b => {
      if (b.folderIds) {
         b.folderIds = b.folderIds.filter(fid => fid !== id);
      }
   });

   await Promise.all([_persistBookmarks(), _persistFolders()]);
   return { success: true };
}

/**
 * Toggles a folder tag on a bookmark.
 * For 'last_read', enforces exclusivity (only one bookmark at a time).
 * @param {string} key
 * @param {string} folderId
 * @returns {Promise<boolean>} true if updated
 */
export async function toggleFolderTag(key, folderId) {
   await _ensureLoaded();
   const bookmark = _cache.find(b => b.key === key);
   if (!bookmark) return false;

   if (!Array.isArray(bookmark.folderIds)) bookmark.folderIds = [];

   if (folderId === 'last_read') {
      const hasTag = bookmark.folderIds.includes('last_read');
      if (hasTag) {
         bookmark.folderIds = bookmark.folderIds.filter(id => id !== 'last_read');
      } else {
         // Exclusive: only one bookmark may hold 'last_read'
         _cache.forEach(b => {
            if (b.folderIds) {
               b.folderIds = b.folderIds.filter(id => id !== 'last_read');
            }
         });
         bookmark.folderIds.push('last_read');
      }
   } else {
      const tagIdx = bookmark.folderIds.indexOf(folderId);
      if (tagIdx === -1) {
         bookmark.folderIds.push(folderId);
      } else {
         bookmark.folderIds.splice(tagIdx, 1);
      }
   }

   await _persistBookmarks();
   document.dispatchEvent(new CustomEvent('quran:bookmarks-updated'));
   return true;
}
