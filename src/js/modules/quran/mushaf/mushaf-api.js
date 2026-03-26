/**
 * Mushaf API — Data service for Mushaf Mode.
 * Handles page fetching (LRU-cached), Medina surah index queries,
 * and tajweed data loading for Mushaf text.
 */

import { getTajweedEnabled } from '../quran-settings.js';

const TOTAL_PAGES = 604;
const MAX_CACHE_SIZE = 50;
const MAX_TAJWEED_CACHE = 20;

/* ─── Generic LRU Helpers ─── */

function _touchMap(map, key) {
   if (map.has(key)) {
      const val = map.get(key);
      map.delete(key);
      map.set(key, val);
      return val;
   }
   return undefined;
}

function _enforceMapLimit(map, limit) {
   while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
   }
}

/* ─── Page Cache ─── */

const _pageCache = new Map();
const _pagePending = new Map();

/* ─── Tajweed Cache ─── */

const _tajweedCache = new Map();
const _tajweedPending = new Map();

/* ─── Mushaf Index Cache ─── */

let _mushafIndex = null;

/**
 * Loads the Medina mushaf surah-to-page index.
 * @returns {Promise<Array<{surah:number,title:string,titleAr:string,startPage:number}>>}
 */
export async function getMushafIndex() {
   if (_mushafIndex) return _mushafIndex;
   const res = await fetch('/quran/mushaf/mushaf-index.json');
   if (!res.ok) throw new Error('Failed to load mushaf index');
   _mushafIndex = await res.json();
   return _mushafIndex;
}

/**
 * Returns the surah entry for a given Medina page number.
 * Uses the cached index (must call getMushafIndex() first).
 */
export function getSurahForPage(pageNumber) {
   if (!_mushafIndex || !_mushafIndex.length) return null;
   let result = _mushafIndex[0];
   for (const s of _mushafIndex) {
      if (s.startPage <= pageNumber) result = s;
      else break;
   }
   return result;
}

/* ─── Public API ─── */

function clampPage(n) {
   return Math.max(1, Math.min(TOTAL_PAGES, n));
}

/**
 * Fetches a single Mushaf page with LRU caching and in-flight deduplication.
 * @param {number} pageNumber - Page number (1–604)
 */
export async function getPage(pageNumber) {
   const key = clampPage(pageNumber);

   const cached = _touchMap(_pageCache, key);
   if (cached !== undefined) return cached;

   if (_pagePending.has(key)) return _pagePending.get(key);

   const promise = fetch(`/quran/mushaf/page-${String(key).padStart(3, '0')}.json`)
      .then(res => {
         if (!res.ok) throw new Error(`Failed to load mushaf page ${key}`);
         return res.json();
      })
      .then(data => {
         _pageCache.set(key, data);
         _enforceMapLimit(_pageCache, MAX_CACHE_SIZE);
         _pagePending.delete(key);
         return data;
      })
      .catch(err => {
         _pagePending.delete(key);
         throw err;
      });

   _pagePending.set(key, promise);
   return promise;
}

/**
 * Fetches tajweed data for a surah, with LRU caching.
 * Returns null if tajweed is disabled or data is unavailable.
 * @param {number|string} surahNum
 * @returns {Promise<Object|null>}
 */
export async function getTajweed(surahNum) {
   if (!getTajweedEnabled()) return null;

   const key = parseInt(surahNum, 10);
   const cached = _touchMap(_tajweedCache, key);
   if (cached !== undefined) return cached;

   if (_tajweedPending.has(key)) return _tajweedPending.get(key);

   const promise = Promise.all([
      fetch(`/quran/tajweed/surah_${key}.json`).then(res => res.ok ? res.json() : null),
      fetch(`/quran/surah/surah_${key}.json`).then(res => res.ok ? res.json() : null)
   ])
      .then(([rulesData, textData]) => {
         if (!rulesData || !textData) {
            _tajweedCache.set(key, null);
            _enforceMapLimit(_tajweedCache, MAX_TAJWEED_CACHE);
            return null;
         }
         
         const bundled = { rules: rulesData, text: textData };
         _tajweedCache.set(key, bundled);
         _enforceMapLimit(_tajweedCache, MAX_TAJWEED_CACHE);
         _tajweedPending.delete(key);
         return bundled;
      })
      .catch(err => {
         console.warn(`[MushafAPI] Failed to load tajweed for surah ${key}:`, err);
         _tajweedCache.set(key, null);
         _enforceMapLimit(_tajweedCache, MAX_TAJWEED_CACHE);
         _tajweedPending.delete(key);
         return null;
      });

   _tajweedPending.set(key, promise);
   return promise;
}

/**
 * Extracts unique surah numbers from a Mushaf page's line data.
 * Reads surah-header lines and word locations to build the set.
 * @param {Object} pageData
 * @returns {number[]}
 */
export function getSurahsInPage(pageData) {
   const surahs = new Set();
   for (const line of pageData.lines) {
      if (line.type === 'surah-header' && line.surah) {
         surahs.add(parseInt(line.surah, 10));
      }
      if (line.words) {
         for (const w of line.words) {
            if (w.location) {
               surahs.add(parseInt(w.location.split(':')[0], 10));
            }
         }
      }
   }
   return [...surahs];
}

export function getTotalPages() {
   return TOTAL_PAGES;
}

export { clampPage };
