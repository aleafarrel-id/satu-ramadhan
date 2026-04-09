/**
 * Quran Tajweed Module
 */

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
   madd_iwad: {
      cssClass: 'tj-madd',
      label: 'Mad \'Iwad (2 harakat)'
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

/**
 * Waqf (stop) marks found in Uthmani Quran text.
 * Each mark has a type that determines how contextual rules apply:
 *   'mandatory'  → Reader MUST stop. Idgham/Ikhfa across this are cancelled.
 *   'optional'   → Reader MAY stop. Rules shown faded (tj-optional).
 *   'forbidden'  → Reader should NOT stop. No contextual changes.
 */
const WAQF_MARKS = {
   0x06D6: 'optional',   // Salla / صلى (preferred continuation)
   0x06D7: 'optional',   // Qala / قلى (preferred stop)
   0x06D8: 'optional',   // Meem / جيم (permissible stop)
   0x06D9: 'forbidden',  // Laa / لا  (do not stop)
   0x06DA: 'optional',   // Jeem / ج  (permissible stop)
   0x06DB: 'mandatory',  // Waqf Mim / م (mandatory stop)
   0x06DC: 'optional',   // Siin / ﺱ  (saktah / brief pause)
};

/**
 * Checks if a code point is a Waqf mark and returns its type.
 * @param {number} code
 * @returns {'mandatory'|'optional'|'forbidden'|null}
 */
function _getWaqfType(code) {
   return WAQF_MARKS[code] || null;
}

/**
 * Scans the text and returns an array of { index, type } for every Waqf mark.
 * @param {string} text
 * @returns {Array<{index: number, type: string}>}
 */
function _findWaqfPositions(text) {
   const positions = [];
   for (let i = 0; i < text.length; i++) {
      const type = _getWaqfType(text.charCodeAt(i));
      if (type) positions.push({ index: i, type });
   }
   return positions;
}

const QALQALAH_LETTERS = new Set([
   0x0642, // Qaf  ق
   0x0637, // Taa  ط
   0x0628, // Baa  ب
   0x062C, // Jim  ج
   0x062F  // Dal  د
]);

/**
 * Arabic harakat (short vowels & diacritics) excluding sukun.
 */
function _isHaraka(code) {
   return (
      (code >= 0x064B && code <= 0x0650) || // Fathatan..Kasra
      (code === 0x0670) ||                   // Superscript alef
      (code >= 0x0610 && code <= 0x061A)     // Sign marks
   );
}

/**
 * Checks if a code point is a combining mark (harakat, waqf marks, etc.)
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

/**
 * Checks if a code point is an Arabic base letter (not a mark, space, or digit).
 */
function _isArabicBaseLetter(code) {
   return (
      (code >= 0x0621 && code <= 0x063A) || // Core Arabic letters
      (code >= 0x0641 && code <= 0x064A) || // Faa..Yaa
      (code >= 0x0671 && code <= 0x06D3) || // Extended Arabic letters
      (code === 0x0640)                      // Tatweel
   );
}

/**
 * Given a position in text, walk backwards skipping combining marks
 * to find the last base letter before a Waqf mark.
 * @returns {number} index of the base letter, or -1
 */
function _findLastBaseLetterBefore(text, pos) {
   let i = pos - 1;
   while (i >= 0) {
      const code = text.charCodeAt(i);
      if (_isArabicBaseLetter(code)) return i;
      if (code === 0x0020) return -1; // Hit a space — no letter in this word segment
      i--;
   }
   return -1;
}

/**
 * Checks if there is a space (word boundary) between two positions in the text,
 * skipping over combining marks.
 */
function _hasWordBoundaryBetween(text, startIdx, endIdx) {
   for (let i = startIdx; i < endIdx; i++) {
      if (text.charCodeAt(i) === 0x0020) return true;
   }
   return false;
}

/**
 * Applies context-aware corrections to static tajweed rules based on
 * the presence of Waqf (stop) marks in the Arabic text.
 *
 * Three corrections are applied:
 *
 * 1. Idgham/Ikhfa/Iqlab Fading:
 *    If a cross-word rule (Idgham, Ikhfa, Iqlab) spans across a Waqf mark
 *    (non-forbidden), it is flagged as `isOptional` (rendered faded) because
 *    the rule only applies if the reader continues (Wasl).
 *
 * 2. Mad Upgrade:
 *    If a madd_2 (Mad Thabi'i) ends near a Waqf mark (the letter before the
 *    waqf is at or near the end of the mad), a new madd_246 rule is injected
 *    with `isOptional` flag — because it only applies if the reader stops.
 *
 * 3. Qalqalah Injection:
 *    If the last base letter before a Waqf mark is a Qalqalah letter and has
 *    no existing qalqalah rule, a new qalqalah rule is injected with
 *    `isOptional` flag — because Qalqalah only activates when stopping.
 *
 * @param {string} text  - The Arabic verse text
 * @param {Array}  rules - Array of {start, end, rule} — will be cloned, not mutated
 * @returns {Array} New rules array with corrections applied
 */
function _applyContextualRules(text, rules) {
   if (!text || !rules || rules.length === 0) return rules;

   const waqfPositions = _findWaqfPositions(text);
   if (waqfPositions.length === 0) return rules;

   // Deep clone rules so we don't mutate the cached JSON data
   const result = rules.map(r => ({ ...r }));
   const newRules = []; // Additional rules to inject

   // Cross-word rule types that should be faded at Waqf boundaries
   const CROSS_WORD_RULES = new Set([
      'idghaam_ghunnah', 'idghaam_no_ghunnah', 'idghaam_mutajanisayn',
      'idghaam_mutaqaribayn', 'idghaam_shafawi',
      'ikhfa', 'ikhfa_shafawi', 'iqlab'
   ]);

   for (const waqf of waqfPositions) {
      if (waqf.type === 'forbidden') continue; // Waqf Laa — skip entirely

      const isMandatory = waqf.type === 'mandatory';

      // ── 1. Fade/Cancel cross-word rules that span across this Waqf ──
      for (const rule of result) {
         if (!CROSS_WORD_RULES.has(rule.rule)) continue;
         if (rule._removed) continue;

         // Check if the rule's range contains the Waqf position
         // AND there's a word boundary (space) within the rule range
         if (rule.start < waqf.index && rule.end > waqf.index) {
            // The rule literally spans across the waqf mark
            if (isMandatory) {
               rule._removed = true; // Completely remove for mandatory stop
            } else {
               rule.isOptional = true;
               rule._optionalReason = 'wasl'; // Only applies if Wasl (continuing)
            }
            continue;
         }

         // Also check: rule ends before waqf, but rule crosses a word boundary
         // (the typical case: Nun sakina at end of word1, target letter at start of word2,
         //  and waqf mark sits between or right after word1)
         if (rule.start < waqf.index && rule.end <= waqf.index) {
            // Rule is entirely before waqf — check if word boundary is within rule
            if (_hasWordBoundaryBetween(text, rule.start, rule.end)) {
               // This is a cross-word rule. Is the waqf mark close to the word boundary?
               // Find the space position within the rule
               let spaceIdx = -1;
               for (let s = rule.start; s < rule.end; s++) {
                  if (text.charCodeAt(s) === 0x0020) { spaceIdx = s; break; }
               }
               if (spaceIdx !== -1) {
                  // Check if waqf is between the space and a few chars after
                  // (waqf marks are combining marks attached to the preceding word)
                  const waqfNearSpace = (waqf.index > spaceIdx - 5 && waqf.index < rule.end + 5);
                  if (waqfNearSpace) {
                     if (isMandatory) {
                        rule._removed = true;
                     } else {
                        rule.isOptional = true;
                        rule._optionalReason = 'wasl';
                     }
                  }
               }
            }
         }
      }

      // ── 2. Mad Upgrade: madd_2 near waqf → madd_246 ──
      const lastLetterIdx = _findLastBaseLetterBefore(text, waqf.index);
      if (lastLetterIdx >= 0) {
         // Check if there's a madd_2 rule covering or near this letter
         for (const rule of result) {
            if (rule.rule !== 'madd_2' || rule._removed) continue;

            // The mad rule should end near the waqf position
            // (the mad letter/harakat is the last thing before the waqf mark)
            if (rule.end >= lastLetterIdx && rule.start <= lastLetterIdx + 1) {
               // Inject a madd_246 as optional (only if stopping)
               newRules.push({
                  start: rule.start,
                  end: rule.end,
                  rule: 'madd_246',
                  isOptional: true,
                  _optionalReason: 'waqf', // Only applies if Waqf (stopping)
                  _replaces: rule // Reference to the original madd_2
               });

               // The original madd_2 becomes optional too (only applies if Wasl)
               if (isMandatory) {
                  rule._removed = true;
               } else {
                  rule.isOptional = true;
                  rule._optionalReason = 'wasl';
               }
               break; // Only one mad upgrade per waqf position
            }
         }
      }

      // ── 3. Qalqalah Injection at Waqf ──
      if (lastLetterIdx >= 0 && QALQALAH_LETTERS.has(text.charCodeAt(lastLetterIdx))) {
         // Check if there's already a qalqalah rule at this position
         const hasQalqalah = result.some(
            r => r.rule === 'qalqalah' && !r._removed &&
               r.start <= lastLetterIdx && r.end > lastLetterIdx
         );
         if (!hasQalqalah) {
            // Also check newRules to avoid duplicate injection
            const alreadyInjected = newRules.some(
               r => r.rule === 'qalqalah' && r.start <= lastLetterIdx && r.end > lastLetterIdx
            );
            if (!alreadyInjected) {
               // Find the end: include the base letter + its trailing combining marks
               let qEnd = lastLetterIdx + 1;
               while (qEnd < text.length && _isCombiningMark(text.charCodeAt(qEnd))) qEnd++;

               newRules.push({
                  start: lastLetterIdx,
                  end: qEnd,
                  rule: 'qalqalah',
                  isOptional: true,
                  _optionalReason: 'waqf'
               });
            }
         }
      }
   }

   // Filter out removed rules and merge in new rules
   const finalRules = result.filter(r => !r._removed);
   finalRules.push(...newRules);

   // Clean internal flags
   for (const r of finalRules) {
      delete r._removed;
      delete r._replaces;
   }

   return finalRules;
}

/**
 * Builds parallel slot arrays mapping each character index to a rule key
 * (or null) and whether it's optional.
 * Applies rules (first-write wins), then propagates rules to trailing
 * combining marks to keep glyph shaping intact.
 *
 * @param {string} text  - The Arabic text
 * @param {Array}  rules - Array of {start, end, rule, isOptional?}
 * @returns {{slots: Array<string|null>, optSlots: Array<boolean>}}
 */
function _buildSlots(text, rules) {
   const len = text.length;
   const slots = new Array(len).fill(null);
   const optSlots = new Array(len).fill(false);

   // Apply rules — first-write wins
   for (let i = 0; i < rules.length; i++) {
      const safeStart = Math.max(0, rules[i].start);
      const safeEnd = Math.min(len, rules[i].end);
      if (safeStart >= safeEnd) continue;

      for (let j = safeStart; j < safeEnd; j++) {
         if (slots[j] === null) {
            slots[j] = rules[i].rule;
            optSlots[j] = !!rules[i].isOptional;
         }
      }
   }

   // Propagate base-letter rules to trailing combining marks
   for (let i = 0; i < len; i++) {
      if (slots[i] !== null && !_isCombiningMark(text.charCodeAt(i))) {
         let j = i + 1;
         while (j < len && _isCombiningMark(text.charCodeAt(j))) {
            if (slots[j] === null) {
               slots[j] = slots[i];
               optSlots[j] = optSlots[i];
            }
            j++;
         }
      }
   }


   return { slots, optSlots };
}

function _escHtml(str) {
   return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

/**
 * Iterates over the slot arrays, grouping consecutive chars with the same
 * rule+optional status and absorbing trailing combining marks at run boundaries.
 * Calls `onPlain(text)` or `onRule(text, ruleKey, isOptional, optionalReason)` for each run.
 *
 * @param {string}   text
 * @param {Array}    slots
 * @param {Array}    optSlots
 * @param {Function} onPlain - (runText: string) => void
 * @param {Function} onRule  - (runText: string, ruleKey: string, isOptional: boolean) => void
 */
function _iterateRuns(text, slots, optSlots, onPlain, onRule) {
   const len = text.length;
   let runStart = 0;

   while (runStart < len) {
      const currentRule = slots[runStart];
      const currentOpt = optSlots[runStart];
      let runEnd = runStart + 1;

      while (runEnd < len && slots[runEnd] === currentRule && optSlots[runEnd] === currentOpt) runEnd++;

      // Absorb trailing combining marks into this run
      while (runEnd < len && _isCombiningMark(text.charCodeAt(runEnd))) runEnd++;

      const runText = text.slice(runStart, runEnd);

      if (currentRule === null) {
         onPlain(runText);
      } else {
         onRule(runText, currentRule, currentOpt);
      }

      runStart = runEnd;
   }
}

/**
 * Builds the tooltip label, appending context info for optional rules.
 */
function _buildLabel(ruleKey, ruleInfo, isOptional) {
   let label = ruleInfo ? ruleInfo.label : ruleKey;
   if (!isOptional) return label;

   // Determine direction: does this rule apply when stopping or continuing?
   // Rules originally in the JSON (Idgham, Ikhfa) are "if Wasl" (continuing).
   // Injected rules (Qalqalah, Mad upgrades) are "if Waqf" (stopping).
   // We use the _optionalReason from the rule, but since we lose that at the
   // slot level, we infer from the rule type:
   const WASL_RULES = new Set([
      'idghaam_ghunnah', 'idghaam_no_ghunnah', 'idghaam_mutajanisayn',
      'idghaam_mutaqaribayn', 'idghaam_shafawi',
      'ikhfa', 'ikhfa_shafawi', 'iqlab', 'madd_2'
   ]);

   if (WASL_RULES.has(ruleKey)) {
      label += ' (Wasl)';
   } else {
      label += ' (Waqf)';
   }
   return label;
}

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

   // Apply contextual waqf corrections
   const correctedRules = _applyContextualRules(arabicText, verseRules);
   const { slots, optSlots } = _buildSlots(arabicText, correctedRules);

   _iterateRuns(arabicText, slots, optSlots,
      (runText) => {
         fragment.appendChild(document.createTextNode(runText));
      },
      (runText, ruleKey, isOptional) => {
         const ruleInfo = TAJWEED_RULES[ruleKey];
         const span = document.createElement('span');
         let className = `tj ${ruleInfo ? ruleInfo.cssClass : 'tj-unknown'}`;
         if (isOptional) className += ' tj-optional';
         span.className = className;
         span.setAttribute('data-rule', ruleKey);
         span.setAttribute('data-label', _buildLabel(ruleKey, ruleInfo, isOptional));
         span.textContent = runText;
         fragment.appendChild(span);
      }
   );

   return fragment;
}

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

   // Apply contextual waqf corrections
   const correctedRules = _applyContextualRules(arabicText, rules);
   const { slots, optSlots } = _buildSlots(arabicText, correctedRules);
   let html = '';

   _iterateRuns(arabicText, slots, optSlots,
      (runText) => {
         html += _escHtml(runText);
      },
      (runText, ruleKey, isOptional) => {
         const ruleInfo = TAJWEED_RULES[ruleKey];
         const cssClass = ruleInfo ? ruleInfo.cssClass : 'tj-unknown';
         const optClass = isOptional ? ' tj-optional' : '';
         const label = _buildLabel(ruleKey, ruleInfo, isOptional);
         html += `<span class="tj ${cssClass}${optClass}" data-rule="${ruleKey}" data-label="${_escHtml(label)}">${_escHtml(runText)}</span>`;
      }
   );

   return html;
}

