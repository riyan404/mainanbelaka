# AGENTS.md — CCTV Monitor

Referensi cepat untuk AI coding agent (dan kontributor manusia) yang bekerja di proyek ini. Baca dokumen ini **sebelum** menulis kode.

---

## 1. Ringkasan Proyek

**CCTV Monitor** — aplikasi web lokal (LAN-only) untuk memantau live stream Hikvision (IP camera, NVR, DVR) melalui browser. Bukan alternatif Hik-Connect di internet; hanya di jaringan lokal.

Alur inti:

```
Hikvision (RTSP H.265/HEVC)
      │
      ▼
   MediaMTX ─── WebRTC ──► Browser (grid dashboard 1/4/9/16 kamera)
      ▲
      │ Control API (/v3/config/paths)
NestJS API ──► PostgreSQL (inventaris, grup, admin)
      │
      └── ISAPI Digest Auth ► Hikvision (test & detect channel)
      └── ffprobe            ► Validasi RTSP + codec check
```

Bahasa dokumen & UI: **Bahasa Indonesia**. Pertahankan gaya ini pada pesan error, label UI, komentar penting.

---

## 2. Stack Teknologi

| Layer      | Teknologi                                                                    |
| ---------- | ---------------------------------------------------------------------------- |
| Monorepo   | npm workspaces (`apps/api`, `apps/web`)                                      |
| API        | NestJS 11 + Express 5, TypeScript 5.9, Node 22+                              |
| ORM        | Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 16                               |
| Auth       | JWT di HTTP-only cookie (`cctv_session`), Argon2 password hash               |
| Crypto     | AES-256-GCM (`CredentialsService`) untuk enkripsi user/password perangkat    |
| Hikvision  | `digest-fetch` untuk ISAPI, `fast-xml-parser` untuk parsing                  |
| RTSP probe | `ffprobe` (child process) — cek codec, resolusi, fps                         |
| Media      | MediaMTX 1.20 — RTSP in, WebRTC out; dikontrol via HTTP API `:9997`          |
| Web        | Next.js 16 (App Router) + React 19, Tailwind 4, Radix UI, Lucide icons       |
| Testing    | API: Jest (`--runInBand`). Web: Vitest + Testing Library + jsdom             |
| Lint/Fmt   | ESLint 9 (flat config), Prettier 3 — **tab indent** (lihat file existing)    |

---

## 3. Struktur Direktori

