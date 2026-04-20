import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // For Capacitor to load assets via relative paths.
    base: './',

    // Strip ALL console outputs and debugger statements in production builds.
    // This prevents information leakage (stack traces, internal paths, API details)
    // via Logcat / browser console on production APKs.
    esbuild: {
        drop: ['console', 'debugger'],
    },

    // CSS processing: cssnano (via postcss.config.js) handles structural
    // optimizations in production (merge rules, optimize shorthands, reduce
    // duplicates). esbuild then handles final whitespace minification.
    css: {
        devSourcemap: true,
    },

    build: {
        // Matches 'webDir' in capacitor.config.json.
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        target: 'es2018',
        minify: 'esbuild',
        rollupOptions: {
            input: {
                main: resolve(process.cwd(), 'index.html'),
                shareSchedule: resolve(process.cwd(), 'src/templates/share-schedule/share-schedule.html'),
            },

            output: {
                manualChunks(id) {
                    // Quran-specific application code → isolated heavy chunk
                    if (id.includes('quran') && !id.includes('node_modules')) return 'quran-core';

                    // Capacitor SDK → isolated native bridge chunk
                    if (id.includes('node_modules/@capacitor')) return 'capacitor';

                    // Mushaf-only vendor libs → lazy-loaded with mushaf
                    if (id.includes('node_modules/page-flip') || id.includes('node_modules/panzoom')) return 'mushaf-vendor';

                    // Leaflet → only used on Compass page & Home list-view (both lazy-loaded)
                    if (id.includes('node_modules/leaflet')) return 'vendor-leaflet';

                    // html-to-image → only used in the Share Schedule flow (lazy-loaded)
                    if (id.includes('node_modules/html-to-image')) return 'vendor-share';

                    // geomagnetism → only used on Compass page (lazy-loaded)
                    if (id.includes('node_modules/geomagnetism')) return 'vendor-compass';

                    // All other vendor libraries (i18next, adhan, etc.) → startup vendor chunk
                    if (id.includes('node_modules')) return 'vendor';
                }
            }
        }
    },

    server: {
        // Listen on all network interfaces for local device testing.
        host: true,
        port: 5173,
    },
});
