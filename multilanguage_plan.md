# Multi-Language (i18n) Implementation Plan
**Satu Ramadhan — Enterprise Grade**

---

## 1. Overview

Tambahkan dukungan multi-bahasa (🇮🇩 Indonesia & 🇬🇧 English) ke aplikasi. Bahasa default: **Auto** (detect dari sistem perangkat). Pengguna bisa override manual di Settings.

**Library yang digunakan:** `i18next` + `i18next-http-backend`
- File JSON terjemahan **tidak dibundle** — dimuat secara lazy dari `public/`
- Setiap komponen/page memuat namespace-nya sendiri, sehingga **ringan dan efisien**
- Bahasa yang didukung didefinisikan di **satu file registry** (`config/languages.js`)
- Menambah bahasa baru = 1 entry di registry + 1 folder JSON — zero perubahan di service/komponen

---

## 2. Instalasi ✅

```bash
npm install i18next i18next-http-backend
```

> Sudah terinstall di `package.json` — `i18next@^26.0.3` + `i18next-http-backend@^3.0.4`

---

## 3. Struktur File Terjemahan & Konvensi Penamaan

### Prinsip Utama: 1:1 Path Mirroring

Struktur folder dan nama file JSON **wajib mencerminkan** path relatif file JS sumbernya di `src/js/`. Ini memastikan developer bisa langsung menemukan file terjemahan hanya dengan melihat path file JS-nya.

**Rumus:**
```
src/js/<path>/<nama>.js  →  public/multi-language/<lang>/<path>/<nama>.json
```

**Tabel Mapping Lengkap:**

| File JS Sumber | Namespace (= path JSON) | File JSON |
|---|---|---|
| `src/js/` *(shared)* | `common` | `common.json` |
| `src/js/pages/home-page.js` | `pages/home-page` | `pages/home-page.json` |
| `src/js/pages/schedule-page.js` | `pages/schedule-page` | `pages/schedule-page.json` |
| `src/js/pages/compass-page.js` | `pages/compass-page` | `pages/compass-page.json` |
| `src/js/pages/settings-page.js` | `pages/settings-page` | `pages/settings-page.json` |
| `src/js/pages/quran-pages/bookmark-page.js` | `pages/quran-pages/bookmark-page` | `pages/quran-pages/bookmark-page.json` |
| `src/js/components/card/countdown-card.js` | `components/card/countdown-card` | `components/card/countdown-card.json` |
| `src/js/components/card/location-card.js` | `components/card/location-card` | `components/card/location-card.json` |
| `src/js/components/card/prayer-card.js` | `components/card/prayer-card` | `components/card/prayer-card.json` |
| `src/js/components/card/qibla-info-card.js` | `components/card/qibla-info-card` | `components/card/qibla-info-card.json` |
| `src/js/components/modal/location-modal.js` | `components/modal/location-modal` | `components/modal/location-modal.json` |
| `src/js/components/modal/compass-guide-modal.js` | `components/modal/compass-guide-modal` | `components/modal/compass-guide-modal.json` |
| `src/js/components/modal/confirm-modal.js` | `components/modal/confirm-modal` | `components/modal/confirm-modal.json` |
| `src/js/components/prayer/prayer-widgets.js` | `components/prayer/prayer-widgets` | `components/prayer/prayer-widgets.json` |
| `src/js/components/settings/settings-panel.js` | `components/settings/settings-panel` | `components/settings/settings-panel.json` |
| `src/js/components/settings/settings-quran-panel.js` | `components/settings/settings-quran-panel` | `components/settings/settings-quran-panel.json` |
| `src/js/components/settings/settings-loc-card.js` | `components/settings/settings-loc-card` | `components/settings/settings-loc-card.json` |
| `src/js/components/settings/settings-preset-card.js` | `components/settings/settings-preset-card` | `components/settings/settings-preset-card.json` |
| `src/js/components/ui/header.js` | `components/ui/header` | `components/ui/header.json` |
| `src/js/components/ui/nav-bar.js` | `components/ui/nav-bar` | `components/ui/nav-bar.json` |
| `src/js/modules/prayer/prayer-times.js` | `modules/prayer/prayer-times` | `modules/prayer/prayer-times.json` |

### Struktur Folder Hasil

