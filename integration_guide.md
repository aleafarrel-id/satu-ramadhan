# Panduan Integrasi Fitur Al-Quran (Design-Driven Approach)

Dokumen ini adalah panduan strategis (roadmap) untuk mengintegrasikan fitur Al-Quran secara bertahap ke dalam aplikasi Satu Ramadhan. Sesuai prinsip **Design-Driven App**, fokus utama adalah membangun dan mematangkan *User Interface (UI)* dan *User Experience (UX)* terlebih dahulu sebelum logika aplikasi (state management, audio, dll) diintegrasikan.

Kode harus mematuhi prinsip **DRY (Don't Repeat Yourself)**, **Clean Code**, dan hierarki yang rapi agar maintainable.

---

## Fase 1: Fondasi UI & Navigasi (Aktif)
Fokus pada pembuatan kerangka halaman yang terisolasi dari navigasi global aplikasi. Halaman Al-Quran harus terasa "immersive" dan bebas distraksi.

### Tujuan Utama:
1.  **Navigasi Global Tersembunyi:** Saat masuk ke *route* `/quran`, `#app-header` dan `#bottom-nav` utama harus disembunyikan.
2.  **Navigation Dock Khusus (Bawah):** Membangun *bottom nav* baru khusus Al-Quran dengan 4 tombol:
    *   `<i class='bx bx-book-content'></i>` (Daftar Surah)
    *   `<i class='bx bx-book-open'></i>` (Mode Baca/Ayat)
    *   `<i class='bx bxs-book-bookmark'></i>` (Bookmark)
    *   `<i class='bx bx-cog'></i>` (Pengaturan)
3.  **Header Khusus (Atas):** Membangun *header* *compact* dengan tombol kembali (`<i class='bx bx-chevron-left'></i>`) dan judul "Al-Qur'an".
4.  **Tema & Identitas:** Menggunakan warna dasar putih tulang/terang untuk area baca, namun tetap menyuntikkan aksen "Teal and Gold" pada navigasi, ikon aktif, dan elemen interaktif lainnya untuk mempertahankan identitas aplikasi.

### Komponen yang Terlibat:
*   `src/js/router.js` (Logika hide/show global nav).
*   `src/js/pages/quran-page.js` (Struktur HTML/DOM injection).
*   `src/css/quran.css` (Styling khusus).

---

## Fase 2: Desain Tampilan Daftar Surah
Fokus pada me-render data statis dari JSON menjadi daftar UI (List/Cards) yang elegan dan rapi.

### Tujuan Utama:
1.  **Data Fetching Basic:** Membaca data dari `public/quran/surah.json`.
2.  **Surah Card UI:** Membuat desain *list item* per surah yang memuat:
    *   Nomor surah dengan ornamen/border Teal/Gold.
    *   Judul surah (Latin) & Detail (Makkiyah/Madaniyah, Jumlah Ayat).
    *   Judul surah (Arab) menggunakan font kaligrafi dekoratif `DecoType-Thuluth-II-Regular.ttf`.
3.  **Clean Code / DRY:** Memastikan fungsi *render* di-loop dengan efisien menggunakan template literal, dan class CSS dapat digunakan berulang (reusable).

### Komponen yang Terlibat:
*   `src/js/pages/quran-page.js` (Fungsi `fetch` dan DOM builder).
*   `src/css/quran.css` (Styling flexbox/grid untuk *cards*).

---

## Fase 3: Desain Mode Baca (Surah Detail)
*Fase ini baru dimulai setelah Fase 1 & 2 disetujui secara visual.*

Fokus pada mendesain halaman "Baca", di mana ayat-ayat sebenarnya ditampilkan. Pastikan *font* (`LPMQ-IsepMisbah.ttf`), *line-height*, dan warna nyaman untuk dibaca.

### Tujuan Utama:
1.  **Font & Typography:** Memuat font Al-Quran offline dan mengatur styling CSS yang sangat *readable*.
2.  **Layout Per Ayat:** Desain penyajian teks Arab, Terjemahan, dan Transliterasi (opsional).
3.  **Action Menu Ayat:** Desain tombol interaktif per ayat (Copy, Share, Bookmark).

---

## Fase 4: Integrasi Fitur Lanjutan (Logic)
*Fase ini akan dikerjakan setelah keseluruhan UI/UX (Fase 1-3) 100% selesai dan mantap.*

### Tujuan Utama:
1.  **State Management:** Mengatur memori terakhir dibaca (Bookmark).
2.  **Settings (Pengaturan):** Logika untuk mengubah ukuran font atau berganti Mode Baca (Light/Dark/Sepia).
3.  **Search & Filter:** Fitur pencarian surah (berdasarkan nama Latin atau Arab).

---

*Catatan: File ini akan terus diperbarui (updated) seiring transisi antar fase.*
