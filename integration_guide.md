# Panduan Integrasi Notifikasi Profesional (Satu Ramadhan)

Dokumen ini disusun khusus bagi **Developer** maupun **AI Agent** yang akan mengimplementasikan pembaruan sistem notifikasi dan sinkronisasi jadwal sholat pada aplikasi *Satu Ramadhan*.

Tujuan utama pengembangan ini adalah menciptakan **Jaring Pengaman Absolut** yang menjamin aplikasi *selalu* memberikan notifikasi sholat akurat 100% tanpa batas hari. Sistem dirancang sangat cerdas untuk mendeteksi perpindahan astronomis pengguna secara pasif di *background*, tanpa terjadi *false positive* (notifikasi palsu/spam akibat selisih koordinat akurat GPS vs letak kota JSON).

**Wajib** bagi setiap AI Agent / Developer pelaksana untuk **melakukan analisis dan investigasi kode saat ini secara menyeluruh**. Anda diizinkan berimprovisasi jika menemukan kejanggalan demi mencapai kestabilan optimal.

---

## Prinsip Dasar Pengembangan (Wajib Dipatuhi)

1. **Clean Code & DRY Principle**: Kode harus modular. Jangan mereplika fungsi kalkulasi waktu sholat atau fungsi perhitungan jarak (*haversine*) yang sudah ada di `src/js/core/`.
2. **Hierarki Kejelasan Eksekusi**: Urutan *import*, inisialisasi *service*, dan *callback* harus disusun ketat karena *Android AlarmManager* dan *Background Worker* sangat rentan *racing conditions*.
3. **Pemisahan Modul**: Rutinitas logika sinkronisasi diekstrak ke dalam filenya sendiri (contoh: `src/js/modules/notification/notification-sync.js`). File asisten seperti `native-notification.js` hanya mengatur interaksi dasar ke Native Plugin.
4. **Manual Testing Only**: AI Agent/Dev dilarang menulis *Automated Test* atau mencoba mem-*build* sendiri dalam lingkungan ini. Pengujian komprehensif sepenuhnya akan dilakukan secara manual oleh *User*.

---

## Memahami Arsitektur Lokasi Saat Ini (Core Location)

Sebelum mengembangkan fitur notifikasi, pengembang harus menyadari bagaimana aplikasi *Satu Ramadhan* menangani lokasi (berdasarkan `src/js/core/geolocation.js` & `location-search.js`):
- Aplikasi mencari lokasi dengan Capacitor Geolocation (GPS akurat).
- Koordinat GPS *tidak langsung* digunakan untuk jadwal. Aplikasi melakukan fungsi *Haversine* untuk mencari `regency.json` (Centroid/Pusat Kota) **terdekat** dari titik GPS tersebut.
- Koordinat `regency` (Centroid) inilah yang kemudian disimpan ke `Storage` lokal (`user_location`) dan digunakan untuk menarik data waktu sholat.
- Jika pengguna mencari manual (via Nominatim API), koordinat asli Nominatim yang akan ditelan bulat-bulat sebagai centroid kota tersebut.

---

## FASE 1: "30-Days Rolling Pre-Scheduling" (Jaring Pengaman Pertama)

**Konteks**: Menyediakan stok alarm sholat untuk sebulan penuh agar notifikasi tahan offline berminggu-minggu.

### Ruang Lingkup Eksekusi Fase 1:
1. **Modul Tersentralisasi**: Di `notification-sync.js`, buat logika kalkulasi jadwal dari hari ini (`today`) hingga `today + 29 hari`.
2. **Jadwal 7 Waktu Komprehensif**: Jadwal meliputi 5 Sholat Wajib dan 2 Pengingat (Imsak & Terbit).
3. **Continuous Foreground Sync**: Kaitkan ke *Event App Open / Resume*. Saat aplikasi diletakkan ke muka pengguna, bersihkan seluruh 210 alarm lama dari memori sistem, lalu suntikkan 210 jadwal 30 hari yang baru.
4. **The "Anchor" Location (Jangkar)**: 
   Saat Javascript mengirim 210 alarm ke Native Plugin, JavaScript juga harus menitipkan 1 data krusial:
   - `anchor_lat` / `anchor_lon`: Koordinat yang SAAT INI tersimpan di Storage lokal (`user_location`). Ini adalah koordinat centroid JSON / Nominatim yang sedang aktif dipegang oleh pengguna.
   *Sistem Native Java WAJIB menyimpan jangkar ini di SharedPreferences-nya sendiri.*

---

## FASE 2: Passive Background Detection & The "Khatulistiwa Rule"

