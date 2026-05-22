/**
 * Mushaf UI Module
 */

import { buildTajweedHTML, alignRulesToMushafText, getVerseRules } from '../quran-tajweed.js';

/** Escapes HTML special characters to prevent XSS. */
function _esc(str) {
   if (str === null || str === undefined) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

/**
 * Builds the full HTML string for a Mushaf page.
 * @param {Object} pageData
 * @param {Object|null} [tajweedMap=null] - Map of surahNum → tajweedData
 * @returns {string}
 */
export function buildPageHTML(pageData, tajweedMap = null) {
   const pageNum = parseInt(pageData.page, 10);
   const openingClass = (pageNum === 1 || pageNum === 2) ? ' mushaf-page--opening' : '';

   const linesHTML = pageData.lines.map(line => {
      switch (line.type) {
         case 'surah-header': return _buildSurahHeaderHTML(line);
         case 'basmala': return _buildBasmalaHTML();
         case 'text':
         default: return _buildTextLineHTML(line, tajweedMap);
      }
   }).join('');

   return `<div class="mushaf-page${openingClass}" data-page="${_esc(pageData.page)}"><div class="mushaf-lines">${linesHTML}</div></div>`;
}

/** Builds an empty backing page for the landscape RTL flip trick. */
export function buildEmptyPageHTML() {
   return '<div class="mushaf-page mushaf-page-empty"></div>';
}

export function buildPageElement(pageData) {
   const t = document.createElement('template');
   t.innerHTML = buildPageHTML(pageData);
   return t.content.firstChild;
}

export function buildEmptyPageElement() {
   const t = document.createElement('template');
   t.innerHTML = buildEmptyPageHTML();
   return t.content.firstChild;
}

function _buildSurahHeaderHTML(line) {
   return `<div class="mushaf-line mushaf-line--surah-header"><span class="mushaf-surah-name">${_esc(line.text)}</span></div>`;
}

function _buildBasmalaHTML() {
   return '<div class="mushaf-line mushaf-line--basmala"><span class="mushaf-word">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</span></div>';
}

/**
 * Builds HTML for a text line, with optional tajweed coloring.
 *
 * When tajweedMap is provided, this function:
 * 1. Iterates words and tracks each word's character offset within its verse
 *    (accounting for Mushaf-extra chars like Tatweel and verse-end digits).
 * 2. Uses alignRulesToMushafText to map tajweed offsets from surah-text space
 *    to mushaf-line-text space.
 * 3. Passes all aligned rules to buildTajweedHTML for the colored output.
 *
 * @param {Object}      line        - Line data from Mushaf page JSON
 * @param {Object|null} tajweedMap  - Map of surahNum → tajweedData (or null)
 */
function _buildTextLineHTML(line, tajweedMap) {
   if ((!line.words || !line.words.length) && (!line.text || line.text.trim() === '')) {
      return '';
   }

   if (!line.words || !line.words.length) {
      return `<div class="mushaf-line mushaf-line--text"><span class="mushaf-word">${_esc(line.text)}</span></div>`;
   }

   // Build the full line text by concatenating words with spaces
   let fullText = '';
   for (let i = 0, len = line.words.length; i < len; i++) {
      const w = line.words[i];
      fullText += (i > 0 ? ' ' : '') + (w.word || w.text || '');
   }

   // ── Tajweed Path ──
   if (tajweedMap) {
      const alignedRules = _collectAlignedRules(line.words, tajweedMap);

      if (alignedRules.length > 0) {
         const coloredHTML = buildTajweedHTML(fullText, alignedRules);
         return `<div class="mushaf-line mushaf-line--text"><span class="mushaf-word">${coloredHTML}</span></div>`;
      }
   }

   // ── Plain text fallback ──
   return `<div class="mushaf-line mushaf-line--text"><span class="mushaf-word">${_esc(fullText)}</span></div>`;
}

const _verseOffsetsCache = {};

/**
 * Collects aligned tajweed rules for all words in a line.
 * Tracks per-verse character offsets to correctly map tajweed data
 * from surah-text space to mushaf-line-text space.
 *
 * @param {Array}  words      - Word array from the line
 * @param {Object} tajweedMap - Map of surahNum → tajweedData
 * @returns {Array} Aligned rules with start/end referring to fullText indices
 */
function _collectAlignedRules(words, tajweedMap) {
   const aligned = [];
   let lineOffset = 0; // Current character position in the full line text

   for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wordText = w.word || w.text || '';

      // Add space separator offset (except for first word)
      if (i > 0) lineOffset += 1;

      if (!w.location) {
         lineOffset += wordText.length;
         continue;
      }

      const parts = w.location.split(':');
      const surahNum = parseInt(parts[0], 10);
      const verseNum = parseInt(parts[1], 10);
      const wordIdx = parseInt(parts[2], 10);

      const verseKey = `verse_${verseNum}`;
      const cacheKey = `${surahNum}:${verseNum}`;

      // Get bundled tajweed data for this surah
      const bundle = tajweedMap[surahNum];
      if (!bundle || !bundle.rules || !bundle.text || !bundle.text.verse) {
         lineOffset += wordText.length;
         continue;
      }

      const verseRules = getVerseRules(bundle.rules, verseKey);
      if (!verseRules || verseRules.length === 0) {
         lineOffset += wordText.length;
         continue;
      }

      // Compute absolute offset for this word index on-demand
      if (!_verseOffsetsCache[cacheKey]) {
         const verseText = bundle.text.verse[verseKey] || '';
         // Remove invisible marking chars (e.g. BOM, LRM, RLM) that shift the string length 
         // without affecting rendered tajweed mapping
         const cleanText = verseText.replace(/^[\uFEFF\u200B-\u200D\u200E\u200F]+/, '');

         const vWords = cleanText.split(' ');
         const offsets = [];
         let currentOff = 0;

         // quran.com 'location' skips isolated waqf and structural marks. We must skip them in the array 
         // so that offsets[wordIdx - 1] perfectly aligns with the real base text.
         const ISOLATED_MARKERS = /^[\u06D6-\u06DC\u06DF\u06DE\u06E9\u06DD]+$/;
         for (const vw of vWords) {
            if (!ISOLATED_MARKERS.test(vw)) {
               offsets.push(currentOff);
            }
            currentOff += vw.length + 1; // +1 for the space
         }
         _verseOffsetsCache[cacheKey] = offsets;
      }

      const offsets = _verseOffsetsCache[cacheKey];
      // wordIdx is 1-based. Fallback to 0 if out of bounds
      const verseOffset = offsets[wordIdx - 1] || 0;

      // Align rules for this specific word
      const wordAligned = alignRulesToMushafText(
         wordText, verseRules, verseOffset, lineOffset
      );

      for (const r of wordAligned) aligned.push(r);

      lineOffset += wordText.length;
   }

   return aligned;
}
