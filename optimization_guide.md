# Capacitor Webview Initial Load Optimization Guide

**PERINGATAN KRITIKAL BAGI AI AGENT:** 
Tujuan dari panduan ini adalah untuk melakukan optimasi performa dan *initial load* (waktu muat awal) secara signifikan pada aplikasi *Satu Ramadhan* di lingkungan Capacitor Native Webview. 
**TIDAK BOLEH ADA PERUBAHAN DESAIN, UI, ATAU FUNGSI APAPUN.** Semua optimasi harus 100% *invisible* di mata pengguna akhir (hanya terasa lebih cepat). Semua pekerjaan harus menerapkan DRY (Don't Repeat Yourself), Clean Code, hierarki yang rapi sesuai eksekusi, dan prinsip *maintainable enterprise-grade*.

---

## 1. Arsitektur & Hierarki Eksekusi
Aplikasi ini berjalan dengan Vite dan Capacitor. Saat ini semuanya masih di-*load* di awal secara bersamaan (statis). Ini menyebabkan *parsing* JS dan CSS memblokir *rendering frames* di perangkat native.
Hierarki yang benar saat eksekusi agar *native webview* tidak lagging:
1. **Critical Path**: Muat hanya *engine core* JS, Konfigurasi Capacitor, plugin esensial, dan halaman *Home* (halaman *default*). **SANGAT PENTING:** Semua file JS dan CSS yang berkaitan dengan **Splash Screen** dan **Skeleton Loading UI** HARUS tetap dimuat secara statis di detik pertama. Ini mutlak diperlukan agar tidak ada efek kosong/berkedip saat UI bertransisi dari *native splash screen* ke *webview*.
2. **Lazy Path**: Semua halaman lain (Schedule, Compass, Quran, Settings) beserta modul, komponen sub-halaman, modal khusus, dan CSS modul mereka *HANYA* dimuat ketika rute tersebut diakses.

## 2. Optimasi Javascript (JS Lazy Loading)
- **File Target**: `src/js/app.js` dan `src/js/router.js`
- **Tindakan di `app.js`**: Hapus semua `import * as ...` statis untuk rute-rute yang tidak aktif di detik pertama (Quran, Schedule, Compass, Settings). Sisakan `homePage` sebagai import statis.
- **Tindakan di `router.js`**: Refactor sistem *Router* murni Vanilla JS ini. Ubah fungsi `.register()` dan `.navigate()` agar mendukung param berupa `handlerFactory` (fungsi yang me-*return* Promise / `import()`). 
    - Saat `.navigate('quran')` dipanggil, router memanggil `await import('./pages/quran-page.js')`.
    - Lakukan *caching* internal di dalam router agar modul yang sudah di-*fetch* tidak dipanggil ulang menggunakan *import()*.

## 3. Optimasi CSS (CSS Code-Splitting)
- **File Target**: `src/css/main.css` dan *Page Modules* (`src/js/pages/*.js`)
- **Tindakan**: Saat ini `main.css` menggunakan `@import` terpusat yang memanggil semua halaman, modal, dan komponen raksasa (termasuk Al-Quran). Hal ini menyebabkan *render-blocking* massal.
- Hapus `@import` untuk komponen non-esensial dari `main.css`. Sisakan *Base*, *Layout*, *UI global*, CSS khusus *Home*, serta **CSS Splash Screen dan Skeleton**. Hal ini krusial untuk mempertahankan persepsi *smoothness* pada UI *native* sebelum Javascript selesai me-*load* halaman pertama.
- Pindahkan *import* dari file CSS tersebut langsung ke dalam *Page Modules* JS yang bersangkutan.
    - *Contoh:* Pada bagian paling atas file `src/js/pages/quran-page.js`, tambahkan: `import '../../css/pages/quran.css';` (dan import CSS spesifik quran lainnya yang diperlukan modul tersebut).
- **Hasil**: Vite secara otomatis membuat instruksi ke browser (saat *build*) untuk mengambil CSS tambahan tersebut HANYA saat JS chunk modul quran dimuat.

## 4. Vite Configuration Enhancements
- **File Target**: `vite.config.js`
- Pastikan konfigurasi *code-splitting* (melalui `rollupOptions.output.manualChunks`) sudah teroptimasi dengan sangat baik. 
- *Best Practices* chunking untuk aplikasi ini:
    - **vendor**: Semua yang ada di `node_modules` (kecuali Capacitor).
    - **capacitor**: Khusus `node_modules/@capacitor` agar SDK native terisolasi dengan rapi.
    - **quran-core**: Khusus komponen Quran yang besar logic-nya dipisah menjadi satu chunk independent agar pemuatan `quran-page` efisien.
    - Vite akan otomatis memecah setiap `import()` dinamis menjadi chunk tersendiri. Pastikan tidak ada *circular dependencies* yang memaksa Vite menggabungkan chunk tersebut kembali ke *main thread*.

## 5. Standar Eksekusi Kode
- **DRY & Clean Code**: Gunakan fungsionalitas Vanilla JS dengan spesifikasi ES Modules secara benar. Jangan memodifikasi *business logic* dari fungsi yang sudah ada (misal: perhitungan waktu sholat, pembacaan quran JSON, manipulasi state kompas), *hanya* modifikasi CARA dan WAKTU komponen itu dimuat ke memori.
- **Urutan Kode**: Pastikan `app.js` melakukan inisialisasi Capacitor *plugin* yang esensial di awal, kemudian memulai *router* ke halaman Home, mengakhiri *splash screen*, dan membiarkan fitur lainnya berada pada *background preloading* atau *on-demand lazy loading*.
- **No Design Breakage**: Pastikan saat CSS di-*split*, seluruh komponen HTML yang dirender ketika *lazy-loaded page* dipanggil memiliki *styling* yang tepat sesuai aslinya. Jangan pernah menghapus selector CSS, cukup pindahkan cara importnya.
