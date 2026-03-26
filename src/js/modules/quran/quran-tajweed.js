/**
 * Tajweed Module
 * Handles data fetching, caching, and colored markup building for both
 * DOM-based (regular reader) and string-based (mushaf) rendering paths.
 */

/* ─── Rule Definitions ─── */

/**
 * Maps rule keys to CSS classes and labels.
 */
const TAJWEED_RULES = {
   ghunnah: {
      cssClass: 'tj-ghunnah',
      label: 'Ghunnah'
   },
   idghaam_ghunnah: {
      cssClass: 'tj-idgham',
      label: 'Idgham Bighunnah'
   },
   idghaam_no_ghunnah: {
      cssClass: 'tj-idgham',
      label: 'Idgham Bilaghunnah'
   },
   idghaam_mutajanisayn: {
      cssClass: 'tj-idgham',
      label: 'Idgham Mutajanisayn'
   },
   idghaam_mutaqaribayn: {
      cssClass: 'tj-idgham',
      label: 'Idgham Mutaqaribayn'
   },
   idghaam_shafawi: {
      cssClass: 'tj-idgham',
      label: 'Idgham Syafawi'
   },
   ikhfa: {
      cssClass: 'tj-ikhfa',
      label: 'Ikhfa\' Haqiqi'
   },
   ikhfa_shafawi: {
      cssClass: 'tj-ikhfa',
      label: 'Ikhfa\' Syafawi'
   },
   iqlab: {
      cssClass: 'tj-iqlab',
      label: 'Iqlab'
   },
   qalqalah: {
      cssClass: 'tj-qalqalah',
      label: 'Qalqalah'
   },
   madd_2: {
      cssClass: 'tj-madd',
      label: 'Mad Thabi\'i (2 harakat)'
   },
   madd_246: {
      cssClass: 'tj-madd',
      label: 'Mad \'Aridh Lissukun'
   },
   madd_6: {
      cssClass: 'tj-madd',
      label: 'Mad Lazim (6 harakat)'
   },
   madd_muttasil: {
      cssClass: 'tj-madd',
      label: 'Mad Wajib Muttashil'
   },
   madd_munfasil: {
      cssClass: 'tj-madd',
      label: 'Mad Jaiz Munfashil'
   },
   madd_silah_qashirah: {
      cssClass: 'tj-madd-silah-qashirah',
      label: 'Mad Silah Qashirah'
   },
   madd_silah_thawilah: {
      cssClass: 'tj-madd-silah-thawilah',
      label: 'Mad Silah Thawilah'
   },
   lam_shamsiyyah: {
      cssClass: 'tj-lam-shams',
      label: 'Lam Syamsiyyah'
   },
   hamzat_wasl: {
      cssClass: 'tj-hamza-wasl',
      label: 'Hamzah Washal'
   },
   silent: {
      cssClass: 'tj-silent',
      label: 'Huruf Tidak Dibaca'
   }
};

/* ─── Combining Mark Detection ─── */

/**
 * Checks if a code point is a combining mark.
 * @param {number} code
 * @returns {boolean}
 */
function _isCombiningMark(code) {
   return (
      (code >= 0x0610 && code <= 0x061A) || // Arabic sign marks
      (code >= 0x064B && code <= 0x065F) || // Arabic combining marks (harakat)
      (code === 0x0670) || // Superscript alef
      (code >= 0x06D6 && code <= 0x06ED) || // Arabic small marks (waqf, etc.)
      (code >= 0x08D3 && code <= 0x08FF) || // Arabic extended-A combining marks
      (code >= 0x0300 && code <= 0x036F) || // General combining diacritical marks
      (code >= 0xFE20 && code <= 0xFE2F) || // Combining half marks
      (code >= 0x0816 && code <= 0x082D)    // Samaritan marks
   );
}

/* ─── Shared Slot Builder ─── */

/**
 * Builds the slot array mapping each character index to a rule key or null.
 * Applies rules (first-write wins), then propagates rules to trailing
 * combining marks to keep glyph shaping intact.
 *
 * @param {string} text - The Arabic text
 * @param {Array}  rules - Array of {start, end, rule}
 * @returns {Array<string|null>} Slot array
 */