```
public/multi-language/
├── id/
│   ├── common.json                               ← shared: "Batal", "Tutup", "Coba Lagi"
│   ├── pages/
│   │   ├── home-page.json                         ← src/js/pages/home-page.js
│   │   ├── schedule-page.json                     ← src/js/pages/schedule-page.js
│   │   ├── compass-page.json                      ← src/js/pages/compass-page.js
│   │   ├── settings-page.json                     ← src/js/pages/settings-page.js
│   │   └── quran-pages/
│   │       └── bookmark-page.json                 ← src/js/pages/quran-pages/bookmark-page.js
│   ├── components/
│   │   ├── card/
│   │   │   ├── countdown-card.json                ← src/js/components/card/countdown-card.js
│   │   │   ├── location-card.json                 ← src/js/components/card/location-card.js
│   │   │   ├── prayer-card.json                   ← src/js/components/card/prayer-card.js
│   │   │   └── qibla-info-card.json               ← src/js/components/card/qibla-info-card.js
│   │   ├── modal/
│   │   │   ├── location-modal.json                ← src/js/components/modal/location-modal.js
│   │   │   ├── compass-guide-modal.json           ← src/js/components/modal/compass-guide-modal.js
│   │   │   └── confirm-modal.json                 ← src/js/components/modal/confirm-modal.js
│   │   ├── prayer/
│   │   │   └── prayer-widgets.json                ← src/js/components/prayer/prayer-widgets.js
│   │   ├── settings/
│   │   │   ├── settings-panel.json                ← src/js/components/settings/settings-panel.js
│   │   │   ├── settings-quran-panel.json          ← src/js/components/settings/settings-quran-panel.js
│   │   │   ├── settings-loc-card.json             ← src/js/components/settings/settings-loc-card.js
│   │   │   └── settings-preset-card.json          ← src/js/components/settings/settings-preset-card.js
│   │   └── ui/
│   │       ├── header.json                        ← src/js/components/ui/header.js
│   │       └── nav-bar.json                       ← src/js/components/ui/nav-bar.js
│   └── modules/
│       └── prayer/
│           └── prayer-times.json                  ← src/js/modules/prayer/prayer-times.js
└── en/
    └── (struktur identik dengan id/)
```

### Konvensi Penggunaan di Kode

Namespace yang di-pass ke `loadNS()` dan `t()` **harus identik** dengan path JSON relatif (tanpa ekstensi):

```js
// File: src/js/components/card/location-card.js
// JSON:  public/multi-language/{lang}/components/card/location-card.json

await loadNS('components/card/location-card');           // ← path = namespace
const text = t('components/card/location-card:header');  // ← namespace:key
```

### Konvensi Penulisan Key

Flat, snake_case, tidak nested lebih dari 1 level:

```json
// ✅ BENAR
{ "title": "Jadwal", "btn_change": "Ubah", "error_no_location": "Lokasi belum diatur" }

// ❌ SALAH — terlalu dalam, sulit di-maintain
{ "section": { "header": { "title": "Jadwal" } } }
```

---

## 4. Isi File JSON (Semua String yang Perlu Diterjemahkan)

### `common.json`
```json
// id
{ "close": "Tutup", "cancel": "Batal", "delete": "Hapus", "save": "Simpan", "retry": "Coba Lagi", "change": "Ubah", "set": "Atur" }
// en
{ "close": "Close", "cancel": "Cancel", "delete": "Delete", "save": "Save", "retry": "Try Again", "change": "Change", "set": "Set" }
```

### `modules/prayer/prayer-times.json`
```json
// id
{ "imsak": "Imsak", "subuh": "Subuh", "terbit": "Terbit", "dzuhur": "Dzuhur", "ashar": "Ashar", "magrib": "Magrib", "isya": "Isya'" }
// en  ← Nama Arab International, bukan terjemahan literal
{ "imsak": "Imsak", "subuh": "Fajr", "terbit": "Sunrise", "dzuhur": "Dhuhr", "ashar": "Asr", "magrib": "Maghrib", "isya": "Isha'" }
```

### `components/ui/header.json`
```json
// id
{
  "days": ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"],
  "months": ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
}
// en
{
  "days": ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
  "months": ["January","February","March","April","May","June","July","August","September","October","November","December"]
}
```

### `components/ui/nav-bar.json`
```json
// id
{ "home": "Home", "schedule": "Jadwal", "compass": "Kompas", "quran": "Al-Quran", "settings": "Setelan" }
// en
{ "home": "Home", "schedule": "Schedule", "compass": "Compass", "quran": "Al-Quran", "settings": "Settings" }
```

