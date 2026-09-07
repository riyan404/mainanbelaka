# Webcam Bridge — ffmpeg → MediaMTX

Push webcam lokal (USB, built-in, capture card) ke MediaMTX supaya
Analytics Worker bisa membacanya persis seperti kamera RTSP biasa.

## Cara Kerja

```
Webcam (OS)
    ↓  ffmpeg (jalan di host, BUKAN di container)
MediaMTX  →  path: webcam-kasir-1  (port RTSP 8954)
    ↓
Analytics Worker  (baca sebagai RTSP biasa)
    ↓
DwellEvent, postur, overlay realtime
```

## Setup Awal

### macOS

```bash
brew install ffmpeg
```

### Windows

```powershell
winget install ffmpeg
# atau
choco install ffmpeg
```

---

## Menjalankan Bridge

### macOS

```bash
# Webcam pertama, slot "kasir-1"
./mac-push.sh

# Webcam index lain
./mac-push.sh -i 1

# Nama slot custom (untuk PC kasir berbeda)
./mac-push.sh -s kasir-2

# MediaMTX di host LAN lain
./mac-push.sh -h 192.168.1.10 -s kasir-3
```

### Windows (PowerShell)

```powershell
# Webcam pertama
.\windows-push.ps1

# Webcam index lain
.\windows-push.ps1 -CameraIndex 1

# Nama slot custom
.\windows-push.ps1 -SlotName "kasir-2"

# MediaMTX di host LAN lain
.\windows-push.ps1 -MediaMtxHost 192.168.1.10 -SlotName "kasir-3"
```

---

## Mendaftarkan Webcam Sebagai Kamera di Sistem

Setelah bridge berjalan, webcam muncul sebagai stream RTSP di MediaMTX.
Daftarkan sebagai kamera baru di UI CCTV Monitor:

| Field          | Nilai                                          |
|----------------|------------------------------------------------|
| Tipe Device    | `IP_CAMERA` (pilih sementara)                  |
| Host           | `host-gateway` atau IP host Windows/Mac        |
| RTSP Port      | `8954`                                         |
| Main Stream    | `/webcam-kasir-1`                              |
| Sub Stream     | `/webcam-kasir-1` (sama, tidak ada sub-stream) |
| Username/Pass  | kosong                                         |

Setelah didaftarkan:

1. Aktifkan Analytics di kamera tersebut
2. Buka Zone Editor → gambar 1 zona kecil pas di area depan layar monitor
3. Worker otomatis mulai deteksi — DwellEvent tercatat tiap orang berada di zona

---

## Multi-Kasir

Jalankan script terpisah per PC kasir dengan slot berbeda:

**PC Kasir 1** (Windows):

```powershell
.\windows-push.ps1 -CameraIndex 0 -SlotName "kasir-1"
```

**PC Kasir 2** (Windows):

```powershell
.\windows-push.ps1 -CameraIndex 0 -SlotName "kasir-2"
```

Setiap slot muncul sebagai stream independen di MediaMTX.

---

## Autostart (Opsional)

### Windows — Task Scheduler

```powershell
# Buat task yang otomatis jalan saat login
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
           -Argument "-NonInteractive -File C:\cctv\scripts\webcam-bridge\windows-push.ps1 -SlotName kasir-1"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "CCTV Webcam Bridge Kasir-1" -Action $action -Trigger $trigger -RunLevel Highest
```

### macOS — LaunchAgent

```bash
# Buat file ~/Library/LaunchAgents/com.cctv.webcam-kasir1.plist
# (lihat contoh di scripts/webcam-bridge/com.cctv.webcam-kasir1.plist.example)
launchctl load ~/Library/LaunchAgents/com.cctv.webcam-kasir1.plist
```

---

## Troubleshooting

| Masalah | Solusi |
| --------- | -------- |
| `ffmpeg: command not found` | Install ffmpeg (brew/winget) |
| `Connection refused` ke MediaMTX | Pastikan Docker services jalan (`docker compose up mediamtx`) |
| Webcam tidak muncul di daftar | Izinkan akses kamera di System Settings (macOS) atau Device Manager (Windows) |
| Frame hitam / no video | Coba index kamera berbeda (`-i 1`, `-i 2`) |
| Stream putus-putus | Tambah `-rtsp_transport tcp` sudah default, coba turunkan resolusi (`-v 320x240`) |
| Latency tinggi | Kurangi `-r` frame rate ke 5 fps (cukup untuk analitik) |
