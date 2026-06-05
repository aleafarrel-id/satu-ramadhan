/**
 * Quran Font Configuration
 *
 * Centralized registry of available Arabic font choices for the Quran reader.
 * To add a new font, add an entry to the QURAN_FONTS array below and declare
 * the matching @font-face in typography.css.
 *
 * The `id` field is persisted to the store and applied as `data-quran-font`
 * on <html> — CSS variables in variables.css react to this attribute.
 */

export const QURAN_FONTS = [
   {
      id: 'lpmq',
      label: 'LPMQ',
      descKey: 'font_lpmq_desc',
      sampleText: 'بِسْمِ اللّٰهِ',
   },
   {
      id: 'indopak',
      label: 'IndoPak',
      descKey: 'font_indopak_desc',
      sampleText: 'بِسْمِ اللّٰهِ',
   },
];

/** Default font ID if no preference is stored. */
export const DEFAULT_QURAN_FONT = 'lpmq';
