/**
 * Mushaf API — Data service for Mushaf Mode.
 * Handles page fetching (LRU-cached) and Medina surah index queries.
 */

const TOTAL_PAGES = 604;
const MAX_CACHE_SIZE = 30;

/* ─── Page Cache ─── */

const _pageCache = new Map();
const _pending = new Map();

function _touchCache(key) {
   if (_pageCache.has(key)) {
      const val = _pageCache.get(key);
      _pageCache.delete(key);
      _pageCache.set(key, val);
      return val;
   }
   return undefined;
}

function _enforceCacheLimit() {
   while (_pageCache.size > MAX_CACHE_SIZE) {
      const oldest = _pageCache.keys().next().value;
      if (oldest !== undefined) _pageCache.delete(oldest);
   }
}

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

   const cached = _touchCache(key);
   if (cached !== undefined) return cached;

   if (_pending.has(key)) return _pending.get(key);

   const promise = fetch(`/quran/mushaf/page-${String(key).padStart(3, '0')}.json`)
      .then(res => {
         if (!res.ok) throw new Error(`Failed to load mushaf page ${key}`);
         return res.json();
      })
      .then(data => {
         _pageCache.set(key, data);
         _enforceCacheLimit();
         _pending.delete(key);
         return data;
      })
      .catch(err => {
         _pending.delete(key);
         throw err;
      });

   _pending.set(key, promise);
   return promise;
}

export function getTotalPages() {
   return TOTAL_PAGES;
}

export { clampPage };