### `components/card/countdown-card.json`
```json
// id
{ "heading": "Menuju {{name}}", "hours": "JAM", "minutes": "MNT", "seconds": "DTK" }
// en
{ "heading": "Until {{name}}", "hours": "HRS", "minutes": "MIN", "seconds": "SEC" }
```

### `components/card/location-card.json`
```json
// id
{ "header": "LOKASI ANDA", "not_set": "Lokasi belum diatur", "hint": "Ketuk untuk mengatur lokasi" }
// en
{ "header": "YOUR LOCATION", "not_set": "Location not set", "hint": "Tap to set location" }
```

### `components/card/qibla-info-card.json`
```json
// id
{ "title": "ARAH KIBLAT", "calibration_guide": "Panduan Kalibrasi", "no_gyroscope": "Perangkat tidak memiliki sensor gyroscope." }
// en
{ "title": "QIBLA DIRECTION", "calibration_guide": "Calibration Guide", "no_gyroscope": "Device does not have a gyroscope sensor." }
```

### `components/prayer/prayer-widgets.json`
```json
// id
{ "now": "Sekarang", "qibla": "Kiblat", "org_changed": "Organisasi Diubah: {{name}}" }
// en
{ "now": "Now", "qibla": "Qibla", "org_changed": "Organization Changed: {{name}}" }
```

### `components/modal/location-modal.json`
```json
// id
{ "title": "Izinkan Akses Lokasi", "desc": "Untuk menampilkan jadwal sholat yang akurat sesuai lokasi Anda, aplikasi memerlukan akses GPS perangkat.", "btn_gps": "Akses Lokasi", "btn_manual": "Pilih Manual" }
// en
{ "title": "Allow Location Access", "desc": "To display accurate prayer times for your location, the app requires GPS access.", "btn_gps": "Use GPS", "btn_manual": "Select Manually" }
```

### `components/modal/compass-guide-modal.json`
```json
// id
{
  "title": "Panduan Kompas",
  "tip_1": "Gerakkan perangkat membentuk angka 8 untuk kalibrasi sensor",
  "tip_2": "Orientasikan perangkat secara mendatar untuk akurasi terbaik",
  "tip_3": "Jauhkan dari magnet, logam, dan perangkat elektronik lain",
  "tip_4": "Kompas menggunakan deklinasi magnetik untuk arah yang presisi"
}
// en
{
  "title": "Compass Guide",
  "tip_1": "Move your device in a figure-8 to calibrate the sensor",
  "tip_2": "Hold the device horizontally for best accuracy",
  "tip_3": "Keep away from magnets, metal, and other electronics",
  "tip_4": "The compass uses magnetic declination for precise direction"
}
```

### `components/settings/settings-panel.json`
```json
// id
{ "section_notif": "NOTIFIKASI", "notif_time": "Notifikasi Waktu", "adzan_sound": "Suara Adzan", "web_only_notice": "Fitur ini hanya tersedia di aplikasi mobile.", "notif_on": "Notifikasi diaktifkan", "notif_off": "Notifikasi dimatikan", "adzan_on": "Suara adzan diaktifkan", "adzan_off": "Suara adzan dimatikan", "perm_denied": "Izin notifikasi ditolak" }
// en
{ "section_notif": "NOTIFICATIONS", "notif_time": "Prayer Time Notifications", "adzan_sound": "Adhan Sound", "web_only_notice": "This feature is only available in the mobile app.", "notif_on": "Notifications enabled", "notif_off": "Notifications disabled", "adzan_on": "Adhan sound enabled", "adzan_off": "Adhan sound disabled", "perm_denied": "Notification permission denied" }
```

### `components/settings/settings-quran-panel.json`
```json
// id
{ "section": "AL-QUR'AN", "tajweed": "Tajwid", "transliteration": "Transliterasi Latin", "translation": "Terjemahan", "tajweed_on": "Tajwid diaktifkan", "tajweed_off": "Tajwid dimatikan", "translit_on": "Transliterasi Latin diaktifkan", "translit_off": "Transliterasi Latin dimatikan" }
// en
{ "section": "AL-QUR'AN", "tajweed": "Tajweed", "transliteration": "Latin Transliteration", "translation": "Translation", "tajweed_on": "Tajweed enabled", "tajweed_off": "Tajweed disabled", "translit_on": "Latin transliteration enabled", "translit_off": "Latin transliteration disabled" }
```