```
cctv/
├─ apps/
│  ├─ api/                        NestJS backend
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma         Model DB (Admin, Device, CameraChannel, Group, CameraGroup,
│  │  │  │                        AnalyticsZone, DwellEvent, AnalyticsModuleStatus,
│  │  │  │                        ShiftSchedule, StaffFace, SystemSetting)
│  │  │  └─ migrations/           Migration SQL Prisma
│  │  └─ src/
│  │     ├─ main.ts               Bootstrap (setGlobalPrefix "api", CORS, cookies, ValidationPipe)
│  │     ├─ app.module.ts         Root module — daftar semua feature modules
│  │     ├─ auth/                 Login/logout, JWT, AuthGuard, change password
│  │     ├─ common/               CredentialsService (AES-256-GCM), domain helpers, constants
│  │     ├─ database/             PrismaService
│  │     ├─ health/               GET /api/health
│  │     ├─ hikvision/            ISAPI client (digest-fetch), parser XML, RtspProbeService (ffprobe)
│  │     ├─ devices/              CRUD perangkat + test-detect flow (dengan detectionToken TTL)
│  │     ├─ cameras/              CRUD channel, enable/disable, test ulang
│  │     ├─ groups/               Grup many-to-many + default group
│  │     ├─ dashboard/            GET /api/dashboard?groupId&page&layout — paginated cameras
│  │     ├─ streams/              POST /api/streams/:cameraId/session — create MediaMTX path + WebRTC URL
│  │     ├─ shift/                CRUD ShiftSchedule + laporan kehadiran staf (getStaffReport)
│  │     ├─ staff/                Upload/CRUD foto staf (face enrollment), settings face recognition
│  │     └─ analytics/            Zones CRUD, enable/disable, events, summary, live-state, internal worker endpoint,
│  │                                cleanup retention (@nestjs/schedule), snapshot serve
│  ├─ analytics-worker/           Python analytics worker (dwell-time module)
│  │  ├─ Dockerfile
│  │  ├─ pyproject.toml
│  │  ├─ src/
│  │  │  ├─ main.py               Entrypoint — load config, model, health, orchestrator
│  │  │  ├─ config.py             Pydantic Settings (ANALYTICS_* env vars, incl. min_dwell_seconds)
│  │  │  ├─ health.py             HTTP :9100/health server
│  │  │  ├─ mediamtx_source.py    RTSP reader dari MediaMTX sub-stream
│  │  │  ├─ frame_sampler.py      Sample 1 frame per interval
│  │  │  ├─ pipeline.py           Detect → track → zone → posture/event per kamera (mode POSE/FACE/FACE_ID)
│  │  │  ├─ zone_matcher.py       Point-in-polygon test
│  │  │  ├─ posture_classifier.py Heuristik duduk/berdiri dari YOLO11n-pose keypoints
│  │  │  ├─ event_manager.py      Buka/tutup DwellEvent, majority posture + staff_name (FACE_ID)
│  │  │  ├─ face_recognizer.py    insightface buffalo_l — enrollment sync + matching per frame
│  │  │  ├─ api_client.py         HTTP client ke NestJS internal endpoint (events, embeddings, settings)
│  │  │  └─ orchestrator.py       Sync dengan API, kelola lifecycle pipeline per kamera
│  │  ├─ run-native.sh            Jalankan worker native di macOS (CoreML, 3-4x lebih cepat dari Docker)
│  │  └─ tests/                   pytest (zone_matcher, posture_classifier, event_manager)
│  └─ web/                        Next.js frontend
│     └─ src/
│        ├─ app/
│        │  ├─ (app)/             Grup route ter-autentikasi: dashboard, devices, cameras, groups,
│        │  │                     analytics, analytics/zones, analytics/dashboard, settings,
│        │  │                     staff (face enrollment), shifts, shifts/report
│        │  ├─ login/             Halaman login
│        │  └─ api/[...path]/     Catch-all proxy → API_INTERNAL_URL (satu origin untuk cookie)
│        ├─ proxy.ts              Middleware Next: cek sesi via /api/auth/session, redirect
│        ├─ components/           camera-grid, camera-tile, device-wizard, app-sidebar,
│        │                        zone-editor/zone-editor, zone-editor/zone-canvas,
│        │                        live-tracking-overlay (overlay tracking realtime), ui/*
│        └─ lib/                  api.ts, hevc.ts, utils.ts, analytics.ts, shift.ts, staff.ts
├─ infra/mediamtx/                mediamtx.yml (prod), mediamtx.dev.yml, mediamtx.orbstack.yml
├─ docs/
│  ├─ PRD.md                       PRD MVP inti
│  ├─ PRD-dwell-time-analytics.md  PRD modul add-on analytics
│  ├─ PRD-face-recognition.md      PRD face recognition & laporan kehadiran staf
│  └─ plans/                       Rencana implementasi historis
├─ rundev.sh                       One-shot dev launcher (native, tanpa Docker) di macOS
├─ docker-compose.yml              Production stack
├─ docker-compose.dev.yml          Dev stack (OrbStack) dengan hot reload + volume mount
├─ Dockerfile.dev                  Base image untuk service dev (deps, api, web)
├─ .env.dev.example                Template env dev
└─ .env.example                    Template env prod
```

---

## 4. Model Domain (Prisma)

`apps/api/prisma/schema.prisma`:

