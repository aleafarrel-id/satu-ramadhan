<div align="center">

<img src="public/favicon/favicon.png" alt="Satu Ramadhan" width="96" height="96" />

# Satu Ramadhan

**Pendamping ibadah Islam yang lengkap, privat, dan gratis.**

Waktu shalat akurat · Al-Quran Tajwid · Kiblat · Tasbih Digital · Adzan · 🌍 Global Support

<br/>

[![Get it on Google Play](https://img.shields.io/badge/Google%20Play-Satu%20Ramadhan-3DDC84?style=for-the-badge&logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.saturamadhan.mobile)
[![Web Version](https://img.shields.io/badge/Web%20App-Live%20Demo-0D9488?style=for-the-badge&logo=cloudflare&logoColor=white)](https://saturamadhan-web.pages.dev/)
[![Landing Page](https://img.shields.io/badge/Website-saturamadhan.pages.dev-1e3a5f?style=for-the-badge&logo=googlechrome&logoColor=white)](https://saturamadhan.pages.dev/)

<br/>

[![Version](https://img.shields.io/badge/version-2.0--stable-brightgreen?style=flat-square)](package.json)
[![Platform](https://img.shields.io/badge/platform-Android%208.0%2B-blue?style=flat-square&logo=android)](https://play.google.com/store/apps/details?id=com.saturamadhan.mobile)
[![License](https://img.shields.io/badge/license-Private-red?style=flat-square)](LICENSE)
[![Made with Vite](https://img.shields.io/badge/built%20with-Vite-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Capacitor](https://img.shields.io/badge/powered%20by-Capacitor-119EFF?style=flat-square&logo=capacitor)](https://capacitorjs.com/)

</div>

---

## ✨ Fitur Utama

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🕌 Waktu Shalat Real-Time</h3>
      <p>Waktu shalat akurat berdasarkan GPS. Mendukung metode NU, Muhammadiyah, dan berbagai mazhab lainnya. Dilengkapi countdown real-time ke shalat berikutnya.</p>
      <img src="assets/previews/1.png" alt="Waktu Shalat Real-Time" width="320" />
    </td>
    <td width="50%" valign="top">
      <h3>🔔 Adzan & Jadwal Puasa</h3>
      <p>Notifikasi Adzan otomatis. Jadwal Imsakiyah siap cetak, serta <strong>Kalender Puasa Sepanjang Tahun</strong> (Sunnah & Haram) interaktif lengkap dengan niat dan doa (ID/EN).</p>
      <img src="assets/previews/3.png" alt="Adzan & Jadwal Puasa" width="320" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>📖 Al-Quran, Tajwid, Latin & Terjemah</h3>
      <p>Al-Quran 30 Juz lengkap dengan Tajwid berwarna otomatis, transliterasi Latin, terjemahan Bahasa Indonesia dan Inggris, audio murottal per ayat, serta sistem Bookmark pintar berbasis Folder.</p>
      <img src="assets/previews/7.png" alt="Al-Quran dengan Tajwid" width="320" />
    </td>
    <td width="50%" valign="top">
      <h3>🧭 Kompas Kiblat Live</h3>
      <p>Arah Kiblat presisi berbasis sensor perangkat dengan kompas magnetometer dan peta interaktif rute ke Ka'bah. Menampilkan derajat arah secara real-time.</p>
      <img src="assets/previews/5.png" alt="Kompas Kiblat Live" width="320" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>📿 Tasbih Digital</h3>
      <p>Tasbih digital elegan dengan animasi manik-manik 3D yang realistis. Lacak sesi zikir harian, atur target hitungan dan putaran, lengkap dengan kaligrafi Arab, efek getar dan suara klik.</p>
      <img src="assets/previews/6.png" alt="Tasbih Digital" width="320" />
    </td>
    <td width="50%" valign="top">
      <h3>⚙️ Kustomisasi Penuh & Global</h3>
      <p>Tema tampilan (Teal/Dark), bahasa (ID/EN), dan pilihan suara Adzan bisa disesuaikan. Metode hisab waktu shalat kini terdeteksi <strong>otomatis berdasarkan negara</strong> — mendukung 23+ metode global (MUIS, JAKIM, ISNA, MWL, Umm Al-Qura, Kemenag, dll.).</p>
      <img src="assets/previews/8.png" alt="Kustomisasi Penuh" width="320" />
    </td>
  </tr>
</table>

---

## 🛡️ Privasi by Design

> Satu Ramadhan dibangun dengan prinsip **zero data collection**.

- ✅ **Tanpa akun** — tidak ada registrasi, tidak ada login
- ✅ **Tanpa iklan** — tidak ada SDK iklan atau tracking pihak ketiga
- ✅ **Tanpa server** — semua preferensi disimpan lokal di perangkat
- ✅ **GPS aman** — koordinat hanya dipakai untuk hitung waktu shalat dan arah kiblat, tidak pernah disimpan
- ✅ **Offline First** — dilengkapi database geocoder lokal (KD-Tree) untuk kalkulasi waktu shalat dan arah kiblat tanpa koneksi internet

---

## 🧰 Tech Stack

| Layer                  | Teknologi                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| **Build Tool**         | [Vite 8](https://vitejs.dev/)                                    |
| **Native Bridge**      | [Capacitor 8](https://capacitorjs.com/) + Android                |
| **Waktu Shalat**       | [Adhan.js](https://github.com/batoulapps/adhan-js) + Aladhan API |
| **Peta / Kiblat**      | [Leaflet.js](https://leafletjs.com/) + Geomagnetism              |
| **Al-Quran Mushaf**    | [PageFlip](https://nodlik.github.io/StPageFlip/) + PanZoom       |
| **Internasionalisasi** | [i18next](https://www.i18next.com/) + HTTP Backend               |
| **CSS**                | Vanilla CSS (PostCSS + cssnano)                                  |
| **Share Jadwal**       | [html-to-image](https://github.com/bubkoo/html-to-image)         |

---

## 🚀 Cara Menjalankan Lokal

### Prasyarat

- Node.js ≥ 18
- npm ≥ 9
- Android Studio (untuk build native)
- JDK 17+ (untuk Capacitor Android)

### Instalasi & Dev Server

```bash
# Clone repositori
git clone https://github.com/aleafarrel-id/satu-ramadhan.git
cd satu-ramadhan

# Install dependencies
npm install

# Jalankan dev server
npm run dev
# → http://localhost:5173
```

### Build Produksi

```bash
# Build web assets
npm run build

# Sync ke Android (Capacitor)
npx cap sync android

# Buka di Android Studio
npx cap open android
```

---

## 📁 Struktur Folder

```
satu-ramadhan/
│
├── index.html                    # Entry point HTML utama
├── vite.config.js                # Konfigurasi Vite (code splitting, build target, sourcemap)
├── capacitor.config.json         # Konfigurasi Capacitor (Android bridge, webDir)
├── postcss.config.js             # PostCSS + cssnano (minifikasi CSS production)
├── package.json                  # Dependencies & scripts (dev, build, preview)
│
├── assets/
│   └── previews/                 # Screenshot preview fitur aplikasi
│
├── android/                      # Native Android project (dikelola Capacitor)
│
├── public/                       # Static assets — di-serve langsung, tidak di-bundle Vite
│   ├── theme-boot.js             # Script tema awal, dijalankan sebelum render (cegah FOUC)
│   │
│   ├── assets/
│   │   ├── icon/                 # Icon aplikasi (launcher, adaptive icon)
│   │   ├── mosque/               # Aset ilustrasi masjid (gambar dekoratif)
│   │   └── tiles/                # Map tiles offline untuk Leaflet
│   │
│   ├── audio/                    # File audio Adzan (MP3/AAC) per muadzin
│   │
│   ├── data/
│   │   ├── province.json         # Data 38 provinsi Indonesia
│   │   ├── regency.json          # Data 500+ kabupaten/kota Indonesia
│   │   ├── ramadhan.json         # Konfigurasi jadwal Ramadhan (bisa dioverride remote)
│   │   └── world-cities.json     # Dataset kota global untuk offline geocoding
│   │
│   ├── favicon/                  # Favicon & PWA icon berbagai ukuran
│   │
│   ├── multi-language/           # Namespace terjemahan i18next (lazy-loaded per halaman)
│   │   ├── id/                   # Bahasa Indonesia
│   │   │   ├── common.json       # String umum (tombol, label, pesan error)
│   │   │   ├── fasting.json      # Data puasa sunnah/haram, niat, doa
│   │   │   ├── pages/            # Namespace per halaman
│   │   │   │   ├── home-page.json
│   │   │   │   ├── schedule-page.json
│   │   │   │   ├── quran-page.json
│   │   │   │   ├── tasbih-page.json
│   │   │   │   ├── compass-page.json
│   │   │   │   ├── settings-page.json
│   │   │   │   └── quran-pages/  # Namespace sub-halaman Al-Quran
│   │   │   ├── components/       # Namespace komponen (modal, card)
│   │   │   ├── modules/          # Namespace modul (notifikasi, permission)
│   │   │   └── utils/            # Namespace utilitas
│   │   └── en/                   # Bahasa Inggris (struktur sama dengan id/)
│   │
│   └── quran/                    # Data Al-Quran statis (di-fetch saat dibutuhkan)
│       ├── surah.json            # Index 114 surah (nama, jumlah ayat, jenis)
│       ├── juz.json              # Index 30 juz
│       ├── surah/                # Teks Arab per surah (surah_001.json dst.)
│       ├── latin/                # Transliterasi Latin per surah
│       ├── translation/          # Terjemahan (id/, en/)
│       ├── tajweed/              # Data markup Tajwid per surah
│       └── mushaf/               # Data halaman Mushaf (mushaf-index.json, page-*.json)
│
└── src/                          # Source code aplikasi
    ├── main.js                   # Entry point JS — import CSS utama & bootstrap app
    │
    ├── data/
    │   ├── tasbih.json           # Preset zikir bawaan (6 dzikir + custom slot)
    │   ├── calculation-methods.json  # Registry 23+ metode hisab (angles, madhab, ihtiyat)
    │   └── country-method-map.json   # Mapping ISO countryCode → calculation method ID
    │
    ├── templates/
    │   └── share-schedule/
    │       ├── share-schedule.html  # Template HTML jadwal Imsakiyah siap cetak
    │       └── share-schedule.css   # Styling template share (portrait, print-ready)
    │
    ├── css/
    │   ├── main.css              # Entry CSS — import semua layer base & layout
    │   │
    │   ├── base/
    │   │   ├── variables.css     # Design tokens: warna, radius, spacing (teal & dark)
    │   │   ├── reset.css         # CSS reset & normalisasi lintas browser
    │   │   └── typography.css    # Sistem tipografi: font stack, ukuran, line-height
    │   │
    │   ├── layout/
    │   │   ├── app-shell.css     # Struktur dasar app (viewport, scroll container)
    │   │   ├── header.css        # App header & status bar overlay
    │   │   └── navigation.css    # Bottom navigation bar
    │   │
    │   ├── pages/
    │   │   ├── home.css          # Halaman utama (countdown, prayer card grid/list)
    │   │   ├── schedule.css      # Halaman jadwal Imsakiyah bulanan
    │   │   ├── quran.css         # Halaman daftar surah & navigasi Quran
    │   │   ├── tasbih.css        # Halaman Tasbih (info card, beads area, selector)
    │   │   ├── compass.css       # Halaman Kompas Kiblat
    │   │   └── settings.css      # Halaman Pengaturan
    │   │
    │   └── components/
    │       ├── card/
    │       │   ├── card.css               # Base card style
    │       │   ├── location-card.css      # Kartu lokasi aktif
    │       │   ├── qibla-info-card.css    # Info derajat Kiblat
    │       │   ├── qibla-map-card.css     # Peta rute Ka'bah (Leaflet)
    │       │   ├── share-schedule-card.css# Kartu shortcut share jadwal
    │       │   └── shortcut-card.css      # Kartu shortcut navigasi cepat
    │       ├── modal/
    │       │   ├── confirm-modal.css
    │       │   ├── adzan-selector-modal.css
    │       │   ├── audio-mode-selector-modal.css
    │       │   ├── calendar-modal.css
    │       │   ├── fasting-details-modal.css
    │       │   ├── date-picker-modal.css
    │       │   ├── location-modal.css
    │       │   ├── location-search-modal.css
    │       │   ├── language-selector-modal.css
    │       │   ├── compass-guide-modal.css
    │       │   ├── mushaf-guide-modal.css
    │       │   ├── mushaf-jump-modal.css
    │       │   ├── preset-manager-modal.css
    │       │   ├── share-schedule-modal.css
    │       │   ├── tasbih-preset-modal.css
    │       │   ├── bookmark-note-modal.css
    │       │   ├── bookmark-folder-modal.css
    │       │   ├── bookmark-move-modal.css
    │       │   ├── calculation-method-modal.css
    │       │   ├── about-app-modal.css
    │       │   └── permission-dialog.css
    │       ├── quran/
    │       │   ├── quran-reader.css       # Layout & tipografi reader per ayat
    │       │   ├── quran-tajweed.css      # Warna-warni kode Tajwid
    │       │   ├── quran-audio-dock.css   # Floating audio player Quran
    │       │   ├── quran-dock.css         # Bottom dock navigasi Quran
    │       │   ├── quran-header.css       # Header reader (nama surah, search)
    │       │   ├── quran-card.css         # Kartu surah di daftar
    │       │   ├── quran-bookmark.css     # Tampilan halaman bookmark
    │       │   └── mushaf.css             # Mode baca Mushaf (page-flip)
    │       ├── tasbih/
    │       │   └── tasbih-beads.css       # Animasi manik-manik SVG 3D
    │       ├── skeleton/
    │       │   ├── skeleton-home.css
    │       │   ├── skeleton-schedule.css
    │       │   └── skeleton-compass.css
    │       └── ui/
    │           ├── button.css             # Varian tombol (primary, ghost, icon)
    │           ├── toggle.css             # Switch toggle on/off
    │           ├── carousel.css           # Komponen carousel (home countdown)
    │           ├── empty-state.css        # Tampilan state kosong / error
    │           ├── splash-screen.css      # Splash screen saat startup
    │           ├── theme-transition.css   # Animasi transisi ganti tema
    │           └── quran-backdrop.css     # Overlay backdrop reader Quran
    │
    └── js/
        ├── app.js                # Bootstrap aplikasi, inisialisasi semua modul inti
        ├── router.js             # Client-side router berbasis hash/path, lazy-load halaman
        │
        ├── config/               # Konstanta & konfigurasi statis seluruh aplikasi
        │   ├── version-config.js # Versi app, nama developer, URL privacy policy
        │   ├── adzan-sounds.js   # Registry pilihan suara Adzan (nama, path file)
        │   ├── languages.js      # Daftar bahasa yang didukung (kode, label)
        │   ├── quran-audio.js    # Konfigurasi sumber audio tilawah
        │   └── quran-languages.js# Konfigurasi bahasa terjemahan Quran
        │
        ├── core/                       # Layanan fondasi — dipakai lintas seluruh aplikasi
        │   ├── store.js                # State management: pub/sub + persistence ke storage
        │   ├── api.js                  # HTTP client: prayer time API (Aladhan), retry, cache
        │   ├── database.js             # Loader & cache JSON lokal (province, regency, ramadhan)
        │   ├── i18n.js                 # Setup i18next: namespace lazy-load, language detection
        │   ├── theme.js                # Manajemen tema teal/dark, status bar color override
        │   ├── geolocation.js          # Akuisisi GPS: native Capacitor + web fallback
        │   ├── local-calculator.js     # Kalkulasi waktu shalat offline via Adhan.js
        │   ├── calculation-resolver.js # Single source of truth: metode hisab aktif
        │   ├── location-search.js      # Pencarian lokasi manual (autocomplete + validasi)
        │   ├── nominatim.js            # Reverse geocoding nama kota + countryCode via Nominatim
        │   └── storage.js              # Abstraksi Capacitor Preferences (get/set/remove)
        │
        ├── pages/                # Controller halaman — di-lazy-load oleh router
        │   ├── home-page.js      # Halaman utama: countdown, prayer card, shortcut
        │   ├── schedule-page.js  # Jadwal Imsakiyah: kalender, notif toggle, generate
        │   ├── quran-page.js     # Entry point Quran: routing surah/juz/bookmark/mushaf
        │   ├── tasbih-page.js    # Tasbih digital: manik SVG, sesi, selector zikir
        │   ├── compass-page.js   # Kompas Kiblat: sensor + peta Leaflet + derajat
        │   ├── settings-page.js  # Pengaturan: lokasi, tema, bahasa, adzan, Quran
        │   └── quran-pages/      # Sub-halaman Al-Quran (di-route dari quran-page.js)
        │       ├── surah-page.js    # Daftar & pilih surah
        │       ├── juz-page.js      # Daftar & pilih juz
        │       ├── bookmark-page.js # Kelola bookmark ayat tersimpan
        │       └── mushaf-page.js   # Mode baca Mushaf (page-flip interaktif)
        │
        ├── modules/        # Modul fitur mandiri — business logic tanpa DOM langsung
        │   ├── prayer/
        │   │   ├── prayer-times.js      # Kalkulasi & format 5 waktu shalat + imsak
        │   │   └── prayer-watcher.js    # Watcher interval real-time, trigger notifikasi
        │   │
        │   ├── quran/
        │   │   ├── quran-api.js              # Fetch & cache data surah/juz/ayat/tajwid
        │   │   ├── quran-reader.js           # Render ayat, interaksi tap, highlight
        │   │   ├── quran-tajweed.js          # Parser & engine pewarnaan Tajwid otomatis
        │   │   ├── quran-audio-service.js    # Manajemen playback audio tilawah per ayat
        │   │   ├── quran-download-manager.js # Download & cache audio tilawah offline
        │   │   ├── quran-settings.js         # Persistensi preferensi reader (font, dll.)
        │   │   ├── quran-nav.js              # Navigasi antar surah/ayat dalam reader
        │   │   ├── quran-utility.js          # Helper konversi nomor ayat, surah, juz
        │   │   ├── bookmark-manager.js       # CRUD bookmark ayat (store + validasi)
        │   │   ├── murottal-native-bridge.js # Bridge audio native Capacitor untuk murottal
        │   │   └── mushaf/
        │   │       ├── mushaf-api.js         # Fetch index & data per halaman Mushaf
        │   │       ├── mushaf-reader.js      # Engine page-flip + panzoom + navigasi
        │   │       └── mushaf-ui.js          # Overlay UI Mushaf (header, page indicator)
        │   │
        │   ├── compass/
        │   │   ├── compass.js               # Engine kompas: sensor magnetometer + Kiblat
        │   │   └── magnetic-declination.js  # Koreksi deklinasi magnetik per koordinat
        │   │
        │   ├── notification/
        │   │   ├── notification.js          # API notifikasi: schedule, cancel, toast UI
        │   │   ├── notification-sync.js     # Sinkronisasi jadwal notifikasi Adzan harian
        │   │   └── native-notification.js   # Bridge Capacitor LocalNotifications
        │   │
        │   ├── schedule/
        │   │   ├── schedule-data.js         # Fetch & format jadwal shalat satu bulan
        │   │   ├── fasting-engine.js        # Kalkulasi offline kalender puasa sunnah/haram
        │   │   ├── ramadhan.js              # Kalkulasi periode Ramadhan + Imsak
        │   │   └── countdown.js             # Logika countdown ke waktu shalat berikutnya
        │   │
        │   ├── share/
        │   │   ├── share-schedule-builder.js  # Build HTML jadwal untuk di-capture
        │   │   └── share-schedule-exporter.js # Ekspor ke gambar via html-to-image + share
        │   │
        │   ├── tasbih/
        │   │   ├── tasbih-audio.js          # Preload & putar efek suara klik tasbih
        │   │   └── tasbih-gesture.js        # Deteksi gesture swipe buka panel tasbih
        │   │
        │   ├── network/
        │   │   ├── remote-config.js         # Fetch & cache konfigurasi remote (ramadhan)
        │   │   └── offline-updater.js       # Update data lokal saat koneksi tersedia
        │   │
        │   ├── permission/
        │   │   ├── permission-dialog.js         # Dialog UI permintaan izin (GPS, notif)
        │   │   └── permission-dialog-configs.js # Konfigurasi teks & flow tiap jenis izin
        │   │
        │   └── system/
        │       ├── platform.js     # Deteksi runtime: native Android vs web browser
        │       ├── back-handler.js # Manajemen tombol Back Android (stack modal)
        │       └── haptic.js       # Wrapper haptic feedback (impact, double, lock)
        │
        ├── components/     # Komponen UI yang dapat digunakan ulang lintas halaman
        │   ├── card/
        │   │   ├── countdown-card.js        # Kartu countdown ke shalat berikutnya
        │   │   ├── location-card.js         # Kartu lokasi aktif + tombol ganti
        │   │   ├── prayer-card.js           # Kartu grid/list 5 waktu shalat hari ini
        │   │   ├── prayer-list.js           # Tampilan list waktu shalat (alternatif grid)
        │   │   ├── qibla-info-card.js       # Kartu info derajat & jarak Ka'bah
        │   │   ├── qibla-map-card.js        # Peta interaktif rute ke Ka'bah (Leaflet)
        │   │   ├── qibla-map-card-markup.js # Template HTML markup peta Kiblat
        │   │   ├── schedule-card.js         # Kartu jadwal shalat per hari (list view)
        │   │   ├── share-schedule-card.js   # Kartu aksi generate & share jadwal
        │   │   └── shortcut-card.js         # Kartu shortcut navigasi cepat di home
        │   │
        │   ├── modal/
        │   │   ├── confirm-modal.js                # Dialog konfirmasi aksi (hapus, reset)
        │   │   ├── adzan-selector-modal.js         # Pilih suara Adzan dengan preview audio
        │   │   ├── audio-mode-selector-modal.js    # Pilih mode audio tilawah Quran
        │   │   ├── calendar-modal.js               # Kalender navigasi jadwal bulan & puasa
        │   │   ├── fasting-details-modal.js        # Detail puasa sunnah/haram (niat, doa)
        │   │   ├── date-picker-modal.js            # Date picker Hijriah & Masehi
        │   │   ├── location-modal.js               # Konfirmasi atau ganti lokasi
        │   │   ├── location-search-modal.js        # Pencarian kota dengan autocomplete
        │   │   ├── language-selector-modal.js      # Pilih bahasa terjemahan Quran
        │   │   ├── app-language-modal.js           # Pilih bahasa antarmuka aplikasi
        │   │   ├── app-theme-modal.js              # Pilih tema tampilan (Teal/Dark)
        │   │   ├── compass-guide-modal.js          # Panduan kalibrasi kompas
        │   │   ├── mushaf-guide-modal.js           # Panduan penggunaan Mushaf
        │   │   ├── mushaf-jump-modal.js            # Lompat ke halaman Mushaf tertentu
        │   │   ├── preset-manager-modal.js         # Kelola preset notifikasi & jadwal
        │   │   ├── share-schedule-modal.js         # Preview & share jadwal Imsakiyah
        │   │   ├── tasbih-preset-modal.js          # Tambah/edit preset zikir kustom
        │   │   ├── bookmark-note-modal.js          # Tambah catatan pada bookmark ayat
        │   │   ├── bookmark-folder-modal.js        # Buat/edit nama folder bookmark
        │   │   ├── bookmark-move-modal.js          # Pindahkan bookmark antar folder (tagging)
        │   │   ├── calculation-method-modal.js     # Pilih metode hisab kalkulasi
        │   │   └── about-app-modal.js              # Tentang aplikasi (versi, developer)
        │   │
        │   ├── quran/
        │   │   ├── quran-card.js            # Kartu surah di halaman daftar
        │   │   ├── quran-header.js          # Header reader (nama surah, navigasi)
        │   │   ├── quran-dock.js            # Bottom dock (juz, surah, halaman)
        │   │   ├── quran-audio-dock.js      # Floating player audio tilawah
        │   │   ├── quran-picker.js          # Picker navigasi cepat surah/juz
        │   │   └── quran-search.js          # Pencarian surah & ayat
        │   │
        │   ├── prayer/
        │   │   └── prayer-widgets.js        # Widget waktu shalat ringkas (header app)
        │   │
        │   ├── compass/
        │   │   └── compass-dial.js          # Render SVG jarum kompas animasi
        │   │
        │   ├── schedule/
        │   │   └── schedule-swipe.js        # Gesture swipe antar hari di jadwal
        │   │
        │   ├── settings/
        │   │   ├── settings-panel.js             # Panel utama pengaturan (accordion)
        │   │   ├── settings-display-panel.js     # Panel pengaturan tampilan (tema, bahasa)
        │   │   ├── settings-loc-card.js          # Kartu pengaturan lokasi
        │   │   ├── settings-preset-card.js       # Kartu preset jadwal Ramadhan
        │   │   ├── settings-calculation-panel.js # Panel metode hisab (baru)
        │   │   ├── settings-quran-panel.js       # Panel pengaturan reader Quran
        │   │   └── settings-about-app.js         # Bagian info versi & tentang aplikasi
        │   │
        │   ├── skeleton/
        │   │   ├── skeleton-home.js         # Skeleton loading halaman utama
        │   │   ├── skeleton-schedule.js     # Skeleton loading halaman jadwal
        │   │   └── skeleton-compass.js      # Skeleton loading halaman kompas
        │   │
        │   └── ui/
        │       ├── header.js                # App header (judul halaman, aksi)
        │       ├── nav-bar.js               # Bottom navigation bar (tab switcher)
        │       └── empty-state.js           # Tampilan state kosong / koneksi gagal
        │
        └── utils/                  # Fungsi helper murni — tanpa side effect
            ├── a11y.js             # Aksesibilitas: focus trap, ARIA, keyboard nav
            ├── datetime.js         # Format tanggal Masehi & Hijriah, countdown string
            ├── dom-utils.js        # Helper DOM: query, insert, class manipulation
            ├── error-boundary.js   # Penanganan error global & logging terpusat
            ├── sanitize.js         # Escape HTML untuk mencegah XSS injection
            ├── pull-to-refresh.js  # Gesture pull-to-refresh dengan threshold & animasi
            ├── tooltip.js          # Komponen tooltip posisioning dinamis
            ├── focus-manager.js    # Manajemen fokus keyboard antar komponen
            ├── modal-portal.js     # Portal rendering modal ke document.body
            ├── keyboard-handler.js # Global keyboard shortcut handler
            ├── location-feedback.js# Feedback UI saat proses deteksi lokasi
            ├── store-services.js   # Helper query state store yang sering dipakai
            ├── theme-transition.js # Animasi crossfade saat ganti tema
            └── world-geocoder.js   # KD-Tree engine untuk pencarian kota offline terdekat
```

---

## 📦 Arsitektur Singkat

```
┌─────────────────────────────────────────────────────────┐
│                     index.html                          │
│                       app.js  ←  router.js              │
└────────────────────────┬────────────────────────────────┘
                         │ lazy load
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
    [pages/]        [modules/]         [components/]
   home-page      prayer-times         modal/
   quran-page     quran-reader         card/
   tasbih-page    compass              skeleton/
   schedule-page  notification         ...
   ...            ...
          │              │
          └──────┬───────┘
                 ▼
           [core/]
     store · api · i18n
     theme · database
     geolocation · storage
```

**Prinsip Utama:**

- **Lazy Loading** — setiap halaman dan modul berat diload hanya saat dibutuhkan
- **State Terpusat** — `store.js` sebagai single source of truth dengan pub/sub pattern
- **Offline-first** — data waktu shalat dikalkulasi lokal via Adhan.js (tanpa internet)
- **Zero Dependency UI** — tidak menggunakan framework UI (React/Vue), murni Vanilla JS
- **Global Calculation** — `calculation-resolver.js` auto-detect metode hisab per negara

---

## 🌐 Links

|                          |                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 🏠 **Landing Page**      | [saturamadhan.pages.dev](https://saturamadhan.pages.dev/)                                                                              |
| 📱 **Web App**           | [saturamadhan-web.pages.dev](https://saturamadhan-web.pages.dev/)                                                                      |
| 🛒 **Google Play**       | [play.google.com/store/apps/details?id=com.saturamadhan.mobile](https://play.google.com/store/apps/details?id=com.saturamadhan.mobile) |
| 🔏 **Kebijakan Privasi** | [saturamadhan-policy.afarrel.workers.dev](https://saturamadhan-policy.afarrel.workers.dev/)                                            |

---

<div align="center">

_بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ_

Dibuat dengan dedikasi tinggi untuk amal jariyah oleh **Alea Farrel** &nbsp;·&nbsp; `com.saturamadhan.mobile`

</div>
