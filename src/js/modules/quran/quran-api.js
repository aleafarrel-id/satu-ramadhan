/**
 * Quran API Module
 */

import { getTajweedEnabled, getTranslationLanguage, getTransliterationEnabled } from './quran-settings.js';

const MAX_CACHE_SIZE = 15;

const _cache = {
   surahList: null,
   juzList: null,
   surahs: new Map(),
   translations: new Map(),
   tajweed: new Map(),
   latin: new Map()
};

// Lazily-computed cumulative ayah offset per surah (index 0 = Surah 1).
// Derived from surah.json — never hardcoded.
let _surahGlobalOffsets = null;

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
 * Returns the global Quran ayah number (1–6236) for a surah+ayah pair.
 *
 * Computes and caches the cumulative offset table lazily from the already-loaded
 * surahList (`count` field in surah.json). In practice getSurahList() resolves
 * instantly from cache because the Quran Reader always loads it first.
 *
 * @param {number} surahIndex - 1-based surah number
 * @param {number} ayahNumber - 1-based ayah number within the surah
 * @returns {Promise<number>}
 */
export async function getGlobalAyahNumber(surahIndex, ayahNumber) {
   if (!_surahGlobalOffsets) {
      const list = await getSurahList();
      let offset = 1;
      _surahGlobalOffsets = list.map(s => {
         const start = offset;
         offset += Number(s.count);
         return start;
      });
   }
   return _surahGlobalOffsets[surahIndex - 1] + (ayahNumber - 1);
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
 * Fetches the Latin transliteration data for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object>}
 */
export async function getLatinData(index) {
   if (!getTransliterationEnabled()) return { verse: {} };

   const key = parseInt(index, 10);
   const cached = _getFromCache(_cache.latin, key);
   if (cached !== undefined) return cached;

   try {
      const data = await _fetchJson(`/quran/latin/surah_${key}.json`, `Gagal memuat transliterasi latin surah ${key}`);
      _cache.latin.set(key, data);
      _enforceCacheLimit(_cache.latin);
      return data;
   } catch (err) {
      console.warn(`[QuranAPI] Failed to load latin for surah ${key}:`, err);
      // Fallback: return empty formatting so error isn't fatal
      return { verse: {} };
   }
}

/**
 * Fetches the translation for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object>}
 */
export async function getTranslationData(index) {
   const lang = getTranslationLanguage();
   const key = parseInt(index, 10);
   const cacheKey = `${lang}_${key}`;

   const cached = _getFromCache(_cache.translations, cacheKey);
   if (cached !== undefined) return cached;

   const data = await _fetchJson(`/quran/translation/${lang}/${lang}_translation_${key}.json`, `Gagal memuat terjemahan surah ${key}`);
   _cache.translations.set(cacheKey, data);
   _enforceCacheLimit(_cache.translations);
   return data;
}

/**
 * Fetches the Tajweed data for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object|null>}
 */
export async function getTajweedData(index) {
   if (!getTajweedEnabled()) return null;

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
 * @returns {Promise<[Object, Object, Object|null, Object]>} [surahData, translationData, tajweedData, latinData]
 */
export async function getFullSurahPayload(index) {
   return Promise.all([
      getSurahData(index),
      getTranslationData(index),
      getTajweedData(index),
      getLatinData(index)
   ]);
}

/**
 * Preloads the Surah list to make navigation faster natively.
 */
export function preloadSurahList() {
   getSurahList().catch(console.warn);
}
