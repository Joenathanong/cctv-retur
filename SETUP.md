# Warehouse CCTV Return System — Setup Guide

## Prasyarat

| Software | Versi | Download |
|----------|-------|----------|
| Node.js  | 18+   | https://nodejs.org |
| FFmpeg   | 6+    | https://ffmpeg.org/download.html |

FFmpeg **harus** ditambahkan ke Windows PATH agar bisa dipanggil sebagai `ffmpeg` dari mana saja.

---

## Struktur Folder Sistem

```
D:\CCTV_Recording\
├── CAM01\
│   └── 2026-07-06\
│       ├── 0800.mp4
│       ├── 0830.mp4
│       └── ...
├── CAM02\
├── CAM03\
├── CAM04\
├── Export\
│   └── SPX123456.mp4
├── Database\
│   └── warehouse.db
├── Excel\
│   └── ScanLog.xlsx
└── Logs\
    ├── record.log
    └── error.log
```

---

## Langkah Install

### 1. Edit Konfigurasi

Buka `config\config.json` dan sesuaikan:

```json
{
  "cameras": {
    "CAM01": {
      "ip": "192.168.1.101",   ← IP kamera EZVIZ C6N
      "username": "admin",
      "password": "password_kamera"
    }
  },
  "userCameraMapping": {
    "Bongkar01": "CAM01",      ← Nama user dari Excel → ID kamera
    "Bongkar02": "CAM02"
  },
  "recording": {
    "baseDir": "D:\\CCTV_Recording",
    "retentionDays": 30        ← Video otomatis dihapus setelah 30 hari
  }
}
```

**RTSP URL EZVIZ C6N:**
```
rtsp://admin:PASSWORD@IP:554/h264/ch1/main/av_stream
```

Sesuaikan `rtspPath` jika berbeda. Bisa ditest dulu di VLC → Media → Open Network Stream.

### 2. Install Dependencies

```
install.bat
```

### 3. Test Jalankan

```
start.bat
```

Buka browser: **http://localhost:3000**

### 4. Setup Auto-Start Windows (Wajib untuk operasional)

Jalankan **sebagai Administrator**:
```
setup-autostart.bat
```

Setelah ini, sistem akan otomatis berjalan setiap Mini PC dinyalakan/restart.

---

## Format Excel

File Excel yang diimport harus memiliki kolom (nama kolom bisa dikonfigurasi):

| Resi   | User      | Scan Time           |
|--------|-----------|---------------------|
| SPX001 | Bongkar01 | 08:15:10            |
| SPX002 | Bongkar01 | 08:15:42            |

Kolom `Scan Time` bisa berformat:
- `HH:mm:ss` → tanggal pakai tanggal hari import
- `YYYY-MM-DD HH:mm:ss` → tanggal eksplisit
- Excel datetime serial (otomatis terdeteksi)

---

## Cara Penggunaan

### Import Data Scan Harian
1. Buka **Import Excel**
2. Drag & drop file Excel dari sistem scan PDT
3. Klik **Import Excel**
4. Data scan + kalkulasi waktu start/end tersimpan otomatis

### Search & Export Video Resi
1. Buka **Search Resi**
2. Masukkan nomor resi (misal: `SPX001`)
3. Klik **Cari** → sistem menampilkan info + status video
4. Klik **Export Video** → FFmpeg memotong video segment → hasilkan `SPX001.mp4`
5. Klik **Download** untuk mengunduh file

### Monitor Kamera
- **Dashboard**: status ringkas semua kamera + storage
- **Camera Status**: detail per kamera, tombol start/stop manual

---

## Logika Waktu Video

```
Excel Row:
  Resi=SPX001  User=Bongkar01  Scan=08:15:10
  Resi=SPX002  User=Bongkar01  Scan=08:15:42

Hasil:
  SPX001 → Start: 08:15:10  End: 08:15:42  (scan berikutnya user sama)
  SPX002 → Start: 08:15:42  End: 08:15:42+30det (scan terakhir user = + default duration)
```

Default duration (scan terakhir) dapat diubah di config: `recording.defaultLastDurationSeconds`

---

## Port

| Service  | Port | URL |
|----------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend  | 3001 | http://localhost:3001 |

Untuk akses dari komputer lain di LAN: ganti `localhost` dengan IP Mini PC.

---

## Troubleshoot

**Kamera tidak connect:**
- Test RTSP URL di VLC dulu
- Cek IP, username, password di config
- Pastikan kamera dan Mini PC satu subnet
- Pastikan firewall tidak memblokir port 554

**FFmpeg tidak ditemukan:**
- Pastikan FFmpeg ada di PATH: buka CMD → ketik `ffmpeg -version`
- Jika tidak ada, download dari https://www.gyan.dev/ffmpeg/builds/ (Windows build)
- Extract ke `C:\ffmpeg\` → tambahkan `C:\ffmpeg\bin` ke Environment Variables → PATH

**Video tidak bisa diekspor:**
- Pastikan recording sudah berjalan saat jam scan di Excel
- Cek tab Storage → breakdown untuk verifikasi file ada
- Cek tab Log untuk error detail