function _buildSlots(text, rules) {
   const len = text.length;
   const slots = new Array(len).fill(null);

   // Apply rules — first-write wins
   for (let i = 0; i < rules.length; i++) {
      const safeStart = Math.max(0, rules[i].start);
      const safeEnd = Math.min(len, rules[i].end);
      if (safeStart >= safeEnd) continue;

      for (let j = safeStart; j < safeEnd; j++) {
         if (slots[j] === null) slots[j] = rules[i].rule;
      }
   }

   // Propagate base-letter rules to trailing combining marks
   for (let i = 0; i < len; i++) {
      if (slots[i] !== null && !_isCombiningMark(text.charCodeAt(i))) {
         let j = i + 1;
         while (j < len && _isCombiningMark(text.charCodeAt(j))) {
            if (slots[j] === null) slots[j] = slots[i];
            j++;
         }
      }
   }

   return slots;
}

/* ─── HTML Escape (for string-based output) ─── */

function _escHtml(str) {
   return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

/* ─── Run Iterator (shared by both output modes) ─── */

/**
 * Iterates over the slot array, grouping consecutive chars with the same
 * rule and absorbing trailing combining marks at run boundaries.
 * Calls `onPlain(text)` or `onRule(text, ruleKey)` for each run.
 *
 * @param {string}   text
 * @param {Array}    slots
 * @param {Function} onPlain - (runText: string) => void
 * @param {Function} onRule  - (runText: string, ruleKey: string) => void
 */
function _iterateRuns(text, slots, onPlain, onRule) {
   const len = text.length;
   let runStart = 0;

   while (runStart < len) {
      const currentRule = slots[runStart];
      let runEnd = runStart + 1;

      while (runEnd < len && slots[runEnd] === currentRule) runEnd++;

      // Absorb trailing combining marks into this run
      while (runEnd < len && _isCombiningMark(text.charCodeAt(runEnd))) runEnd++;

      const runText = text.slice(runStart, runEnd);

      if (currentRule === null) {
         onPlain(runText);
      } else {
         onRule(runText, currentRule);
      }

      runStart = runEnd;
   }
}

/* ─── DOM-based Output (for Regular Reader) ─── */

/**
 * Builds a DocumentFragment with colored tajweed spans.
 * @param {string} arabicText
 * @param {Array}  verseRules
 * @returns {DocumentFragment}
 */
export function buildTajweedFragment(arabicText, verseRules) {
   const fragment = document.createDocumentFragment();

   if (!arabicText || !verseRules || verseRules.length === 0) {
      fragment.appendChild(document.createTextNode(arabicText || ''));
      return fragment;
   }

   const slots = _buildSlots(arabicText, verseRules);

   _iterateRuns(arabicText, slots,
      (runText) => {
         fragment.appendChild(document.createTextNode(runText));
      },
      (runText, ruleKey) => {
         const ruleInfo = TAJWEED_RULES[ruleKey];
         const span = document.createElement('span');
         span.className = `tj ${ruleInfo ? ruleInfo.cssClass : 'tj-unknown'}`;
         span.setAttribute('data-rule', ruleKey);
         span.setAttribute('data-label', ruleInfo ? ruleInfo.label : ruleKey);
         span.textContent = runText;
         fragment.appendChild(span);
      }
   );

   return fragment;
}

/* ─── String-based Output (for Mushaf) ─── */

/**
 * Builds an HTML string with colored tajweed spans.
 * Functionally identical to buildTajweedFragment but outputs a string
 * suitable for innerHTML/string concatenation in the Mushaf pipeline.
 *
 * @param {string} arabicText
 * @param {Array}  rules - Array of {start, end, rule}
 * @returns {string} HTML string
 */
export function buildTajweedHTML(arabicText, rules) {
   if (!arabicText || !rules || rules.length === 0) {
      return _escHtml(arabicText || '');
   }

   const slots = _buildSlots(arabicText, rules);
   let html = '';

   _iterateRuns(arabicText, slots,
      (runText) => {
         html += _escHtml(runText);
      },
      (runText, ruleKey) => {
         const ruleInfo = TAJWEED_RULES[ruleKey];
         const cssClass = ruleInfo ? ruleInfo.cssClass : 'tj-unknown';
         const label = ruleInfo ? ruleInfo.label : ruleKey;
         html += `<span class="tj ${cssClass}" data-rule="${ruleKey}" data-label="${_escHtml(label)}">${_escHtml(runText)}</span>`;
      }
   );

   return html;
}

/* ─── Mushaf Offset Alignment ─── */

/**
 * Characters that exist in Mushaf (Ottoman) text but not in the regular
 * Surah text used to calibrate tajweed offsets.
 * - U+0640 Tatweel / Kashida (used for line justification)
 */
const TATWEEL = 0x0640;

/**
 * Arabic-Indic digits used as inline verse-end markers in Mushaf text.
 * These are NOT present in the regular surah text.
 */
function _isVerseEndDigit(code) {
   return code >= 0x0660 && code <= 0x0669;
}

/**
 * Checks if a character is an "extra" Mushaf-only character that does not
 * exist in the regular surah text.
 * @param {number} code
 * @returns {boolean}
 */
function _isMushafExtra(code) {
   return code === TATWEEL || _isVerseEndDigit(code);
}

/**
 * Aligns tajweed rules (calibrated for regular surah text) to the Mushaf
 * text of a single word. The Mushaf text may contain Tatweel (U+0640) and
 * verse-end digits that shift character indices.
 *
 * Algorithm:
 * 1. Build a mapping: for each char in the Mushaf word, if it's NOT an
 *    extra char, record its original index. This gives us a "virtual index"
 *    to "real index" mapping.
 * 2. Walk the tajweed rules for this word and translate start/end offsets
 *    from virtual (surah) space to real (mushaf) space.
 *
 * @param {string} mushafWord  - The word as it appears in the Mushaf page JSON
 * @param {Array}  rules       - Tajweed rules with offsets relative to regular surah verse text
 * @param {number} verseOffset - Char offset of this word's start within the full verse text
 * @param {number} lineOffset  - Char offset of this word's start within the full line text
 * @returns {Array} New rules with start/end mapped to line-text indices
 */
export function alignRulesToMushafText(mushafWord, rules, verseOffset, lineOffset) {
   if (!rules || rules.length === 0) return [];

   // Build virtual-to-real index map for this word
   // virtualIdx[i] = the real (mushaf string) index of the i-th non-extra char
   const virtualIdx = [];
   for (let i = 0; i < mushafWord.length; i++) {
      if (!_isMushafExtra(mushafWord.charCodeAt(i))) {
         virtualIdx.push(i);
      }
   }

   const wordEndInVerse = verseOffset + virtualIdx.length;
   const aligned = [];

   for (const rule of rules) {
      // Does this rule overlap with this word's virtual range?
      const rStart = rule.start;
      const rEnd = rule.end;

      if (rEnd <= verseOffset || rStart >= wordEndInVerse) continue;

      // Clamp to this word's range
      const clampedStart = Math.max(rStart, verseOffset) - verseOffset;
      const clampedEnd = Math.min(rEnd, wordEndInVerse) - verseOffset;

      if (clampedStart >= clampedEnd || clampedStart >= virtualIdx.length) continue;

      // Map from virtual to real mushaf indices, then shift by lineOffset
      const realStart = lineOffset + virtualIdx[clampedStart];
      const realEnd = lineOffset + (clampedEnd < virtualIdx.length
         ? virtualIdx[clampedEnd]
         : mushafWord.length);

      aligned.push({ start: realStart, end: realEnd, rule: rule.rule });
   }

   return aligned;
}

/* ─── Verse Rule Lookup ─── */

/**
 * Extracts rules for a specific verse.
 * @param {Object|null} tajweedData
 * @param {string} verseKey
 * @returns {Array|null}
 */
export function getVerseRules(tajweedData, verseKey) {
   if (!tajweedData || !tajweedData.verse) return null;

   const rules = tajweedData.verse[verseKey];
   if (!Array.isArray(rules) || rules.length === 0) return null;

   return rules;
}