- **Admin** — single-user auth; seeded on `AuthService.onModuleInit` dari `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- **Device** — Hikvision IP camera / NVR / DVR. Kredensial disimpan **encrypted** (`usernameEncrypted`, `passwordEncrypted`). `archivedAt` = soft delete. Unique `(host, httpPort)`.
- **CameraChannel** — 1 device → N channels. Menyimpan `mainStreamPath`, `subStreamPath` dan hasil probe (codec, resolusi, fps). Unique `(deviceId, channelNumber)`. `enabled` menentukan apakah muncul di dashboard. `availability` = `AVAILABLE|UNAVAILABLE` (ditentukan sistem, biasanya dari codec check).
- **Group** — grup kamera; `isDefault` unik-logika (di-enforce di service, bukan schema).
- **CameraGroup** — join table many-to-many `CameraChannel ↔ Group`.

- **AnalyticsZone** — poligon zona analitik per kamera. `polygon` = JSON array `[{x,y},...]` relatif 0–1. `trackPosture` = boolean apakah zona ini dianalisis posturnya.
- **DwellEvent** — satu baris per keberadaan track dalam zona. `enteredAt`→`exitedAt`, `durationSeconds`, `posture` (SITTING|STANDING|UNKNOWN), `staffName` (hasil face recognition, null jika tak dikenal/non-FACE_ID). `trackRef` = ID anonim worker, bukan identitas.
- **AnalyticsModuleStatus** — status modul analitik per kamera. `analyticsEnabled`, `analyticsMode` (POSE|FACE|FACE_ID), `workerStatus` (IDLE|RUNNING|ERROR), `lastErrorMessage`, `snapshotPath`.
- **ShiftSchedule** — jadwal shift staf: `staffName`, `cameraChannelId`, `zoneId` (opsional — null = semua zona di kamera), `startTime`/`endTime`, `notes`. Laporan kehadiran join shift → DwellEvent dengan filter identitas `staffName` (case-insensitive).
- **StaffFace** — foto staf untuk face recognition: `staffName`, `photoPath` (filesystem, bukan DB), `embedding` (base64, di-extract worker via insightface). Foto fisik di `STAFF_FACE_DIR` (default `/tmp/staff-faces`, volume `staff_faces` shared API↔worker).
- **SystemSetting** — key-value settings global: face recognition threshold (0.3–0.7), unknown retention days (default 2).

Enum: `DeviceType (IP_CAMERA|NVR|DVR)`, `ConnectionStatus (UNTESTED|ONLINE|OFFLINE|ERROR)`, `Availability (AVAILABLE|UNAVAILABLE)`, `Posture (SITTING|STANDING|UNKNOWN)`, `WorkerStatus (IDLE|RUNNING|ERROR)`, `AnalyticsMode (POSE|FACE|FACE_ID)`.

Menambah kolom/tabel:

```bash
# edit schema.prisma → generate migration
cd apps/api
npx prisma migrate dev --name deskripsi_singkat
npm run prisma:generate
```

Di container/prod pakai `prisma migrate deploy` (sudah di-wire di `rundev.sh` dan `docker-compose.dev.yml`).

---

## 5. API Contract Utama

Semua endpoint di-prefix `/api`. Endpoint selain `/api/auth/login`, `/api/auth/logout`, `/api/health` butuh cookie `cctv_session` (di-guard `AuthGuard`).

| Method | Path                              | Deskripsi                                                     |
| ------ | --------------------------------- | ------------------------------------------------------------- |
| POST   | `/api/auth/login`                 | Set cookie sesi                                               |
| POST   | `/api/auth/logout`                | Clear cookie                                                  |
| GET    | `/api/auth/session`               | Return admin session; dipakai middleware Next untuk cek login |
| PUT    | `/api/auth/password`              | Ganti password                                                |
| GET    | `/api/health`                     | Health probe                                                  |
| GET    | `/api/devices?archived=`          | List perangkat                                                |
| POST   | `/api/devices/test-detect`        | ISAPI + probe RTSP; return `detectionToken` (TTL)             |
| POST   | `/api/devices`                    | Simpan perangkat (butuh `detectionToken` valid)               |
| PUT    | `/api/devices/:id`                | Update perangkat                                              |
| POST   | `/api/devices/:id/archive`        | Arsipkan                                                      |
| POST   | `/api/devices/:id/restore`        | Pulihkan                                                      |
| POST   | `/api/devices/:id/redetect`       | Sinkron ulang channel                                         |
| DELETE | `/api/devices/:id`                | Hapus permanen                                                |
| GET    | `/api/analytics/zones?cameraId=`  | List zona analitik                                            |
| POST   | `/api/analytics/zones`            | Buat zona (polygon min 3 titik, coords 0–1)                   |
| PUT    | `/api/analytics/zones/:id`        | Update zona                                                   |
| DELETE | `/api/analytics/zones/:id`        | Hapus zona                                                    |
| POST   | `/api/analytics/cameras/:id/enable`  | Aktifkan modul analitik (buat MediaMTX always-on path)     |
| POST   | `/api/analytics/cameras/:id/disable` | Nonaktifkan modul analitik                                 |
| GET    | `/api/analytics/cameras/:id/status`  | Status worker per kamera                                   |
| GET    | `/api/analytics/cameras/statuses`    | Status semua kamera                                        |
| GET    | `/api/analytics/cameras/:id/snapshot`| Serve JPEG snapshot dari worker                            |
| GET    | `/api/analytics/events`           | Query dwell events (filter zoneId, cameraId, from, to, posture) |
| GET    | `/api/analytics/summary`          | Ringkasan: total, avg/max durasi, posture breakdown           |
| POST   | `/api/internal/analytics/events`     | **Internal only** — worker kirim batch events (X-Internal-Token) |
| GET    | `/api/internal/analytics/active-cameras` | **Internal only** — list kamera analyticsEnabled + zona  |
| POST   | `/api/internal/analytics/worker-status`  | **Internal only** — update worker status                  |
| POST   | `/api/internal/analytics/snapshot`       | **Internal only** — upload snapshot JPEG                  |
| POST   | `/api/internal/analytics/live-state`     | **Internal only** — worker kirim posisi track realtime (overlay dashboard) |
| GET    | `/api/internal/analytics/face-embeddings`| **Internal only** — semua embedding staf (worker sync)    |
| GET    | `/api/internal/analytics/face-pending`   | **Internal only** — foto staf yang belum punya embedding  |
| PUT    | `/api/internal/analytics/face-embedding/:id` | **Internal only** — update embedding hasil extract    |
| GET    | `/api/internal/analytics/face-settings`  | **Internal only** — threshold + retention settings        |
| GET    | `/api/analytics/cameras/:id/live`    | Live state tracking realtime (posisi box + staffName untuk overlay) |
| GET    | `/api/shifts?staffName=&cameraChannelId=&zoneId=&from=&to=&page=` | List shift (paginated) |
| POST   | `/api/shifts`                     | Buat shift (staffName, cameraChannelId, zoneId opsional, startTime, endTime, notes) |
| PUT    | `/api/shifts/:id`                 | Update shift                                                  |
| DELETE | `/api/shifts/:id`                 | Hapus shift                                                   |
| GET    | `/api/shifts/staff-names`         | Nama staf unik yang pernah ada shift (autocomplete)           |
| GET    | `/api/shifts/report?from=&to=&staffName=&cameraChannelId=` | Laporan kehadiran per shift (dwell time, difilter identitas staffName dari face recognition) |
| GET    | `/api/staff/faces?staffName=`     | List foto staf ter-enroll                                      |
| GET    | `/api/staff/faces/names`          | Nama staf unik yang ter-enroll (dropdown form shift)           |
| POST   | `/api/staff/faces`                | Upload foto staf (multipart, field `photo` + `staffName`)      |
| GET    | `/api/staff/faces/:id/photo`      | Serve file foto                                                |
| DELETE | `/api/staff/faces/:id`            | Hapus satu foto                                                |
| DELETE | `/api/staff/faces/by-name/:staffName` | Hapus semua foto satu staf (delete slot)                  |
| GET    | `/api/staff/settings`             | Face recognition settings (threshold, retention)               |
| PUT    | `/api/staff/settings`             | Update settings                                                |
| GET    | `/api/cameras?search=&enabled=`   | List channel                                                  |
| PUT    | `/api/cameras/:id`                | Rename/edit                                                   |
| POST   | `/api/cameras/:id/test`           | Re-probe RTSP                                                 |
| POST   | `/api/cameras/:id/enabled`        | Toggle enable                                                 |
| GET    | `/api/groups`                     | List grup                                                     |
| POST   | `/api/groups`                     | Buat grup                                                     |
| PUT    | `/api/groups/:id`                 | Rename/edit                                                   |
| DELETE | `/api/groups/:id`                 | Hapus grup                                                    |
| PUT    | `/api/groups/:id/cameras`         | Set anggota grup                                              |
| POST   | `/api/groups/:id/default`         | Set grup default                                              |
| GET    | `/api/dashboard?groupId&page&layout` | Kamera paginated by layout (1/4/9/16)                      |
| POST   | `/api/streams/:cameraId/session?quality=sub\|main` | Buat/patch path MediaMTX, return WebRTC URL  |

DTO: pakai `class-validator` (`whitelist: true, forbidNonWhitelisted: true`) — semua field yang tidak dideklarasi di DTO **akan ditolak**.

---

## 6. Frontend Model

Route dilindungi `middleware` di `apps/web/src/proxy.ts`. Middleware memanggil `/api/auth/session` (via catch-all proxy) untuk cek sesi tiap request.

Semua request ke API dari client-side pakai relative `/api/...` melalui `app/api/[...path]/route.ts` catch-all proxy. Ini memastikan:

- Cookie tetap same-origin.
- LAN devices hit `http://<mac-ip>:3417/api/...` → proxied ke `API_INTERNAL_URL` internal.
- Header `x-forwarded-host` diteruskan agar `StreamsService.buildPublicBase()` bisa membangun URL WebRTC pakai IP host aslinya (bukan `localhost`).

