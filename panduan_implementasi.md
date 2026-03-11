# Panduan Implementasi Fitur Pengaturan Notifikasi dan Suara Adzan

Dokumen ini berisi panduan mendalam tentang bagaimana mengimplementasikan fitur pengaturan notifikasi (menghidupkan/mematikan notifikasi) dan suara adzan (menghidupkan/mematikan adzan) pada aplikasi Satu Ramadhan.

## 1. Analisis Arsitektur Saat Ini

- **Frontend (Capacitor JS)**: Aplikasi saat ini mengelola state pengaturan notifikasi di `src/js/components/settings/settings-panel.js` dengan menyimpannya di `localStorage` (key: `satu_ramadhan_notif` dan `satu_ramadhan_adzan`). Frontend akan menjadwalkan notifikasi menggunakan fungsi `schedulePrayerNotifications(timings)` di `src/js/modules/notification/native-notification.js`.
- **Backend (Android / Java)**: Bagian ini sangat solid! Plugin Capacitor custom (`PrayerServicePlugin.java`) menyimpan alarm yang masuk dari JS dan meneruskannya ke Android Service. Yang paling penting, receiver alarm native (`PrayerAlarmReceiver.java`) **sudah memiliki logika** untuk mengecek apakah suatu alarm harus menggunakan suara Adzan panjang atau hanya notifikasi standar (melalui parameter `isAdzan`).