### `components/settings/settings-loc-card.json`
```json
// id
{ "title": "LOKASI", "not_set": "Lokasi belum diatur", "desc": "Sesuaikan lokasi untuk mendapatkan jadwal yang akurat", "btn_gps": "Akses Lokasi", "btn_manual": "Pilih Manual" }
// en
{ "title": "LOCATION", "not_set": "Location not set", "desc": "Set your location to get accurate prayer schedules", "btn_gps": "Use GPS", "btn_manual": "Select Manually" }
```

### `components/settings/settings-preset-card.json`
```json
// id
{ "title": "JADWAL RAMADAN", "desc": "Kelola organisasi serta tanggal awal-akhir Ramadhan", "btn_manage": "Kelola Preset", "unknown": "Tidak diketahui" }
// en
{ "title": "RAMADAN SCHEDULE", "desc": "Manage organization and Ramadan start/end dates", "btn_manage": "Manage Presets", "unknown": "Unknown" }
```

### `pages/home-page.json`
```json
// id
{ "schedule_today": "Jadwal Hari Ini", "error_no_location_title": "Atur Lokasi Anda", "error_no_location_desc": "Jadwal sholat akan ditampilkan setelah lokasi diatur melalui Pengaturan.", "error_offline_title": "Gagal Memuat Jadwal", "error_offline_desc": "Periksa koneksi internet Anda dan coba lagi." }
// en
{ "schedule_today": "Today's Schedule", "error_no_location_title": "Set Your Location", "error_no_location_desc": "Prayer times will appear after you set a location in Settings.", "error_offline_title": "Failed to Load Schedule", "error_offline_desc": "Check your internet connection and try again." }
```

### `pages/schedule-page.json`
```json
// id
{ "error_no_location_title": "Lokasi Belum Diatur", "error_no_location_desc": "Jadwal akan ditampilkan setelah lokasi Anda diatur.", "error_offline_title": "Gagal Memuat Jadwal", "error_offline_desc": "Periksa koneksi internet Anda dan coba lagi." }
// en
{ "error_no_location_title": "Location Not Set", "error_no_location_desc": "Your schedule will appear after you set a location.", "error_offline_title": "Failed to Load Schedule", "error_offline_desc": "Check your internet connection and try again." }
```

### `pages/compass-page.json`
```json
// id
{ "error_no_location_title": "Lokasi Belum Diatur", "error_no_location_desc": "Arah kiblat akan ditampilkan setelah lokasi Anda diatur.", "error_no_compass_title": "Kompas Tidak Tersedia", "error_no_compass_desc": "Arah kiblat tidak dapat dihitung atau sensor gyroscope tidak tersedia." }
// en
{ "error_no_location_title": "Location Not Set", "error_no_location_desc": "Qibla direction will appear after you set a location.", "error_no_compass_title": "Compass Unavailable", "error_no_compass_desc": "Qibla direction could not be calculated or the gyroscope sensor is unavailable." }
```

### `pages/settings-page.json`
```json
// id
{ "title": "Pengaturan", "section_language": "BAHASA", "language_label": "Bahasa Aplikasi" }
// en
{ "title": "Settings", "section_language": "LANGUAGE", "language_label": "App Language" }
```

### `pages/quran-pages/bookmark-page.json`
```json
// id
{ "empty": "Belum ada ayat yang ditandai", "error_load": "Gagal memuat bookmark", "not_found": "Tidak ditemukan \"{{query}}\"", "confirm_delete_title": "Hapus Bookmark", "confirm_delete_msg": "Apakah Anda yakin ingin menghapus bookmark untuk QS. {{surah}} ayat {{verse}}?", "deleted_notif": "QS. {{surah}}: {{verse}} dihapus" }
// en
{ "empty": "No bookmarked verses yet", "error_load": "Failed to load bookmarks", "not_found": "No results for \"{{query}}\"", "confirm_delete_title": "Remove Bookmark", "confirm_delete_msg": "Are you sure you want to remove the bookmark for QS. {{surah}} verse {{verse}}?", "deleted_notif": "QS. {{surah}}: {{verse}} removed" }
```

