/**
 * Tajweed Module
 * Handles data fetching, caching, and DOM fragment building for colored markup.
 */

/* Rule Definitions */

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

/* Combining Mark Detection */

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


/**
 * Builds a DocumentFragment with colored tajweed spans.
 * @param {string} arabicText
 * @param {Array} verseRules
 * @returns {DocumentFragment}
 */
export function buildTajweedFragment(arabicText, verseRules) {
   const fragment = document.createDocumentFragment();

   if (!arabicText || !verseRules || verseRules.length === 0) {
      fragment.appendChild(document.createTextNode(arabicText || ''));
      return fragment;
   }

   const len = arabicText.length;

   // Step 1: Build slot array — each index maps to a rule key or null
   const slots = new Array(len).fill(null);

   for (let i = 0; i < verseRules.length; i++) {
      const { start, end, rule } = verseRules[i];

      // Validate bounds
      const safeStart = Math.max(0, start);
      const safeEnd = Math.min(len, end);

      if (safeStart >= safeEnd) continue;

      // First-write wins — don't overwrite existing rules
      for (let j = safeStart; j < safeEnd; j++) {
         if (slots[j] === null) {
            slots[j] = rule;
         }
      }
   }

   // Step 2: Combining-mark propagation post-pass
   // If a base letter has a tajweed rule but its trailing combining marks don't,
   // propagate the base letter's rule to those marks. This prevents the scenario
   // where a base letter ends up in a colored <span> but its harakat falls into
   // an adjacent plain text node, breaking the visual connection.
   for (let i = 0; i < len; i++) {
      if (slots[i] !== null && !_isCombiningMark(arabicText.charCodeAt(i))) {
         // This is a base letter with a rule — propagate to trailing combining marks
         let j = i + 1;
         while (j < len && _isCombiningMark(arabicText.charCodeAt(j))) {
            if (slots[j] === null) {
               slots[j] = slots[i];
            }
            j++;
         }
      }
   }

   // Step 3: Linear scan — group consecutive chars with same rule,
   //         absorbing trailing combining marks at run boundaries.
   let runStart = 0;

   while (runStart < len) {
      const currentRule = slots[runStart];
      let runEnd = runStart + 1;

      // Extend run while same rule
      while (runEnd < len && slots[runEnd] === currentRule) {
         runEnd++;
      }

      // Absorb any trailing combining marks into this run.
      // Even after the post-pass, there may be edge cases (e.g. overlapping rules)
      // where a combining mark at the boundary has a different rule. We must keep
      // it with the preceding base letter to preserve correct glyph shaping.
      while (runEnd < len && _isCombiningMark(arabicText.charCodeAt(runEnd))) {
         runEnd++;
      }

      const runText = arabicText.slice(runStart, runEnd);

      if (currentRule === null) {
         // Plain text — no tajweed rule
         fragment.appendChild(document.createTextNode(runText));
      } else {
         // Tajweed span
         const ruleInfo = TAJWEED_RULES[currentRule];

         const span = document.createElement('span');
         span.className = `tj ${ruleInfo ? ruleInfo.cssClass : 'tj-unknown'}`;
         span.setAttribute('data-rule', currentRule);
         span.setAttribute('data-label', ruleInfo ? ruleInfo.label : currentRule);
         span.textContent = runText;

         fragment.appendChild(span);
      }

      runStart = runEnd;
   }

   return fragment;
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