Streaming di grid pakai iframe/URL ke MediaMTX WebRTC endpoint (`http://<host>:8917/camera-<id>-sub?...`). Klien menolak stream jika browser tidak mendukung WebRTC H.265/HEVC (`lib/hevc.ts`) — **tidak ada fallback H.264/transcoding by design**.

---

## 7. Fitur & Konvensi Wajib

- **Hanya H.265/HEVC.** `isRequiredVideoCodec()` gate; kamera dengan codec lain di-mark `UNAVAILABLE`.
- **Enkripsi kredensial.** Semua username/password perangkat wajib melalui `CredentialsService.encrypt/decrypt`. Jangan pernah simpan plaintext ke DB.
- **Redaksi URL/password di log.** Lihat pola di `HikvisionClient.get()` dan `RtspProbeService.probe()` — password/URL RTSP di-`[REDACTED]` di error message.
- **Bahasa Indonesia** untuk error message pengguna dan label UI.
- **Tab indent** untuk TypeScript. Ikuti gaya file existing (banyak file pakai tab).
- **Nest module pattern.** Fitur baru → satu folder di `apps/api/src/<fitur>/` dengan `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`, dan `*.spec.ts`. Register di `app.module.ts`.
- **Frontend fetch wrapper.** Selalu pakai `api()` dari `apps/web/src/lib/api.ts` — sudah handle `credentials: 'include'` dan error parsing.
- **Guarded route Next.** Route baru di `app/(app)/...` otomatis kena middleware auth.

