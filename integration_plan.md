# Panduan Integrasi: Dukungan Kalender Hijriah Sepanjang Tahun & Best Practices

## Tujuan Utama
Mengubah aplikasi "Satu Ramadhan" agar dapat berfungsi dinamis sepanjang tahun dengan mengikuti urutan kalender Hijriah, bukan hanya terkunci pada bulan Ramadhan. 

Aplikasi akan tetap menggunakan sistem *preset* (NU, Muhammadiyah, dll) sebagai "jangkar" atau titik patokan offset Hijriah pada tahun berjalan. Setelah bulan Ramadhan selesai, jadwal 30 hari pada halaman jadwal akan secara otomatis bergeser ke bulan-bulan Hijriah berikutnya (Syawal, Dzulqa'dah, dst.) secara berkelanjutan (tiap bulan mengambil 29/30 hari berdasar kalender Hijriah sebenarnya).

---

## Prinsip Pengembangan yang WAJIB Diterapkan (Developer / AI Agent)

1. **DRY (Don't Repeat Yourself):**
   - **Gunakan Fungsi Eksisting:** Pada pengambilan data jadwal bulanan, **WAJIB** gunakan fungsi `getMonthlyPrayerTimes` yang sudah ada di `src/js/core/api.js`. Fungsi tersebut sudah memiliki sistem *caching*, pembatasan percobaan otomatis (*retry with backoff*), dan sinkronisasi lintas-*mirror*. Dilarang membuat fungsi `fetch` HTTP baru di tingkat komponen.

2. **Clean Code & Pemisahan Tanggung Jawab (Separation of Concerns):**
   - **Logika Data (`schedule-data.js`):** Modul ini hanya bertugas mengalkulasi dan menyiapkan struktur *array* tanggal yang akan dirender (mencari `startDate`, mencocokkan kalender Gregorian dan Hijriah, menghitung jumlah hari). Jangan menyentuh elemen antarmuka (DOM) di sini.
   - **Manajemen Preset (`ramadhan.js`):** Modul ini digunakan untuk menentukan patokan *preset* aktif dan selisih hari (*offset*) Hijriahnya dibandingkan dengan kalender astronomis standar.
   - **Logika Tampilan (`schedule-card.js` & `calendar-modal.js`):** Mutlak hanya bertugas me-*render* tampilan HTML berdasarkan *state* atau *data object* yang disuplai oleh `schedule-data.js`. Tidak boleh ada komputasi pergeseran penanggalan berat di *file* UI ini.

3. **Tanpa Hardcoding (No Hardcoding):**
   - **Hapus Teks Statis "Ramadan":** Kata "Ramadan" yang saat ini ditulis langsung (statik) pada bagian *Title* halaman jadwal dan *Header Modal Calendar* **WAJIB** dihapus.
   - **Gunakan Teks Dinamis:** Format tanggal harus membaca nama bulan Hijriah saat itu secara dinamis yang diekstrak dari data API Aladhan (melalui `timings.hijri.month.en` atau versi translasi Indonesia-nya).
   - Format judul yang diharapkan: `${hijriDay} ${hijriMonthName} ${hijriYear}` (Contoh: "15 Syawal 1447").

4. **Hierarki & Kerapian Kode:**
   - Jaga agar arsitektur file tetap *modular*. Pastikan *import* disusun dengan rapi (dikelompokkan berdasarkan sumber: `core/`, `modules/`, lalu `components/`).
   - Gunakan nama fungsi dan variabel yang deskriptif dan mencerminkan apa yang dilakukan (misalnya `computeHijriMonthDates` mungkin lebih relevan dibandingkan fungsi lama `computeRamadhanDates` yang segera usang).

5. **Kebijakan Testing & Build Server (PENTING):**
   - **Dilarang Melakukan Automated Build/Test:** Eksekusi, kompilasi (`npm run build`), pengujian aplikasi (*testing*), atau verifikasi di level peramban (_browser verification_) dilakukan **sepenuhnya secara MANUAL oleh Pengguna/Klien**. 
   - Agen AI **TIDAK PERLU** menjalankan skrip *build* atau berinisiatif membuka alamat `localhost`. Fokuslah 100% dari kapabilitas Anda pada analisis, rekonstruksi kode, perbaikan alur logika, dan pengaplikasian prinsip *Clean Code* di atas.

---

## Status Sistem Saat Ini (Hasil Investigasi)
1. **Notifikasi dan Halaman Beranda**: Berjalan normal di luar bulan Ramadhan karena menggunakan `new Date()` (hari ini) secara dinamis saat mengambil jadwal harian. **(Tidak perlu diubah signifikan dari sisi penanggalan)**.
2. **Halaman Jadwal (30 Hari)**: Terkunci (statis). Merender urutan tanggal di antara `startDate` dan `endDate` dari dokumen *preset* `ramadhan.json`. Jika hari ini sudah di luar rentang tanggal tersebut, antarmuka akan keliru menyorot "Hari ke-1 Ramadhan".
3. **Modal Kalender**: Sama dengan Jadwal 30 Hari; menggunakan `startDate` - `endDate` Ramadhan.
4. **Data Integrasi**: Aplikasi sudah menerima balasan _objek_ `date.hijri` dari server API Aladhan pada struktur API saat ini.

---

## Langkah Implementasi Teknis (Action Plan)

### Langkah 1: Refaktor Modul `schedule-data.js`
- Ubah fungsi/algoritma yang saat ini menghitung rentang *statis* dari *preset* (seperti `computeRamadhanDates`).
- Buat agar modul ini mendeteksi jatuhnya tanggal kalender Hijriah *untuk hari ini* menggunakan API Aladhan.
- Tentukan awal (Tanggal 1) dan akhir (Tanggal 29/30) dari bulan Hijriah berjalan saat ini dengan memadukan data Gregorian.
- Kembalikan (_return_) *array of objects* di mana setiap elemen memuat kelengkapan data harian termasuk *field* khusus `hijriDay`, `hijriMonthName`, dan `hijriYear`.

### Langkah 2: Sinkronisasi Offset via *Preset* di `ramadhan.js`
- Karena standar API Aladhan murni berdasarkan kalkulasi astronomis, dan kalender di Indonesia (NU/Muhammadiyah) menggunakan metode Rukyat/Hisab lokal, kalibrasi *offset* tetap harus merujuk pada `startDate` *preset* awal (Ramadhan tahun berjalan).
- Agent/Developer harus menentukan logika offset: Membandingkan awal Ramadhan (1 Ramadhan) versi API astronomis versus 1 Ramadhan berdasar `startDate` *preset*. Selisih hari (misal +1 atau -1) ini lalu diaplikasikan ke seluruh perhitungan awal bulan-bulan di sisa tahun tersebut.

### Langkah 3: Penataan Ulang UI Kombinasi Dinamis (`schedule-card.js` & `calendar-modal.js`)
- Tinjau ulang `titleEl.textContent` dalam file `src/js/components/card/schedule-card.js`. Ubah agar merangkai *string* dengan menggunakan `hijriDay`, `hijriMonthName`, `hijriYear`.
- Tinjau ulang struktur *header* dari *Grid System* yang ada di `src/js/components/modal/calendar-modal.js`. Pastikan judul tidak lagi menampilkan `Ramadan ${tahunHijriah}`, namun bergeser menyesuaikan bulan yang dominan di blok jadwal 30 hari tersebut.

---
**Catatan untuk AI Agent / Developer:**
Implementasikan perubahan ini selangkah demi selangkah. Setelah mengubah satu modul utama (`schedule-data.js`), verifikasilah arsitekturalnya (baca file, pastikan _return variable_ dapat melayani komponen hilir) sebelum memodifikasi blok perender UI-nya. Tetap patuhi pedoman *Clean Code* dan serahkan proses validasi akhir UI/UX kepada Pengguna.
