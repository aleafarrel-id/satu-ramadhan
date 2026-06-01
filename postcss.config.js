/**
 * PostCSS Configuration
 *
 * cssnano is applied ONLY in production builds to optimize CSS output.
 * It performs advanced minification beyond esbuild's basic whitespace removal:
 * - Merges duplicate selectors and declarations
 * - Optimizes shorthand properties
 * - Normalizes color values and gradients
 * - Removes redundant overrides
 * - Optimizes calc() expressions
 */
export default {
    plugins: process.env.NODE_ENV === 'production'
        ? [
                  (await import('cssnano')).default({
                      preset: [
                          'default',
                          {
                              // Discard comments in production
                              discardComments: { removeAll: true },

                              // Normalize whitespace
                              normalizeWhitespace: true,

                              // Merge longhand into shorthand (margin, padding, border, etc.)
                              mergeLonghand: true,

                              // Merge identical rules that appear in different places
                              mergeRules: true,

                              // Minify font-weight values (normal→400, bold→700)
                              minifyFontValues: true,

                              // Minify color values (#ffffff → #fff, rgba → hex)
                              colormin: true,

                              // Reduce calc() expressions where possible
                              calc: true,

                              // Normalize unicode-range descriptors
                              normalizeUnicode: true,

                              // Discard rules with empty bodies
                              discardEmpty: true,

                              // Discard duplicate rules
                              discardDuplicates: true,

                              // Sort and merge identical media queries
                              // DISABLED: Reordering media queries can break cascade specificity
                              // in a vanilla CSS architecture with component-scoped styles.
                              cssDeclarationSorter: false,

                              // DISABLED: z-index rebasing is dangerous — our app uses
                              // specific z-index values (z-modal, z-nav, etc.) via CSS vars.
                              zindex: false,

                              // DISABLED: Reducing initial/inherit can break cross-browser compat
                              // on older Android WebViews (target: es2018 / Capacitor).
                              reduceInitial: false,
                          },
                      ],
                  }),
              ]
        : [],
};