---

## 8. Environment Variables

**API** (`apps/api`):

| Var                          | Wajib | Keterangan                                                     |
| ---------------------------- | ----- | -------------------------------------------------------------- |
| `DATABASE_URL`               | ✅    | Postgres connection string                                     |
| `ADMIN_USERNAME`             | ✅    | Seeded on first boot                                           |
| `ADMIN_PASSWORD`             | ✅    | Minimal 8 karakter                                             |
| `JWT_SECRET`                 | ✅    | Signing key JWT                                                |
| `CREDENTIALS_KEY`            | ✅    | Kunci AES-256-GCM (di-hash SHA-256 internally)                 |
| `WEB_ORIGIN`                 | ✅    | Untuk CORS                                                     |
| `COOKIE_SECURE`              |       | `true` bila di belakang HTTPS reverse proxy                    |
| `API_PORT`                   |       | Default 4000                                                   |
| `MEDIAMTX_API_URL`           | ✅    | mis. `http://mediamtx:9997`                                    |
| `MEDIAMTX_PUBLIC_WEBRTC_URL` | ✅    | Fallback URL WebRTC bila `x-forwarded-host` tidak ada          |
| `MEDIAMTX_WEBRTC_PORT`       |       | Dipakai untuk merakit URL dari `x-forwarded-host`              |
| `RTSP_PROBE_TIMEOUT_MS`      |       | Default 8000                                                   |
| `DETECTION_TTL_MS`           |       | TTL cache hasil test-detect (default 600000)                   |
| `ANALYTICS_WORKER_TOKEN`     |       | Shared secret untuk internal endpoint worker→API               |
| `ANALYTICS_RETENTION_DAYS`   |       | Retensi DwellEvent (default 30)                                |
| `ANALYTICS_SNAPSHOT_DIR`     |       | Direktori snapshot (default `/tmp/snapshots`)                  |
| `STAFF_FACE_DIR`             |       | Direktori foto staf face recognition (default `/tmp/staff-faces`, volume `staff_faces` shared dengan worker) |

