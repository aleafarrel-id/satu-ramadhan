/**
 * Bookmark Manager Module
 */

import * as Storage from '../../core/storage.js';
import { impact } from '../system/haptic.js';

const STORAGE_KEY = 'quran_bookmarks';

let _cache = null;
let _initPromise = null;

/**
 * Ensures the bookmark cache is loaded from storage.
 * @returns {Promise<Array>}
 */
async function _ensureLoaded() {
   if (_cache !== null) return _cache;
   if (!_initPromise) {
      _initPromise = Storage.get(STORAGE_KEY).then(data => {
         _cache = Array.isArray(data) ? data : [];
         _initPromise = null;
         return _cache;
      });
   }
   return _initPromise;
}

/**
 * Persists the current cache to storage.
 */
async function _persist() {
   await Storage.set(STORAGE_KEY, _cache);
}

/**
 * Generates a unique bookmark key from ayah data.
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @returns {string}
 */
export function createKey(surahIndex, verseNumber) {
   return `surah_${surahIndex}_verse_${verseNumber}`;
}

/**
 * Returns all saved bookmarks, newest first.
 * @returns {Promise<Array>}
 */
export async function getAll() {
   await _ensureLoaded();
   return [..._cache];
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
 * Synchronous check (only valid after cache is loaded).
 * @param {number} surahIndex
 * @param {number} verseNumber
 * @returns {boolean}
 */
export function isBookmarkedSync(surahIndex, verseNumber) {
   if (!_cache) return false;
   const key = createKey(surahIndex, verseNumber);
   return _cache.some(b => b.key === key);
}

/**
 * Saves an ayah to bookmarks.
 * @param {Object} ayahData
 * @returns {Promise<boolean>} true if added, false if already existed
 */
export async function save(ayahData) {
   await _ensureLoaded();
   const key = createKey(ayahData.surahIndex, ayahData.verseNumber);

   if (_cache.some(b => b.key === key)) return false;

   const entry = {
      key,
      surahIndex: ayahData.surahIndex,
      surahTitle: ayahData.surahName,
      surahTitleAr: ayahData.surahTitleAr || '',
      verseNumber: ayahData.verseNumber,
      type: ayahData.type || '',
      readMode: ayahData.readMode || 'surah',
      juzIndex: ayahData.juzIndex || null,
      timestamp: Math.floor(Date.now() / 1000)
   };

   _cache.unshift(entry);
   await _persist();
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
   await _persist();
   return true;
}

/**
 * Toggles the bookmark state for an ayah.
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
      await _persist();
      return false;
   }

   return await save(ayahData);
}

/**
 * Preloads the bookmark cache (call during app init for instant performance).
 */
export function preload() {
   _ensureLoaded().catch(err => {
      console.warn('[BookmarkManager] Preload failed:', err);
   });
}