### `components/modal/confirm-modal.json` (default values)
```json
// id
{ "default_confirm": "Hapus", "default_cancel": "Batal" }
// en
{ "default_confirm": "Delete", "default_cancel": "Cancel" }
```

---

## 5. Language Registry ✅

**File: `src/js/config/languages.js`** — Single source of truth untuk semua bahasa yang didukung.

Menambah bahasa baru cukup **1 entry** di array ini + buat folder JSON-nya:

```js
export const APP_LANGUAGES = [
    { code: 'id', label: 'Indonesia', nativeLabel: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'en', label: 'English',   nativeLabel: 'English',          flag: '🇬🇧' },
];

export const FALLBACK_LANG = 'id';
export const SUPPORTED_CODES = APP_LANGUAGES.map(l => l.code);  // derived, DRY

export function getLanguageByCode(code) { ... }
export function getLanguageLabel(setting) { ... }  // handles 'auto' gracefully
```

**Semua consumer** (i18n service, settings UI, language modal) mengambil daftar bahasa dari sini.
Tidak ada hardcoded language code di tempat lain.

---

## 6. Core i18n Service ✅

**File: `src/js/core/i18n.js`** — Facade tunggal untuk semua internasionalisasi.

Mengonsumsi `config/languages.js`, tidak hardcode bahasa apapun.

```js
import { FALLBACK_LANG, SUPPORTED_CODES } from '../config/languages.js';

// Public API:
export async function initI18n() { ... }       // Boot i18next + http-backend
export function t(key, options) { ... }         // Translate (namespace:key)
export async function loadNS(ns) { ... }        // Lazy-load per komponen
export async function changeLanguage(lang) { ... } // Ganti + persist
export function getCurrentLang() { ... }        // Bahasa aktif saat ini

// resolveLanguage('auto') → match navigator.language prefix vs SUPPORTED_CODES
// Falls back to FALLBACK_LANG jika tidak ada match
```

---

## 7. Store Update ✅

`language: 'auto'` sudah ditambahkan ke `initialState.settings` di `store.js`.
Legacy migration `satu_ramadhan_language` juga sudah ditambahkan.

---

## 8. App Initialization ✅

Boot sequence di `app.js` sudah diupdate:

```
store.hydrate() → initI18n() → subscribe language → render header → render nav → navigate
```

Global language-switch listener sudah terdaftar: saat `settings.language` berubah →
`changeLanguage()` → re-render header + nav bar + soft-reload halaman aktif.

---

## 9. Pola Integrasi di Komponen (Wajib Konsisten)

Setiap komponen mengikuti pola ini **tanpa pengecualian**:

```js
// File: src/js/components/card/location-card.js
// JSON:  public/multi-language/{lang}/components/card/location-card.json
//        ↑ path identik, ekstensi berubah ↑

// 1. Import fungsi t dan loadNS
import { t, loadNS } from '../../core/i18n.js';

// 2. Di awal render(), load namespace yang sesuai path file JS-nya
export async function render(container) {
    await loadNS('components/card/location-card'); // ← namespace = path JSON

    // 3. Gunakan t() dengan format: 'namespace:key'
    container.innerHTML = `
        <div class="location-card__header">
            ${t('components/card/location-card:header')}
        </div>
        <button>${t('common:change')}</button>
    `;
}
```

**Aturan namespace:**
- Namespace = path relatif dari `src/js/` → tanpa ekstensi `.js`
- Contoh: `src/js/components/ui/header.js` → namespace `components/ui/header`
- `common` adalah satu-satunya namespace tanpa path (shared global)

**Untuk komponen sinkron (bukan async):** jadikan async, atau preload namespace di parent.

---

## 10. Kasus Khusus: prayer-times.js (Data-driven Names)

Nama sholat ada di `PRAYER_LIST` sebagai data, bukan string UI biasa. Solusi:

```js
// src/js/modules/prayer/prayer-times.js
import { t } from '../../core/i18n.js';

// Simpan key, bukan nama — nama diambil saat render
export const PRAYER_LIST = [
    { key: 'imsak',  icon: iconMoonStarsSvg },
    { key: 'subuh',  icon: iconSunFogSvg },
    { key: 'terbit', icon: iconSunRiseSvg },
    { key: 'dzuhur', icon: iconSunSvg },
    { key: 'ashar',  icon: iconCloudSunSvg },
    { key: 'magrib', icon: iconSunSetSvg },
    { key: 'isya',   icon: iconMoonSvg },
];

/** Ambil nama sholat yang sudah diterjemahkan */
export function getPrayerName(key) {
    return t(`modules/prayer/prayer-times:${key}`);
}
```