**Analytics Worker** (`apps/analytics-worker`):

| Var                              | Default                  | Keterangan                                    |
| -------------------------------- | ------------------------ | --------------------------------------------- |
| `ANALYTICS_API_URL`              | `http://api:4000/api`    | URL internal NestJS API                       |
| `ANALYTICS_WORKER_TOKEN`         | —                        | Shared secret (harus sama dengan API)         |
| `ANALYTICS_MODEL_PATH`           | `yolo11n-pose.pt`        | Path model YOLO                               |
| `ANALYTICS_SAMPLE_INTERVAL_MS`   | `1000`                   | Interval sample frame                         |
| `ANALYTICS_MEDIAMTX_RTSP_HOST`   | `mediamtx`               | Host MediaMTX                                 |
| `ANALYTICS_MEDIAMTX_RTSP_PORT`   | `8554`                   | Port RTSP MediaMTX                            |
| `ANALYTICS_TRACK_TIMEOUT_SECONDS`| `5.0`                    | Timeout track hilang sebelum tutup event      |
| `ANALYTICS_SNAPSHOT_DIR`         | `/tmp/snapshots`         | Direktori snapshot                            |
| `ANALYTICS_SYNC_INTERVAL_SECONDS`| `30.0`                   | Interval sync dengan API                      |
| `ANALYTICS_MIN_DWELL_SECONDS`    | `30`                     | Durasi minimum event — event lebih pendek dibuang (filter lewat) |
| `STAFF_FACE_DIR`                 | `/tmp/staff-faces`       | Direktori foto staf (shared dengan API)       |
| `ONNX_PROVIDERS`                 | —                        | Provider onnxruntime untuk insightface (mis. `CoreMLExecutionProvider,CPUExecutionProvider` saat native macOS; default CPU) |

**Web** (`apps/web`):

| Var                    | Wajib | Keterangan                                                       |
| ---------------------- | ----- | ---------------------------------------------------------------- |
| `API_INTERNAL_URL`     | ✅    | Server-side proxy target (mis. `http://api:4000/api`)            |
| `NEXT_PUBLIC_API_URL`  |       | Default `/api` (same-origin proxy)                               |
| `NEXT_ALLOWED_DEV_ORIGINS` |   | CSV IP LAN untuk HMR Next dev                                    |

