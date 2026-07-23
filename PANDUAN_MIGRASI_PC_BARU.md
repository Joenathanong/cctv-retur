# Panduan Migrasi CCTV System ke PC Baru
**Spesifikasi PC Baru:** Intel i7 Gen 12 · GeForce RTX 3060 · RAM 16 GB · Storage 3 TB

---

## Ringkasan Langkah

1. Install prasyarat di PC baru
2. Pindah folder project (kode)
3. Pindah data rekaman (opsional)
4. Sesuaikan konfigurasi
5. Test koneksi dan recording
6. Aktifkan NVENC (GPU encoding)

---

## TAHAP 1 — Install Prasyarat di PC Baru

### 1.1 Node.js
- Download: https://nodejs.org (pilih LTS)
- Verifikasi: buka CMD → `node -v` dan `npm -v`

### 1.2 FFmpeg (dengan dukungan NVENC)
FFmpeg build standar dari ffmpeg.org sudah include NVENC secara default.

```
1. Download: https://www.gyan.dev/ffmpeg/builds/
   → pilih "  .zip"
2. Extract ke C:\ffmpeg\
   Struktur akhir: C:\ffmpeg\bin\ffmpeg.exe
3. Verifikasi di CMD:
   C:\ffmpeg\bin\ffmpeg.exe -encoders | findstr nvenc
   → Harus muncul: V..... h264_nvenc
```

### 1.3 NVIDIA Driver
- Pastikan driver NVIDIA sudah terinstall dan up-to-date
- Download: https://www.nvidia.com/drivers
- Verifikasi: `nvidia-smi` di CMD → harus muncul info GPU

---

## TAHAP 2 — Pindah Kode Program

### Opsi A: Copy Folder Langsung (Direkomendasikan)
Di Mini PC, copy seluruh folder project:
```
Sumber:  [lokasi project di Mini PC]\CCTV Return\
Tujuan:  C:\Users\[Username]\Claude\Projects\CCTV Return\
         C:\Users\Jonathan  \Claude\Projects\CCTV Return
```
Cara: Salin via USB flashdisk, atau share folder lewat jaringan.

### Opsi B: Lewat Jaringan (jika kedua PC terhubung)
Di Mini PC — buka CMD:
```cmd
net share CCTV="C:\Users\EJI\Claude\Projects\CCTV Return" /GRANT:Everyone,READ
```
Di PC Baru — buka File Explorer:
```
\\[IP_MINI_PC]\CCTV
```
Copy ke lokasi tujuan di PC baru.

### Install Dependencies
Setelah folder ter-copy, buka CMD di PC baru:
```cmd
cd "C:\Users\Jonathan\Claude\Projects\CCTV Return\backend"
npm install

cd "C:\Users\Jonathan\Claude\Projects\CCTV Return\frontend"
npm install
```

---

## TAHAP 3 — Pindah Data Rekaman (Opsional)

