import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // For Capacitor to load assets via relative paths.
    base: './',

    // Strip console outputs in production (except errors).
    esbuild: {
        pure: ['console.log', 'console.warn', 'console.info', 'console.debug'],
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

                    // All other vendor libraries → single vendor chunk
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