Contoh lengkap: `.env.dev.example`, `.env.example`.

---

## 9. Cara Menjalankan

### Dev native (macOS, tanpa Docker) — rekomendasi harian

```bash
brew install postgresql@16 mediamtx ffmpeg   # sekali saja
bash rundev.sh                               # auto: init pg, migrate, mediamtx, api, web
```

Port default: web `3417`, api `4417`, pg `5517`, MediaMTX WebRTC `8917`. `Ctrl+C` stop semua tanpa hapus data.

### Dev Docker/OrbStack (hot reload)

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up --build
# → web http://localhost:3418, api via /api
```

Untuk perangkat LAN: pakai `http://<mac-ip>:3418`, pastikan IP-nya terdaftar di `NEXT_ALLOWED_DEV_ORIGINS` (`.env.dev`) **dan** di `webrtcAdditionalHosts` (`infra/mediamtx/mediamtx.orbstack.yml`).

### Analytics worker native di macOS (performa tinggi)

Worker analitik bisa dijalankan native (tanpa Docker) untuk akses CoreML/Apple Silicon — inference insightface 3–4x lebih cepat. Berguna saat development face recognition berat:

```bash
# Siapkan venv sekali
cd apps/analytics-worker
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install ultralytics opencv-python-headless httpx insightface onnxruntime pydantic-settings

# Stop worker di Docker, jalankan native
docker compose -f docker-compose.dev.yml --env-file .env.dev stop analytics-worker
bash run-native.sh   # aktifkan CoreML via ONNX_PROVIDERS, API → localhost:4418
```

Perlu port RTSP MediaMTX `8554` di-expose ke host (sudah ditambahkan di `docker-compose.dev.yml`).

### Production

```bash
cp .env.example .env && edit .env
docker compose up -d --build
```

---

## 10. Testing & Verifikasi

Selalu jalankan sebelum commit / PR:

```bash
npm run lint         # workspace-wide
npm run typecheck    # workspace-wide
npm test             # api: jest --runInBand, web: vitest run
npm run build        # nest build + next build
docker compose config   # validasi compose (kalau ubah)
```

Test files:

- API: `*.spec.ts` co-located (contoh: `hikvision.parser.spec.ts`, `streams.service.spec.ts`, `cameras.service.spec.ts`, `domain.spec.ts`, `health.controller.spec.ts`).
- Web: `*.test.tsx` di `components/` (contoh: `camera-grid.test.tsx`, `camera-tile.test.tsx`) — Vitest + Testing Library + jsdom (`vitest.config.ts`, `vitest.setup.ts`).

**Tambah fitur = tambah test.** Minimal: unit test service (mock Prisma) dan/atau component test untuk perilaku UI baru.

---

## 11. Menambah Fitur — Checklist

Saat kamu (user) minta fitur baru, alur standarnya:

**Backend (Nest):**

1. Kalau butuh persistensi baru: edit `prisma/schema.prisma` → `prisma migrate dev --name <nama>` → `prisma:generate`.
2. Buat modul baru di `apps/api/src/<fitur>/` (module, controller, service, dto, spec).
3. Register modul di `app.module.ts`.
4. Kalau butuh auth: `@UseGuards(AuthGuard)` di controller.
5. Validasi input via `class-validator` DTO — inget `forbidNonWhitelisted: true`.
6. Kalau butuh kredensial device: pakai `CredentialsService` (encrypt saat simpan, decrypt saat pakai).
7. Kalau butuh env var baru: dokumentasikan di `.env.example` **dan** `.env.dev.example`, tambah ke `docker-compose.yml` / `docker-compose.dev.yml`, tambah ke section §8 di file ini.
8. Tambah spec (unit test service).

**Frontend (Next):**

