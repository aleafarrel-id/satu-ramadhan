/**
 * Al-Quran Tajweed Module
 * Handles tajweed data fetching, caching, and DOM fragment building
 * for colored tajweed markup on Arabic verse text.
 *
 * Architecture:
 *   1. TAJWEED_RULES — single source of truth for rule → CSS class + label
 *   2. fetchTajweedData() — fetches & caches tajweed JSON per surah
 *   3. buildTajweedFragment() — converts Arabic string + rules into colored DOM
 *   4. initTajweedTooltip() — sets up event-delegated tooltip for mobile tap
 */

/* ── Rule Definitions (Single Source of Truth) ── */

/**
 * Maps each tajweed rule key (from JSON data) to its CSS modifier class
 * and human-readable Indonesian label for the tooltip.
 *
 * Color grouping rationale (professional Quran app standard):
 *   - Ghunnah (dengung)           → hijau
 *   - Idgham variants (peleburan) → cyan
 *   - Ikhfa variants (samar)     → oranye
 *   - Iqlab (penukaran)          → ungu
 *   - Qalqalah (pantulan)        → merah
 *   - Madd variants (panjang)    → biru
 *   - Lam Shamsiyyah             → cokelat
 *   - Hamzat Wasl                → abu-abu
 *   - Silent (huruf mati)        → abu terang
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

/* ── In-Memory Cache ── */

/** @type {Map<number, Object|null>} surahIndex → parsed tajweed JSON (or null if failed) */
const _cache = new Map();

/* ── Unicode Combining Mark Detection ── */

/**
 * Check if a character code point is a Unicode combining mark
 * commonly found in Arabic Quranic text (harakat, tajweed signs, etc.).
 *
 * Covered ranges:
 *   U+0610–U+061A  Arabic sign marks (e.g. honorific signs)
 *   U+064B–U+065F  Arabic combining marks (fathah, kasrah, dhammah, shadda, sukun, etc.)
 *   U+0670         Arabic superscript alef
 *   U+06D6–U+06ED  Arabic small marks (waqf signs, sajda, meem, etc.)
 *   U+08D3–U+08FF  Arabic extended-A combining marks
 *   U+0300–U+036F  General combining diacritical marks
 *   U+FE20–U+FE2F  Combining half marks
 *   U+FB50–U+FDFF  Arabic Presentation Forms-A (non-combining, but included
 *                  conservatively to avoid splitting mid-ligature)
 *   U+0816–U+082D  Samaritan marks (rare, but safe to include)
 *
 * @param {number} code — char code (from charCodeAt)
 * @returns {boolean}
 */
function _isCombiningMark(code) {
   return (
      (code >= 0x0610 && code <= 0x061A) || // Arabic sign marks
      (code >= 0x064B && code <= 0x065F) || // Arabic combining marks (harakat)
      (code === 0x0670)                  || // Superscript alef
      (code >= 0x06D6 && code <= 0x06ED) || // Arabic small marks (waqf, etc.)
      (code >= 0x08D3 && code <= 0x08FF) || // Arabic extended-A combining marks
      (code >= 0x0300 && code <= 0x036F) || // General combining diacritical marks
      (code >= 0xFE20 && code <= 0xFE2F) || // Combining half marks
      (code >= 0x0816 && code <= 0x082D)    // Samaritan marks
   );
}

/* ── Public API ── */

/**
 * Fetch tajweed annotation data for a given surah.
 * Results are cached in-memory. Returns null gracefully on failure.
 *
 * @param {number} surahIndex — 1-based surah number
 * @returns {Promise<Object|null>} parsed tajweed JSON or null
 */
export async function fetchTajweedData(surahIndex) {
   if (_cache.has(surahIndex)) {
      return _cache.get(surahIndex);
   }

   try {
      const response = await fetch(`/quran/tajweed/surah_${surahIndex}.json`);
      if (!response.ok) {
         _cache.set(surahIndex, null);
         return null;
      }

      // Handle potential BOM in JSON files
      const text = await response.text();
      const cleanText = text.replace(/^\uFEFF/, '');
      const data = JSON.parse(cleanText);

      _cache.set(surahIndex, data);
      return data;
   } catch (err) {
      console.warn(`[Tajweed] Failed to load tajweed for surah ${surahIndex}:`, err);
      _cache.set(surahIndex, null);
      return null;
   }
}