Di semua tempat yang sebelumnya menggunakan `prayer.name`, ganti ke `getPrayerName(prayer.key)`.
Pastikan namespace `modules/prayer/prayer-times` sudah di-load oleh parent component.

---

## 11. Kasus Khusus: header.js (Hari & Bulan)

```js
// src/js/components/ui/header.js
import { t, loadNS } from '../../core/i18n.js';

export async function render(container) {
    await loadNS('components/ui/header');
    // ... build DOM
    updateTime(); // panggil setelah namespace ready
}

function updateTime() {
    const now = new Date();
    const days   = JSON.parse(t('components/ui/header:days'));   // array
    const months = JSON.parse(t('components/ui/header:months')); // array
    // ... gunakan days[now.getDay()] dan months[now.getMonth()]
}
```

> **Catatan:** i18next mengembalikan string, jadi array di JSON perlu diparse. Alternatif: simpan sebagai 7 key terpisah (`day_0`, `day_1`, dst.) untuk lebih aman.

---

## 12. Language Switcher UI

**Tambahkan di `src/js/components/settings/settings-panel.js`**, di atas section NOTIFIKASI:

```html
<div class="settings-card-header">
    <div class="settings-card-title">BAHASA</div>
</div>
<div class="settings-item" id="language-setting-row">
    <div class="settings-item-info">
        <i class='bx bx-globe'></i>
        <span>Bahasa Aplikasi</span>
    </div>
    <div class="settings-select-trigger">
        <span id="current-lang-label">Auto</span>
    </div>
</div>
```

**Buat `src/js/components/modal/app-language-modal.js`** — modal baru (terpisah dari Quran language modal).

Pilihan diambil **langsung dari `APP_LANGUAGES`** di `config/languages.js` + entry 'Auto' di atas:

```js
import { APP_LANGUAGES } from '../../config/languages.js';

// Build options dynamically — tidak perlu diubah saat menambah bahasa baru
const options = [
    { code: 'auto', label: '🌐 Auto', desc: 'Ikuti bahasa sistem perangkat' },
    ...APP_LANGUAGES.map(l => ({ code: l.code, label: `${l.flag} ${l.label}`, desc: l.nativeLabel })),
];
```

Saat pilihan dipilih: panggil `changeLanguage(code)` dari `i18n.js`.

---

## 13. Urutan Implementasi (Phased Rollout)

Kerjakan secara berurutan agar app selalu bisa dijalankan:

1. **[Phase 1] ✅ DONE** — Install i18next → Buat `config/languages.js` → Buat `i18n.js` → Update `store.js` → Update `app.js` → Buat `common.json` (id + en)
2. **[Phase 2]** Buat file JSON terjemahan → Update `header.js` dan `nav-bar.js` (global shell) → Update `prayer-times.js` (pakai `getPrayerName`)
3. **[Phase 3]** Buat file JSON terjemahan → Update semua pages: `home-page.js`, `schedule-page.js`, `compass-page.js`, `settings-page.js`
4. **[Phase 4]** Buat file JSON terjemahan → Update semua components: cards, modals, settings panels
5. **[Phase 5]** Buat `app-language-modal.js` → Wire `settings-display-panel.js` ke `changeLanguage()`
6. **[Phase 6]** QA: test switch bahasa, test auto-detect, test persisten setelah restart

---

## 14. Checklist Verifikasi

- [ ] `npm run build` berhasil tanpa error
- [ ] Buka app dengan device bahasa Indonesia → UI tampil dalam Bahasa Indonesia
- [ ] Buka app dengan device bahasa lain → UI tampil dalam English
- [ ] Ganti bahasa di Settings → seluruh UI berubah tanpa full reload
- [ ] Pilih "Auto" → kembali ke bahasa sistem
- [ ] Force-close & restart → bahasa tetap sesuai pilihan terakhir
- [ ] Semua string sudah terjemahkan (tidak ada sisa string Indonesia hardcoded di versi EN)
- [ ] Interpolasi variabel berjalan: `{{name}}`, `{{query}}`, `{{surah}}`, `{{verse}}`
