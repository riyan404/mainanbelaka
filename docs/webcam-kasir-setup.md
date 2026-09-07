# Setup Webcam PC Kasir — Panduan Lengkap

Panduan ini menjelaskan cara menghubungkan webcam di PC kasir ke sistem CCTV Monitor
untuk memantau kehadiran kasir per shift.

---

## Arsitektur

```
Webcam (USB/built-in) di PC kasir
         ↓
   ffmpeg (jalan di host OS)
         ↓ RTSP push
   MediaMTX (container Docker)
         ↓ RTSP sub-stream
   Analytics Worker (container Docker)
         ↓ DwellEvent + postur
   API + Database
         ↓
   Dashboard laporan shift
```

Worker tidak perlu diubah. Webcam dibaca ffmpeg di host lalu di-push ke MediaMTX
sebagai stream RTSP biasa — worker memperlakukannya sama seperti kamera IP.

---

## Langkah 1: Install ffmpeg

### macOS

```bash
brew install ffmpeg
```

### Windows

```powershell
# Pilih salah satu:
winget install ffmpeg
# atau
choco install ffmpeg
```

Verifikasi: `ffmpeg -version`

---

## Langkah 2: Pastikan Docker Services Jalan

```bash
cd /path/to/cctv-monitor
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d
```

MediaMTX harus running dan port 8954 terbuka (RTSP).

---

## Langkah 3: Jalankan ffmpeg Bridge

### macOS

```bash
cd scripts/webcam-bridge
chmod +x mac-push.sh

# Lihat webcam yang tersedia, lalu push
./mac-push.sh -s kasir-1              # webcam pertama → slot "kasir-1"
./mac-push.sh -i 1 -s kasir-2        # webcam index 1 → slot "kasir-2"
```

### Windows (PowerShell)

```powershell
cd scripts\webcam-bridge

# Lihat webcam, lalu push
.\windows-push.ps1 -SlotName "kasir-1"
.\windows-push.ps1 -CameraIndex 1 -SlotName "kasir-2"
```

Script otomatis mendaftar webcam yang tersedia dan memilih sesuai index.

Stream muncul di MediaMTX sebagai: `rtsp://localhost:8954/webcam-kasir-1`

---

## Langkah 4: Daftarkan sebagai Kamera di UI

1. Buka `http://localhost:3418/devices` → **Tambah Perangkat**
2. Isi:
   - **Nama**: `PC Kasir 1`
   - **Tipe**: `IP_CAMERA`
   - **Host**: `host-gateway` (Docker internal) atau IP host LAN (mis. `192.168.1.10`)
   - **RTSP Port**: `8954`
   - **Username/Password**: kosong
3. **Tambah Channel** untuk device tersebut:
   - **Channel 1** (atau nomor bebas)
   - **Nama**: `Webcam Kasir 1`
   - **Main Stream Path**: `/webcam-kasir-1`
   - **Sub Stream Path**: `/webcam-kasir-1` (sama — webcam tidak punya sub-stream)
4. **Enable** kamera

### Catatan host Docker

| Deployment | Host untuk akses MediaMTX dari container |
| --- | --- |
| Docker Desktop (Windows/Mac) | `host.docker.internal` |
| OrbStack (Mac) | `host.orb.internal` |
| Linux native | `172.17.0.1` (docker0 gateway) |

---

## Langkah 5: Aktifkan Analytics di Kamera Webcam

1. Buka `http://localhost:3418/analytics`
2. Cari kamera `Webcam Kasir 1` → klik **Aktifkan**
3. Buka **Zone Editor** → gambar zona kecil di area depan layar monitor
   - Rekomendasi: buat 1 zona berbentuk persegi yang mencakup area wajah/dada kasir
   - Centang **Track Postur** jika ingin data duduk/berdiri
4. Simpan zona

Worker otomatis mulai mendeteksi dalam <30 detik (sync interval).

---

## Langkah 6: Input Jadwal Shift

1. Buka `http://localhost:3418/shifts` → **Tambah Shift**
2. Isi nama kasir, pilih kamera webcam, tentukan jam mulai/selesai
3. Simpan

---

## Langkah 7: Lihat Laporan

Buka `http://localhost:3418/shifts/report`:

- Pilih rentang tanggal
- Filter per nama staf atau kamera
- Lihat **% kehadiran efektif** per shift vs total durasi shift
- Export CSV untuk rekap bulanan

---

## Autostart ffmpeg Bridge

### Windows — Task Scheduler (autostart saat login)

```powershell
$action  = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -File C:\cctv\scripts\webcam-bridge\windows-push.ps1 -SlotName kasir-1"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask `
    -TaskName "CCTV Webcam Bridge Kasir-1" `
    -Action $action -Trigger $trigger -Settings $settings `
    -RunLevel Highest -Force
```

### macOS — launchd (autostart saat login)

Buat file `~/Library/LaunchAgents/com.cctv.webcam-kasir1.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>           <string>com.cctv.webcam-kasir1</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/path/to/cctv/scripts/webcam-bridge/mac-push.sh</string>
    <string>-s</string><string>kasir-1</string>
  </array>
  <key>RunAtLoad</key>       <true/>
  <key>KeepAlive</key>       <true/>
  <key>StandardErrorPath</key>  <string>/tmp/cctv-webcam-kasir1.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.cctv.webcam-kasir1.plist
```

---

## Troubleshooting

| Masalah | Penyebab | Solusi |
| --------- | ---------- | -------- |
| `Connection refused rtsp://localhost:8954` | MediaMTX belum jalan | `docker compose up mediamtx` |
| Tidak ada orang terdeteksi | Zona terlalu kecil / confidence terlalu tinggi | Perbesar zona, turunkan `ANALYTICS_DETECTION_CONF_THRESHOLD` ke `0.25` |
| Laporan shift menunjukkan 0% | Zona belum digambar / analytics belum aktif | Cek halaman analytics, pastikan zona ada dan worker RUNNING |
| Webcam tidak muncul di daftar ffmpeg | Izin kamera belum diberikan | macOS: System Settings → Privacy → Camera; Windows: Settings → Privacy → Camera |
| Stream putus-putus | Bandwidth / CPU tinggi | Turunkan resolusi: `-v 320x240`, frame rate: `-r 5` |
| `Device busy` di Linux/WSL2 | Device dipakai proses lain | `fuser /dev/video0` untuk cek proses, lalu kill |