### Keputusan Desain (Clean Code & DRY)
Karena Java code sudah mendukung pengecekan `isAdzan`, **kita TIDAK PERLU mengubah kode Java (native Android)** sama sekali. Ini membuat implementasi ini sangat bersih (Clean Code) dan mengikuti prinsip DRY (Don't Repeat Yourself), karena semua sumber kebenaran (Source of Truth) pengaturan dikendalikan oleh layer JS (Capacitor JS) saat penjadwalan.

---

## 2. Langkah-langkah Implementasi

### A. Membersihkan Kode Tak Terpakai di `native-notification.js`
Di file `src/js/modules/notification/native-notification.js`, terdapat konstan pengaturan `PREF_KEYS` yang sebenarnya sudah tidak terpakai, karena kita akan langsung membaca dari UI/localStorage.

**Langkah:** 
Hapus blok kode berikut (sekitar baris 107-114):
```javascript
/**
 * Preferences keys — prepared for future toggle features.
 * Not actively used in UI yet, but the module respects them.
 */
const PREF_KEYS = {
    NOTIFICATION_ENABLED: 'notif_enabled',
    ADZAN_SOUND_ENABLED: 'adzan_sound_enabled',
};
```

### B. Modifikasi Logika Penjadwalan di `native-notification.js`
Kita perlu mengubah fungsi `schedulePrayerNotifications(timings)` agar membaca pengaturan dari `localStorage` sebelum menyusun daftar alarm untuk dikirimkan ke layer Native.

**Langkah:**
Ubah implementasi `schedulePrayerNotifications`:
1. Baca status notifikasi (`satu_ramadhan_notif`). Jika "false", maka jalankan `cancelAllPrayerNotifications()` lalu langsung `return` (jangan jadwalkan apa-apa).
2. Baca status adzan (`satu_ramadhan_adzan`). Jika "false", maka pada saat mendaftarkan alarm ke array `alarmsToSchedule`, ubah parameter `isAdzan` menjadi `false`.

**Contoh Kode:**
```javascript
export async function schedulePrayerNotifications(timings) {
    if (!Capacitor.isNativePlatform() || !_initialized) return;
    if (!timings) return;

    // 1. Baca pengaturan dari localStorage
    const isNotifEnabled = localStorage.getItem('satu_ramadhan_notif') !== 'false';
    const isAdzanEnabled = localStorage.getItem('satu_ramadhan_adzan') !== 'false';

    try {
        await cancelAllPrayerNotifications();

        // Jika notifikasi dimatikan sepenuhnya, berhentikan proses di sini
        if (!isNotifEnabled) {
            console.log('[NativeNotif] Notifikasi dimatikan sepenuhnya oleh pengguna.');
            return;
        }

        const now = new Date();
        const alarmsToSchedule = [];

        PRAYER_KEYS.forEach((key, index) => {
            const timeStr = timings[key];
            if (!timeStr) return;

            const date = parseTimeToDate(timeStr);
            if (!date || date <= now) return; // Skip waktu di masa lalu

            const config = PRAYER_NOTIFICATION_MAP[key];
            if (!config) return;

            // 2. Terapkan konfigurasi suara adzan
            // Jika isAdzanEnabled false, kita timpa pengaturan isAdzan dari config bawaan agar Native hanya menampilkan Notifikasi Teks.
            const shouldPlayAdzan = config.isAdzan && isAdzanEnabled;

            alarmsToSchedule.push({
                id: getNotificationId(index),
                key: key,
                title: config.title,
                body: config.body,
                isAdzan: shouldPlayAdzan, // <--- Ini bagian kunci
                timestamp: date.getTime()
            });
        });

        // Jadwalkan ke plugin native
        if (alarmsToSchedule.length > 0) {
            await PrayerService.schedule({ alarms: alarmsToSchedule });
            console.log(`[NativeNotif] Scheduled ${alarmsToSchedule.length} native alarms`);
        }
    } catch (e) {
        console.error('[NativeNotif] Scheduling failed:', e);
    }
}
```

### C. Update Penjadwalan Setiap Pengaturan Berubah
Saat ini di `src/js/components/settings/settings-panel.js`, ketika pengaturan diubah (di-klik togglenya), state hanya disimpan ke `localStorage`, tapi alarm/notifikasi native-nya belum diupdate karena sistem belum diberitahu bahwa state telah berubah.

**Langkah:**
Pada masing-masing fungsi _event listener_ (`change`) untuk `toggle-notification` dan `toggle-adzan` di `settings-panel.js`:
1. Simpan perubahan ke `localStorage`.
2. Dapatkan data `timings` waktu sholat hari ini (misalnya dengan mengambil data dari memori aplikasi/state yang ada).
3. Panggil ulang `schedulePrayerNotifications(timings)` agar Native Android segera membatalkan alarm sebelumnya dan menjadwalkan yang baru berdasarkan pilihan User terbaru.

**Konsep Perubahannya:**
```javascript
// Di settings-panel.js
import { schedulePrayerNotifications } from '../../modules/notification/native-notification.js';
// (Anda mungkin perlu mendapatkan timings dari state global manapun yang menyimpannya hari ini)

notificationToggle?.addEventListener('change', (e) => {
    localStorage.setItem('satu_ramadhan_notif', e.target.checked);
    // Contoh pemanggilan: (pastikan Anda mendapat object 'timings' saat ini)
    if (window.currentTimings) {
        schedulePrayerNotifications(window.currentTimings);
    }
});

adzanToggle?.addEventListener('change', (e) => {
    localStorage.setItem('satu_ramadhan_adzan', e.target.checked);
    if (window.currentTimings) {
        schedulePrayerNotifications(window.currentTimings);
    }
});
```

---

## 3. Kesimpulan

Dengan arsitektur ini:
- Kita **tidak menyentuh/mengubah kode Java sama sekali**.
- Kode JS bertugas cerdas untuk menjadi jembatan konfigurasi UI (`localStorage`) dan payload yang dikirim ke layar Native.
- Jika pengguna ubah _setting_ "Hidupkan Suara Adzan" menjadi _off_, maka UI akan meneruskannya ke Native Android dengan flag `isAdzan: false`, yang secara otomatis akan dilarikan ke `showStandardNotification()` oleh file Java bawaan `PrayerAlarmReceiver`.
- Memenuhi prinsip clean code dan DRY di mana UI state terenkapsulasi dengan pengiriman logic di JS Service tanpa melakukan rekursi berulang di Native layer.
