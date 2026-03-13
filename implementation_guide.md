# Panduan Implementasi Ihtiyat (Penyesuaian Waktu Sholat)

Dokumen ini adalah panduan yang ditujukan untuk AI Agent (atau developer) guna mengimplementasikan **Ihtiyat** (penyesuaian waktu sholat Kemenag RI, +2 menit untuk setiap waktu sholat, dan Imsak = Subuh - 10 menit).

## 1. Latar Belakang & Analisis
Berdasarkan investigasi terhadap *codebase*:
- Aplikasi menggunakan data waktu sholat dari **Aladhan API** via `src/js/core/api.js`.
- Respons Aladhan memiliki format `"HH:mm"` atau terkadang `"HH:mm (WIB)"`.
- Data API tersebut dikonsumsi oleh dua sisi utama:
  1. **UI Jadwal** (`schedule-page.js` via `schedule-data.js`).
  2. **Notifikasi** (`notification-sync.js` yang secara proaktif menjadwalkan alarm 30 hari ke depan).
- Mengingat prinsip **DRY (Don't Repeat Yourself)** dan *clean code*, tempat paling ideal untuk menyuntikkan (intercept) logika Ihtiyat adalah langsung pada fungsi parsing di **`src/js/core/api.js`** (`transformTimings` dan `transformMonthlyData`).
- Dengan cara ini, UI jadwal harian, bulanan, dan juga waktu triger notifikasi adzan otomatis terpengaruh tanpa perlu mengubah logika UI atau `notification-sync.js` sama sekali.

## 2. Rencana Implementasi

### Langkah 1: Buat Fungsi Utilitas Penambah Waktu
Lokasi: `src/js/utils/datetime.js`

Tambahkan fungsi khusus bernama `adjustTimeStr` untuk menjumlahkan/mengurangkan menit ke format waktu `"HH:mm"`.

```javascript
/**
 * Menambahkan atau mengurangkan menit pada string waktu ("HH:mm" atau "HH:mm (WIB)").
 * Fungsi ini mengabaikan suffix zona waktu dan selalu mengembalikan "HH:mm".
 *
 * @param {string} timeStr - Contoh: "04:30" atau "04:30 (WIB)"
 * @param {number} minutesToAdd - Jumlah menit untuk ditambahkan (bisa negatif)
 * @returns {string} Contoh: "04:32"
 */
export function adjustTimeStr(timeStr, minutesToAdd) {
    if (!timeStr) return timeStr;
    const cleanTime = timeStr.toString().replace(/\s*\(.*\)/, '').trim();
    const [hours, mins] = cleanTime.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(mins)) return timeStr;

    // Gunakan objek Date sembarang untuk menangani rollover jam
    const d = new Date(2000, 0, 1, hours, mins, 0);
    d.setMinutes(d.getMinutes() + minutesToAdd);

    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    
    return `${h}:${m}`;
}
```

### Langkah 2: Terapkan Ihtiyat di Pusat Transformasi API
Lokasi: `src/js/core/api.js`

1. Impor utilitas waktu di bagian atas file:
   ```javascript
   import { adjustTimeStr } from '../utils/datetime.js';
   ```

2. Modifikasi `transformTimings` untuk menerapkan Ihtiyat. (Catatan: Waktu **Terbit** tidak ditambahkan Ihtiyat karena berdasarkan astronomi murni).
   ```javascript
   function transformTimings(apiData, dateStr) {
       const timings = apiData.data.timings;
       
       // Ihtiyat: +2 Menit untuk seluruh waktu sholat (Kecuali Terbit)
       const subuh = adjustTimeStr(timings.Fajr, 2);
       const terbit = timings.Sunrise; // Waktu asli astronomi
       const dzuhur = adjustTimeStr(timings.Dhuhr, 2);
       const ashar = adjustTimeStr(timings.Asr, 2);
       const magrib = adjustTimeStr(timings.Maghrib, 2);
       const isya = adjustTimeStr(timings.Isha, 2);
       
       // Imsak: Subuh - 10 Menit
       const imsak = adjustTimeStr(subuh, -10);

       return {
           imsak,
           subuh,
           terbit,
           dzuhur,
           ashar,
           magrib,
           isya,
           date: dateStr,
           hijri: apiData.data.date.hijri,
       };
   }
   ```

3. Lakukan hal yang senada pada file yang sama di dalam `transformMonthlyData`:
   ```javascript
   function transformMonthlyData(apiDays) {
       return apiDays.map(day => {
           const t = day.timings;
           
           const subuh = adjustTimeStr(t.Fajr, 2);
           const terbit = t.Sunrise; // Waktu asli astronomi
           const dzuhur = adjustTimeStr(t.Dhuhr, 2);
           const ashar = adjustTimeStr(t.Asr, 2);
           const magrib = adjustTimeStr(t.Maghrib, 2);
           const isya = adjustTimeStr(t.Isha, 2);
           const imsak = adjustTimeStr(subuh, -10);

           return {
               imsak,
               subuh,
               terbit,
               dzuhur,
               ashar,
               magrib,
               isya,
               date: day.date.gregorian.date,
               weekday: day.date.gregorian.weekday,
               gregorian: day.date.gregorian,
               hijri: day.date.hijri,
           };
       });
   }
   ```

## 3. Instruksi Testing Manual
Karena aplikasi masih dalam tahap *development*, pengujian manual dapat dilakukan sebagai berikut:
1. Pastikan ekstensi waktu pada perangkat disinkronkan dengan internet.
2. Bersihkan *storage* (cache) pada browser/device Anda agar data API diambil ulang dan menggunakan logika penyesuaian yang baru.
3. Buka halaman utama aplikasi dan cek kartu Jadwal Sholat hari ini. Cocokkan nilainya dengan website resmi Bimas Islam (Kemenag) atau Aladhan API mentahnya. Contoh: Jika di Aladhan Subuh adalah 04:30, di aplikasi harus tampil `04:32`. Imsaknya harus selalu `04:22`. Waktu Terbit harus sama dengan API (tanpa penambahan +2 menit).
4. Cobalah mengatur Alarm/Adzan aktif dari ikon *Setting*. Cek Log console, proses *Notification Sync* (`[NotifSync]`) harus menunjukkan alarm dijadwalkan pada jam yang sesuai dengan *offset* baru.
