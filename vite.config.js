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
                    if (id.includes('quran')) return 'quran';

                    if (id.includes('node_modules')) {
                        if (id.includes('@capacitor')) return 'capacitor';
                        return 'vendor';
                    }
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