1. Route baru: `apps/web/src/app/(app)/<segment>/page.tsx` — otomatis kena auth middleware.
2. Panggil API pakai `api()` helper — path relatif tanpa origin.
3. Komponen di `components/`; komponen shared di `components/ui/`.
4. Sidebar: kalau perlu link nav baru, edit `apps/web/src/components/app-sidebar.tsx`.
5. Styling: Tailwind 4 + `globals.css` (banyak class utility custom di sana; cek dulu).
6. Tambah `*.test.tsx` untuk komponen kompleks.

**Cross-cutting:**

- Update dokumentasi di `docs/` bila menambah kontrak besar (PRD, plan).
- Jangan buka RTSP/NVR ke internet — asumsi LAN-only tetap.
- Kalau menyentuh MediaMTX config: sinkronkan 3 file (`mediamtx.yml`, `mediamtx.dev.yml`, `mediamtx.orbstack.yml`).
- Jaga tidak-ada-transcode dan hanya-HEVC.

---

## 12. Gotcha & Catatan Historis

- **`x-forwarded-host` propagation** krusial untuk streaming di LAN device. `StreamsController.create()` sudah baca dan pass ke service; middleware di `web/src/app/api/[...path]/route.ts` set headernya. Jangan hapus.
- **`detectionToken` flow.** `POST /api/devices/test-detect` menyimpan hasil di in-memory `Map` (`DevicesService.pending`) dengan TTL. `POST /api/devices` menuntut token yang cocok **dan** payload koneksi identik — kalau user edit form setelah test, wajib test ulang. Behavior ini disengaja untuk mencegah simpan device tanpa verifikasi.
- **MediaMTX path create-or-patch.** `StreamsService.createSession()` coba `POST /v3/config/paths/add/<path>`, kalau 409/gagal fallback ke `PATCH /v3/config/paths/patch/<path>`. Ini idempoten by design.
- **Fullscreen switch main stream.** `CameraTile` otomatis switch `quality` ke `main` saat masuk fullscreen dan balik ke `sub` saat keluar. Perilaku ini di-drive event `fullscreenchange` — hati-hati kalau modif komponen tile.
- **Prisma 7 + adapter-pg.** Bukan Prisma 5 klasik; ada `prisma.config.ts` di `apps/api/`. Perintah lama (`prisma db push` dsb) tetap bekerja tapi cek dokumen Prisma 7 kalau ragu.
- **Nest CLI + workspace.** Perintah dev api: `npm run dev --workspace @cctv/api`. Nama workspace pakai scope `@cctv/*` (bukan folder-name).

---

## 13. Yang Tidak Boleh Dilakukan

- ❌ Bikin fallback H.264 atau transcoding di server.
- ❌ Simpan kredensial device plaintext.
- ❌ Buka MediaMTX / DB / API ke internet publik.
- ❌ Tambah endpoint tanpa `AuthGuard` (kecuali `/auth/login`, `/auth/logout`, `/health`, dan endpoint internal worker `/api/internal/analytics/*` yang pakai `AnalyticsInternalGuard`).
- ❌ Simpan gambar/frame/video orang di database atau disk (prinsip privasi modul analitik).
- ❌ Hardcode `localhost` di URL yang diserve ke client — pakai `x-forwarded-host` atau env var.
- ❌ `docker compose down -v` di production (menghapus volume Postgres).
- ❌ Commit `.env`, `.env.dev`, `.pi/`, `.dev/`, `.pi-subagents/`, `.playwright-mcp/`, `auto.crt`, `auto.key`.

---

## 14. Referensi Cepat

- PRD MVP inti: `docs/PRD.md`
- PRD modul dwell-time analytics (add-on): `docs/PRD-dwell-time-analytics.md`
- PRD face recognition & laporan kehadiran: `docs/PRD-face-recognition.md`
- Plan historis: `docs/plans/`
- Plan implementasi analytics: `docs/plans/2026-08-11-dwell-time-analytics.md`
- README onboarding: `README.md`
- Dev launcher: `rundev.sh`
