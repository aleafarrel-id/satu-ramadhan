/**
 * Tajweed Audit Script
 * 
 * Compares tajweed JSON indices against the actual Arabic text
 * to identify index mismatches, shifted indices, and single-char spans
 * for rules that should cover multiple characters.
 * 
 * Usage: node scripts/tajweed-audit.mjs [--surah N]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SURAH_DIR = join(ROOT, 'public', 'quran', 'surah');
const TAJWEED_DIR = join(ROOT, 'public', 'quran', 'tajweed');

// Rules that typically should cover 2+ base characters
const MULTI_CHAR_RULES = new Set([
    'ikhfa', 'ikhfa_shafawi',
    'idghaam_ghunnah', 'idghaam_no_ghunnah',
    'idghaam_mutajanisayn', 'idghaam_mutaqaribayn',
    'idghaam_shafawi',
    'iqlab'
]);

// Combining mark detection (same logic as frontend)
function isCombiningMark(code) {
    return (
        (code >= 0x0610 && code <= 0x061A) ||
        (code >= 0x064B && code <= 0x065F) ||
        (code === 0x0670) ||
        (code >= 0x06D6 && code <= 0x06ED) ||
        (code >= 0x08D3 && code <= 0x08FF) ||
        (code >= 0x0300 && code <= 0x036F) ||
        (code >= 0xFE20 && code <= 0xFE2F) ||
        (code >= 0x0816 && code <= 0x082D)
    );
}

function countBaseChars(text) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        if (!isCombiningMark(text.charCodeAt(i))) count++;
    }
    return count;
}

// Same cleaning as the frontend reader
function cleanArabic(raw) {
    return raw.replace(/^[\uFEFF\u200B]+/, '');
}

function loadJson(path) {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    const clean = raw.replace(/^\uFEFF/, '');
    return JSON.parse(clean);
}

function auditSurah(surahIndex) {
    const surahPath = join(SURAH_DIR, `surah_${surahIndex}.json`);
    const tajPath = join(TAJWEED_DIR, `surah_${surahIndex}.json`);

    const surahData = loadJson(surahPath);
    const tajData = loadJson(tajPath);

    if (!surahData || !tajData) {
        return { surah: surahIndex, errors: [], warnings: [], skipped: true };
    }

    const errors = [];
    const warnings = [];

    const verseObj = surahData.verse || {};
    const tajVerseObj = tajData.verse || {};

    for (const [verseKey, rules] of Object.entries(tajVerseObj)) {
        if (!Array.isArray(rules) || rules.length === 0) continue;

        const rawText = verseObj[verseKey];
        if (!rawText) {
            errors.push({
                verse: verseKey,
                type: 'MISSING_VERSE',
                detail: `Verse "${verseKey}" exists in tajweed but not in surah text`
            });
            continue;
        }

        const text = cleanArabic(rawText);
        const textLen = text.length;

        // Check if BOM was stripped
        if (rawText !== text) {
            const bomLen = rawText.length - text.length;
            warnings.push({
                verse: verseKey,
                type: 'BOM_STRIPPED',
                detail: `Stripped ${bomLen} BOM/zero-width char(s) from start of verse`
            });
        }

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            const { start, end, rule: ruleName } = rule;

            // Bounds check
            if (start < 0 || end > textLen || start >= end) {
                errors.push({
                    verse: verseKey,
                    type: 'OUT_OF_BOUNDS',
                    ruleIndex: i,
                    rule: ruleName,
                    detail: `Rule ${ruleName}[${i}]: start=${start}, end=${end}, textLen=${textLen}`
                });
                continue;
            }

            // Extract the highlighted text
            const highlighted = text.slice(start, end);
            const baseCharCount = countBaseChars(highlighted);

            // Check single-char span for multi-char rules
            if (MULTI_CHAR_RULES.has(ruleName) && baseCharCount < 2) {
                warnings.push({
                    verse: verseKey,
                    type: 'SINGLE_CHAR_MULTICHAR_RULE',
                    ruleIndex: i,
                    rule: ruleName,
                    detail: `Rule ${ruleName}[${i}]: only ${baseCharCount} base char(s) highlighted: "${highlighted}" at [${start},${end})`
                });
            }

            // Validate specific character expectations for certain rules
            if (ruleName === 'hamzat_wasl') {
                // Should highlight alef wasla ٱ (U+0671) 
                const firstBase = getFirstBaseChar(highlighted);
                if (firstBase !== '\u0671' && firstBase !== '\u0627') {
                    errors.push({
                        verse: verseKey,
                        type: 'WRONG_CHAR_HAMZA_WASL',
                        ruleIndex: i,
                        rule: ruleName,
                        detail: `Rule hamzat_wasl[${i}]: expected ٱ or ا but got "${firstBase}" (U+${firstBase?.charCodeAt(0)?.toString(16).toUpperCase()}) at [${start},${end})`
                    });
                }
            }

            if (ruleName === 'lam_shamsiyyah') {
                const firstBase = getFirstBaseChar(highlighted);
                if (firstBase !== '\u0644') { // lam ل
                    errors.push({
                        verse: verseKey,
                        type: 'WRONG_CHAR_LAM_SHAMS',
                        ruleIndex: i,
                        rule: ruleName,
                        detail: `Rule lam_shamsiyyah[${i}]: expected ل but got "${firstBase}" at [${start},${end})`
                    });
                }
            }

            if (ruleName === 'qalqalah') {
                const qalqalahLetters = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
                const bases = getBaseChars(highlighted);
                const hasQalqalah = bases.some(c => qalqalahLetters.has(c));
                if (!hasQalqalah) {
                    errors.push({
                        verse: verseKey,
                        type: 'WRONG_CHAR_QALQALAH',
                        ruleIndex: i,
                        rule: ruleName,
                        detail: `Rule qalqalah[${i}]: no qalqalah letter (ق ط ب ج د) found in "${highlighted}" at [${start},${end})`
                    });
                }
            }
        }
    }

    return { surah: surahIndex, errors, warnings, skipped: false };
}

function getFirstBaseChar(text) {
    for (let i = 0; i < text.length; i++) {
        if (!isCombiningMark(text.charCodeAt(i))) return text[i];
    }
    return null;
}

function getBaseChars(text) {
    const bases = [];
    for (let i = 0; i < text.length; i++) {
        if (!isCombiningMark(text.charCodeAt(i))) bases.push(text[i]);
    }
    return bases;
}

// Main

const args = process.argv.slice(2);
let singleSurah = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--surah' && args[i + 1]) {
        singleSurah = parseInt(args[i + 1], 10);
    }
}

const startIdx = singleSurah || 1;
const endIdx = singleSurah || 114;

let totalErrors = 0;
let totalWarnings = 0;
let totalSkipped = 0;

console.log('=== Tajweed Audit Report ===\n');

for (let s = startIdx; s <= endIdx; s++) {
    const result = auditSurah(s);

    if (result.skipped) {
        totalSkipped++;
        continue;
    }

    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;

    if (result.errors.length > 0 || result.warnings.length > 0) {
        console.log(`--- Surah ${s} ---`);
        for (const e of result.errors) {
            console.log(`  ❌ [${e.type}] ${e.verse}: ${e.detail}`);
        }
        for (const w of result.warnings) {
            console.log(`  ⚠️  [${w.type}] ${w.verse}: ${w.detail}`);
        }
        console.log('');
    }
}

console.log('=== Summary ===');
console.log(`Surahs audited: ${endIdx - startIdx + 1 - totalSkipped}`);
console.log(`Surahs skipped: ${totalSkipped}`);
console.log(`Total errors: ${totalErrors}`);
console.log(`Total warnings: ${totalWarnings}`);

if (totalErrors > 0) {
    process.exit(1);
} else {
    console.log('\n✅ No critical errors found.');
}
