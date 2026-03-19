/**
 * API Data Service for Quran
 * Handles data fetching and caching for all Quran-related features.
 */

const _cache = {
   surahList: null,
   juzList: null,
   surahs: new Map(),
   translations: new Map(),
   tajweed: new Map()
};

/**
 * Fetches the list of all Surahs.
 * @returns {Promise<Array>}
 */
export async function getSurahList() {
   if (_cache.surahList) return _cache.surahList;
   
   const res = await fetch('/quran/surah.json');
   if (!res.ok) throw new Error('Gagal memuat daftar surah');
   
   const data = await res.json();
   _cache.surahList = data;
   return data;
}

/**
 * Fetches the list of all Juz.
 * @returns {Promise<Array>}
 */
export async function getJuzList() {
   if (_cache.juzList) return _cache.juzList;

   const res = await fetch('/quran/juz.json');
   if (!res.ok) throw new Error('Gagal memuat daftar juz');

   const data = await res.json();
   _cache.juzList = data;
   return data;
}

/**
 * Fetches a specific Surah's text data.
 * @param {number|string} index 
 * @returns {Promise<Object>}
 */
export async function getSurahData(index) {
   const key = parseInt(index, 10);
   if (_cache.surahs.has(key)) return _cache.surahs.get(key);
   
   const res = await fetch(`/quran/surah/surah_${key}.json`);
   if (!res.ok) throw new Error(`Gagal memuat surah ${key}`);
   
   const data = await res.json();
   _cache.surahs.set(key, data);
   return data;
}

/**
 * Fetches the translation for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object>}
 */
export async function getTranslationData(index) {
   const key = parseInt(index, 10);
   if (_cache.translations.has(key)) return _cache.translations.get(key);
   
   const res = await fetch(`/quran/translation/id/id_translation_${key}.json`);
   if (!res.ok) throw new Error(`Gagal memuat terjemahan surah ${key}`);
   
   const data = await res.json();
   _cache.translations.set(key, data);
   return data;
}

/**
 * Fetches the Tajweed data for a specific Surah.
 * @param {number|string} index 
 * @returns {Promise<Object|null>}
 */
export async function getTajweedData(index) {
   const key = parseInt(index, 10);
   if (_cache.tajweed.has(key)) return _cache.tajweed.get(key);
   
   try {
      const res = await fetch(`/quran/tajweed/surah_${key}.json`);
      if (!res.ok) {
          _cache.tajweed.set(key, null); // Cache failures to avoid retries
          return null;
      }
      
      const text = await res.text();
      const cleanText = text.replace(/^\uFEFF/, '');
      const data = JSON.parse(cleanText);
      
      _cache.tajweed.set(key, data);
      return data;
   } catch (err) {
      console.warn(`[QuranAPI] Failed to load tajweed for surah ${key}:`, err);
      _cache.tajweed.set(key, null);
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
