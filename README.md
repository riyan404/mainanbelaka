# CCTV Monitor

Web lokal untuk memantau Hikvision IP camera, NVR, dan DVR melalui ISAPI, RTSP H.265/HEVC, MediaMTX, dan WebRTC.

## Status

MVP scaffold mencakup:

- Satu akun admin dari `.env`.
- Test dan deteksi perangkat Hikvision melalui ISAPI Digest Auth.
- Probe main/sub RTSP memakai `ffprobe`.
- Inventaris channel, enable/disable, grup many-to-many, dan grup default.
- Dashboard layout 1/4/9/16.
- Sub-stream pada grid, main stream saat fullscreen.
- UI control-room monokrom responsif.
- Docker Compose untuk macOS development dan Windows deployment.

## Persyaratan

- Node.js 22+
- npm 10+
- Docker Desktop hanya untuk mode Docker
- PostgreSQL 16, MediaMTX, dan FFmpeg/ffprobe untuk development native tanpa Docker
- Kamera/NVR harus memakai H.265/HEVC pada main dan sub-stream
- Browser dan perangkat client harus mendukung WebRTC H.265/HEVC; tidak ada H.264 atau transcoding

## Development native tanpa Docker

Pada macOS, instal runtime lokal sekali:

```bash
brew install postgresql@16 mediamtx ffmpeg
```

Lalu jalankan:

```bash
bash rundev.sh
```

Script membuat `.env.dev`, menginisialisasi PostgreSQL terisolasi di `.dev/postgres`, menjalankan migrasi, MediaMTX, API, dan frontend. `Ctrl+C` menghentikan semua proses tanpa menghapus data.

Port khusus development:

```text
Web:          http://localhost:3417
API:          http://localhost:4417/api
PostgreSQL:   127.0.0.1:5517
MediaMTX RTSP :8517
MediaMTX WebRTC: http://localhost:8917
MediaMTX API: 127.0.0.1:9917
```

Ubah port atau kredensial development di `.env.dev`.

## Menjalankan semua lewat Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Hentikan tanpa menghapus data:

```bash
docker compose down
```

Jangan memakai `docker compose down -v` kecuali data PostgreSQL memang ingin dihapus.

## Deployment Windows

1. Instal Docker Desktop dan aktifkan WSL2.
2. Salin folder proyek ke PC Windows.
3. Salin `.env.example` menjadi `.env`.
4. Ganti seluruh password dan secret.
5. Atur `MEDIAMTX_PUBLIC_WEBRTC_URL` ke IP LAN PC Windows, misalnya `http://192.168.1.20:8889`.
6. Atur `NEXT_PUBLIC_API_URL` ke IP LAN PC, misalnya `http://192.168.1.20:4000/api`.
7. Jalankan:

```powershell
docker compose up -d --build
```

Akses dari perangkat LAN melalui `http://192.168.1.20:3000`.

## Integrasi Hikvision

RTSP path mengikuti pola standar:

```text
Channel 1 main: /Streaming/Channels/101
Channel 1 sub:  /Streaming/Channels/102
Channel 2 main: /Streaming/Channels/201
Channel 2 sub:  /Streaming/Channels/202
```

ISAPI endpoint yang dicoba:

```text
/ISAPI/System/deviceInfo
/ISAPI/ContentMgmt/InputProxy/channels
/ISAPI/Streaming/channels
```

Firmware Hikvision berbeda dapat memberi XML berbeda. Uji perangkat fisik tetap wajib sebelum deployment.

## Verifikasi

```bash
npm run lint
npm run typecheck
npm test
npm run build
docker compose config
```

## Keamanan

- Jangan membuka RTSP/NVR ke internet.
- Ganti secret default `.env`.
- Kredensial perangkat dienkripsi AES-256-GCM.
- Password admin di-hash Argon2.
- RTSP URL berkredensial hanya dikirim backend ke MediaMTX Control API.
- Gunakan akun Hikvision read-only bila memungkinkan.