Fase ini mendeteksi perpindahan pengguna secara pasif di latar belakang (Piggybacking OS), tanpa menyalakan modul GPS aktif yang menguras baterai.

**Analisis False Positive**: 
Jika Pengguna A tinggal di pinggiran kabupaten X yang sangat luas, GPS HP-nya bisa berjarak 40 km dari Titik Pusat (Centroid) kabupaten X tempat ia bernaung. Jika sistem background tidak diberi toleransi yang luar biasa lebar, ia akan mengira Pengguna A "Kabur Keluar Kota" padahal ia hanya sedang duduk di teras rumahnya.

### Solusi Saintifik: "The Astronomical 50-Km Rule"
Berdasarkan investigasi batas kota `regency.json`, jarak antar kota berdekatan bisa serapat 2 Km (Serang), yang artinya tidak bisa dipakai sebagai batas aman.
Sebagai gantinya, kita gunakan pergeseran bumi sebagai batas aman:
- Bumi berputar ≈111 km setiap 4 menit waktu matahari.
- Jika pengguna bergeser sejauh **50 Km**, jadwal sholat baru berubah sekitar **1.8 Menit** (kurang dari 2 menit).

Angka **50 Kilometer** sangat ideal sebagai `Safe Radius`. Selama pengguna beraktivitas di dalam gelembung radius 50 km (sekalipun itu melintasi dua kabupaten berdekatan), jadwal sholatnya hampir tidak berubah secara signifikan, aplikasi tidak akan mengganggu mereka.

### Ruang Lingkup Eksekusi Fase 2:
1. **The "Piggybacking" Worker (Native Java)**:
   Buat sistem Android `WorkManager` pasif (misal `LocationDetectWorker.java`). Secara natural (diatur OS baterai) menarik letak pengguna dari cache Android (tanpa request GPS baru).
2. **Kalkulator Jarak Jangkar (Anchor Distance)**:
   Worker Java menghitung jarak *Haversine*:
   `Last Known Location (Cache OS)` VS `anchor_lat/anchor_lon (Centroid dari Fase 1)`.
3. **Parameter "Astronomical Threshold" (50 KM)**:
   - Jika `Jarak < 50 Km`: Aplikasi **ABAIKAN**. Waktu sholat pengguna masih sangat akurat (< 2 menit selisih).
   - Jika `Jarak >= 50 Km`: Aplikasi terpicu. Pengguna dipastikan bepergian antar provinsi atau mudik jauh.
4. **Push Notification Himbauan Lokal**:
   Begitu terpicu (> 50 km), keluarkan Notifikasi Push Text:
   *“Nampaknya lokasi Anda telah berubah. Ketuk untuk membuka aplikasi.”*
5. **The Golden Anti-Spam (Cooldown)**:
   Setelah notifikasi terkirim, kunci (disable) layanan "Pendeteksi Pindah Kota" ini selama **24 jam** ke depan. (*User Experience adalah Mutlak*; Jangan biarkan aplikasi mem-bom notifikasi "Ubah Lokasi").
6. **Trigger Eksekusi Akhir (Menyambung Fase 1)**:
   Jika pengguna merespons notifikasi (klik masuk app), aplikasi Capacitor terbuka, memicu GPS Foreground yang baru, menentukan Centroid baru, dan menjadwalkan ulang 210 alarm dari posisi barunya.

---

## Langkah Spesifik AI Agent Saat Inisiasi Mendatang

1. Baca dan pahami `native-notification.js`, file Plugin Java (`PrayerServicePlugin`), serta cara kerja file di `src/js/core/` (seperti `geolocation.js`).
2. Integrasi Fase 1 (`notification-sync.js`): Bangun loop 30 Hari dan pastikan logic pengiriman parameter *Anchor Location* ke Java aman.
3. Java Plugin Modification: Pastikan `PrayerServicePlugin` diatur untuk menampung *payload* masif 210 item sekaligus, dan menyalin `anchor_lat`/`anchor_lon` ke `SharedPreferences` untuk tugas Sang Worker.
4. Integrasi Fase 2 (`WorkManager` Java): Implementasikan perhitungan jarak minimal **50 KM** yang wajib dilengkapi dengan fitur *Cooldown Timer 24 Jam*.

AI Agent memiliki wewenang analitik penuh untuk memodifikasi struktur ini jika dirasa ada *Best Practices Native* dan *Web* yang lebih sempurna (Misal: memindahkan deteksi Worker murni ke logic plugin). Selamat mengamankan ibadah pengguna!
