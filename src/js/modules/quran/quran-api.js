/**
 * API Data Service for Quran
 * Handles data fetching and caching for all Quran-related features.
 */

const MAX_CACHE_SIZE = 15;

const _cache = {
   surahList: null,
   juzList: null,
   surahs: new Map(),
   translations: new Map(),
   tajweed: new Map()
};

/**
 * Ensures cache behaves like LRU by refreshing key order on access.
 */
function _getFromCache(map, key) {
   if (map.has(key)) {
      const val = map.get(key);
      map.delete(key);
      map.set(key, val);
      return val;
   }
   return undefined;
}

/**
 * Enforces a maximum size on a Map cache.
 */
function _enforceCacheLimit(map, limit = MAX_CACHE_SIZE) {
   if (map.size > limit) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) map.delete(oldestKey);
   }
}

/**
 * Generic JSON fetcher.
 */
async function _fetchJson(url, errorMessage) {
   const res = await fetch(url);
   if (!res.ok) throw new Error(errorMessage);
   return await res.json();
}

/**
 * Fetches the list of all Surahs.
 * @returns {Promise<Array>}
 */
export async function getSurahList() {
   if (_cache.surahList) return _cache.surahList;
   _cache.surahList = await _fetchJson('/quran/surah.json', 'Gagal memuat daftar surah');
   return _cache.surahList;
}

/**
 * Fetches the list of all Juz.
 * @returns {Promise<Array>}
 */
export async function getJuzList() {
   if (_cache.juzList) return _cache.juzList;
   _cache.juzList = await _fetchJson('/quran/juz.json', 'Gagal memuat daftar juz');
   return _cache.juzList;
}

/**
 * Fetches a specific Surah's text data.
 * @param {number|string} index 
 * @returns {Promise<Object>}
 */
export async function getSurahData(index) {
   const key = parseInt(index, 10);
   const cached = _getFromCache(_cache.surahs, key);
   if (cached !== undefined) return cached;

   const data = await _fetchJson(`/quran/surah/surah_${key}.json`, `Gagal memuat surah ${key}`);
   _cache.surahs.set(key, data);
   _enforceCacheLimit(_cache.surahs);
   return data;
}

/**
 * Fetches the translation for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object>}
 */
export async function getTranslationData(index) {
   const key = parseInt(index, 10);
   const cached = _getFromCache(_cache.translations, key);
   if (cached !== undefined) return cached;

   const data = await _fetchJson(`/quran/translation/id/id_translation_${key}.json`, `Gagal memuat terjemahan surah ${key}`);
   _cache.translations.set(key, data);
   _enforceCacheLimit(_cache.translations);
   return data;
}

/**
 * Fetches the Tajweed data for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object|null>}
 */
export async function getTajweedData(index) {
   const key = parseInt(index, 10);
   const cached = _getFromCache(_cache.tajweed, key);
   if (cached !== undefined) return cached;

   try {
      const res = await fetch(`/quran/tajweed/surah_${key}.json`);
      if (!res.ok) {
         _cache.tajweed.set(key, null);
         _enforceCacheLimit(_cache.tajweed);
         return null;
      }

      const data = await res.json();

      _cache.tajweed.set(key, data);
      _enforceCacheLimit(_cache.tajweed);
      return data;
   } catch (err) {
      console.warn(`[QuranAPI] Failed to load tajweed for surah ${key}:`, err);
      _cache.tajweed.set(key, null);
      _enforceCacheLimit(_cache.tajweed);
      return null;
   }
}

/**
 * Utility to parallel fetch all data needed for reading a Surah.
 * @param {number|string} index
 * @returns {Promise<[Object, Object, Object|null]>} [surahData, translationData, tajweedData]
 */
export async function getFullSurahPayload(index) {
   return Promise.all([
      getSurahData(index),
      getTranslationData(index),
      getTajweedData(index)
   ]);
}

/**
 * Preloads the Surah list to make navigation faster natively.
 */
export function preloadSurahList() {
   getSurahList().catch(console.warn);
}