/**
 * Build a DocumentFragment with tajweed-colored spans from Arabic text and rule annotations.
 *
 * Algorithm (combining-mark-safe O(n) linear scan):
 *   1. Create a slot array the length of the text, each slot initially null.
 *   2. For each rule annotation {start, end, rule}, fill slots [start..end) with the rule key.
 *      First-write wins (no overwrite) — preserves JSON priority ordering.
 *   3. Post-pass: propagate each base letter's rule to its trailing combining marks.
 *      This ensures harakat always inherit the rule of their base letter, preventing
 *      them from being split into a different <span>.
 *   4. Linear scan the slot array, grouping consecutive chars with the same rule.
 *      At each run boundary, absorb any trailing combining marks into the current run
 *      so that grapheme clusters are never broken across DOM nodes.
 *      - null slots → plain text node
 *      - rule slots → <span class="tj tj-{class}" data-rule="..." data-label="...">
 *
 * @param {string} arabicText — the raw Arabic verse string
 * @param {Array<{start: number, end: number, rule: string}>} verseRules — tajweed annotations
 * @returns {DocumentFragment} — ready to append to an element
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
 * Extract tajweed rules for a specific verse from the surah tajweed data.
 *
 * @param {Object|null} tajweedData — full surah tajweed JSON (from fetchTajweedData)
 * @param {string} verseKey — e.g. "verse_1", "verse_2"
 * @returns {Array|null} — array of {start, end, rule} or null
 */
export function getVerseRules(tajweedData, verseKey) {
   if (!tajweedData || !tajweedData.verse) return null;

   const rules = tajweedData.verse[verseKey];
   if (!Array.isArray(rules) || rules.length === 0) return null;

   return rules;
}

/* ── Tooltip Event Delegation (Mobile Tap Support) ── */

/** @type {WeakSet<Element>} tracks containers that already have listeners */
const _attachedContainers = new WeakSet();

/** @type {Element|null} currently active tooltip span */
let _activeTooltipSpan = null;

/**
 * Initialize event-delegated tooltip handling on a scroll container.
 * Safe to call multiple times on the same container — idempotent via WeakSet.
 *
 * On tap/click:
 *   - If target is a .tj span → toggle its .active class (shows tooltip)
 *   - If target is outside .tj → dismiss any active tooltip
 *
 * @param {Element} scrollContainer — the parent scroll element to attach listener on
 */
export function initTajweedTooltip(scrollContainer) {
   if (!scrollContainer || _attachedContainers.has(scrollContainer)) return;
   _attachedContainers.add(scrollContainer);

   scrollContainer.addEventListener('click', (e) => {
      const tjSpan = e.target.closest('.tj');

      if (tjSpan) {
         e.stopPropagation();

         // If same span tapped again, dismiss
         if (_activeTooltipSpan === tjSpan) {
            tjSpan.classList.remove('active');
            _activeTooltipSpan = null;
            return;
         }

         // Dismiss previous
         if (_activeTooltipSpan) {
            _activeTooltipSpan.classList.remove('active');
         }

         // Activate new
         tjSpan.classList.add('active');
         _activeTooltipSpan = tjSpan;
      } else {
         // Clicked outside any .tj span — dismiss
         if (_activeTooltipSpan) {
            _activeTooltipSpan.classList.remove('active');
            _activeTooltipSpan = null;
         }
      }
   });
}

/**
 * Dismiss any currently active tajweed tooltip.
 * Call this when the reader is closed or surah changes.
 */
export function dismissTajweedTooltip() {
   if (_activeTooltipSpan) {
      _activeTooltipSpan.classList.remove('active');
      _activeTooltipSpan = null;
   }
}
