import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // base: './' sangat penting untuk Capacitor agar file index.html 
    // bisa menemukan file JS/CSS menggunakan relative path.
    base: './',

    build: {
        // outDir harus sama dengan 'webDir' di capacitor.config.json
        outDir: 'dist',
        // Membersihkan folder dist sebelum build baru
        emptyOutDir: true,
        // Memastikan sourcemap tersedia untuk debugging di device jika diperlukan
        sourcemap: true,
        rollupOptions: {
            input: {
                main: resolve(process.cwd(), 'index.html'),
                shareSchedule: resolve(process.cwd(), 'src/templates/share-schedule/share-schedule.html'),
            }
        }
    },

    server: {
        // Membuka akses server ke network agar bisa di-test langsung dari HP
        // yang terhubung ke Wi-Fi yang sama.
        host: true,
        port: 5173,
    },
});