Data rekaman ada di `D:\CCTV_Recording\` di Mini PC.

**Jika ingin lanjutkan data lama di PC baru:**
- Copy seluruh folder `D:\CCTV_Recording\` ke PC baru (drive D: atau sesuai kebutuhan)
- Ini termasuk: folder rekaman per kamera, database SQLite, file export

**Jika ingin mulai fresh:**
- Skip langkah ini, biarkan sistem membuat folder baru otomatis

> Catatan: File database ada di `D:\CCTV_Recording\Database\warehouse.db` — ini berisi seluruh resi dan log scan. Pindahkan jika tidak ingin kehilangan riwayat.

---

## TAHAP 4 — Sesuaikan Konfigurasi

Edit file: `config\config.json`

### 4.1 Path yang perlu disesuaikan

```json
{
  "recording": {
    "baseDir": "D:/CCTV_Recording"       ← sesuaikan dengan drive PC baru
  },
  "export": {
    "dir": "D:/CCTV_Recording/Export"
  },
  "database": {
    "path": "D:/CCTV_Recording/Database/warehouse.db"
  },
  "logs": {
    "dir": "D:/CCTV_Recording/Logs"
  },
  "excel": {
    "watchDir": "D:/CCTV_Recording/Excel"
  },
  "ffmpeg": {
    "path": "C:\\ffmpeg\\bin\\ffmpeg.exe"  ← pastikan path FFmpeg benar
  }
}
```

### 4.2 Aktifkan NVENC (GPU Encoding)

```json
"compression": {
  "enabled": true,
  "encoder": "nvenc",
  "resolution": "original",
  "crf": 28,
  "preset": "fast"
}
```

Pengaturan yang direkomendasikan untuk RTX 3060:
- `encoder`: `"nvenc"` — gunakan GPU, bukan CPU
- `resolution`: `"original"` — tidak perlu downscale, GPU kuat
- `crf`: `28` — kualitas sedang, file lebih kecil ~35%
- `preset`: `"fast"` (= NVENC p4) — balance kualitas/kecepatan

---

## TAHAP 5 — Update start.bat

Buka `start.bat` dan sesuaikan path jika berbeda:
```bat
cd /d "C:\Users\[Username]\Claude\Projects\CCTV Return"
```

---

## TAHAP 6 — Jalankan dan Test

### 6.1 Jalankan Program
```
Klik kanan start.bat → Run as Administrator
```

### 6.2 Verifikasi NVENC Aktif
Lihat di log — harus muncul:
```
[CAM01] Compression ON (NVENC GPU): res=original cq=28 preset=p4
[CAM01] Starting FFmpeg: ... -hwaccel cuda ... -c:v h264_nvenc ...
```

### 6.3 Jika NVENC Gagal
Jika muncul error `NVENC not supported` atau `No NVENC capable device found`:
- Pastikan driver NVIDIA terinstall (cek `nvidia-smi`)
- Pastikan FFmpeg build mendukung NVENC (`ffmpeg -encoders | findstr nvenc`)
- Fallback: ubah `encoder` ke `"software"` di config, atau matikan compression

---

## TAHAP 7 — Firewall PC Baru

Jalankan perintah ini di CMD sebagai Administrator agar bisa diakses dari PC lain:

```cmd
netsh advfirewall firewall add rule name="CCTV Frontend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="CCTV Backend" dir=in action=allow protocol=TCP localport=3001
```

---

## TAHAP 8 — Update Akses dari PC Lain

Setelah PC baru berjalan, update URL akses di browser semua PC lain:
```
http://[IP_PC_BARU]:3000
```
IP PC baru akan terlihat di CMD: `ipconfig` → cari IPv4 Address.

---

## Perbandingan Mini PC vs PC Baru

| Aspek              | Mini PC (lama)         | PC Baru (i7 + RTX 3060)     |
|--------------------|------------------------|-------------------------------|
| Encoding           | libx264 (CPU berat)    | h264_nvenc (GPU, CPU ~0%)     |
| Max kamera aktif   | 1 (sering DC)          | 4+ tanpa masalah              |
| Kompresi real-time | Sering drop koneksi    | Stabil, GPU dedicated encode  |
| Ukuran file        | Besar (stream copy)    | ~35-50% lebih kecil (cq=28)  |
| Storage 3 TB       | —                      | ~6-8 bulan rekaman 4 kamera   |

---

## Checklist Migrasi

- [ ] Node.js terinstall di PC baru (`node -v`)
- [ ] FFmpeg terinstall di `C:\ffmpeg\bin\` (`ffmpeg.exe -version`)
- [ ] Driver NVIDIA up-to-date (`nvidia-smi`)
- [ ] Folder project ter-copy ke PC baru
- [ ] `npm install` selesai di backend dan frontend
- [ ] `config.json` sudah disesuaikan (path, encoder: nvenc)
- [ ] Data rekaman ter-copy (jika perlu)
- [ ] `start.bat` berhasil dijalankan
- [ ] Log menunjukkan `NVENC GPU` saat compression aktif
- [ ] Kamera berhasil connect dan rekam
- [ ] Bisa diakses dari PC lain di jaringan
- [ ] Firewall rule sudah ditambahkan