/**
 * Characters that exist in Mushaf (Ottoman) text but not in the regular
 * Surah text used to calibrate tajweed offsets.
 * - U+0640 Tatweel / Kashida (used for line justification)
 * - U+06E7 Small high Yaa (Uthmani-only diacritic, 38 occurrences)
 * - U+200F Right-to-Left Mark (invisible directional control char)
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
 * exist in the regular surah text word tokens.
 * @param {number} code
 * @returns {boolean}
 */
function _isMushafExtra(code) {
   return (
      code === TATWEEL ||        // Kashida
      code === 0x0020 ||         // Space (used to separate markers inside a mushaf word object)
      _isVerseEndDigit(code) ||  // Verse-end digits ٠-٩
      code === 0x06DE ||         // Rub El Hizb ۞ (Juz/Hizb marker)
      code === 0x06E9 ||         // Place of Sajdah ۩
      code === 0x06DD ||         // End of Ayah ۝
      code === 0x06E7 ||         // Small high Yaa (Uthmani-only)
      code === 0x200F            // Right-to-Left Mark
   );
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

      const alignedRule = { start: realStart, end: realEnd, rule: rule.rule };
      // Preserve isOptional flag through alignment
      if (rule.isOptional) alignedRule.isOptional = true;
      aligned.push(alignedRule);
   }

   return aligned;
}

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
