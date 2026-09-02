# Dwell-Time Analytics Module — Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Menambahkan modul analitik dwell-time & postur duduk sebagai service terpisah dari MVP CCTV Monitor, tanpa mengubah kontrak MVP yang sudah berjalan.

**Architecture:** Analytics Worker Python (YOLO11n-pose + ByteTrack) sebagai container terpisah, menarik sub-stream dari MediaMTX, menjalankan pipeline detect→track→zone→posture, lalu mengirim event agregat (tanpa gambar) ke NestJS API. Backend menyimpan `AnalyticsZone`, `DwellEvent`, `AnalyticsModuleStatus` di PostgreSQL. Frontend menambah halaman "Analitik" untuk CRUD zona, aktivasi modul, dan dashboard riwayat dwell-time.

**Tech Stack:** Python 3.12 + Ultralytics YOLO11n-pose + ByteTrack + OpenCV (worker), NestJS 11 + Prisma 7 + @nestjs/schedule (API), Next.js 16 + React 19 (web), Docker Compose (orchestration).

**Decisions (from clarifications):**

1. Windows deployment target (Docker Desktop + WSL2), PC min 4 core modern.
2. Model: YOLO11n-pose (Ultralytics).
3. MediaMTX path: **Opsi B** — always-on path `analytics-camera-<id>-sub` dengan `sourceOnDemand: false` saat analytics enabled (worker tidak bergantung viewer frontend).
4. Pose classification: **Heuristik geometri sederhana** dari keypoint ratio/angle. Di bawah confidence threshold → `UNKNOWN`.
5. Zone editor preview: **Opsi C** — worker menyimpan 1 JPEG snapshot saat pertama connect, disajikan via API endpoint.
6. Worker location: `apps/analytics-worker/`.
7. Auth internal: shared secret `X-Internal-Token` header + Docker IP check ganda.
8. `AnalyticsZone.polygon`: Prisma `Json` column.
9. Event batch: flush tiap 5 detik atau buffer ≥50 event.
10. Retensi `DwellEvent`: `@nestjs/schedule` cron tiap jam.
11. Worker test: pytest + pytest-asyncio, mock video reader.
12. Migration: generate langsung saat Fase B.
13. Eksekusi: Fase A+B sekaligus.
14. Icon sidebar: `Activity` dari Lucide.
15. Worker health: HTTP `:9100/health`.
16. Env prefix: `ANALYTICS_*`.

---

## Fase A — Worker Skeleton

### Task 1: Scaffold `apps/analytics-worker/`

**Files:**

- Create: `apps/analytics-worker/Dockerfile`
- Create: `apps/analytics-worker/pyproject.toml`
- Create: `apps/analytics-worker/requirements.txt` (pinned)
- Create: `apps/analytics-worker/src/__init__.py`
- Create: `apps/analytics-worker/src/config.py`
- Create: `apps/analytics-worker/src/main.py`

**Steps:**

1. `pyproject.toml` — Python 3.12, dependencies: `ultralytics>=8.3`, `opencv-python-headless`, `httpx`, `pydantic-settings`, `pytest`, `pytest-asyncio`.
2. `config.py` — Pydantic Settings untuk semua `ANALYTICS_*` env vars: `API_URL`, `WORKER_TOKEN`, `MODEL_PATH` (default `yolo11n-pose.pt`), `SAMPLE_INTERVAL_MS` (default 1000), `SNAPSHOT_DIR` (default `/tmp/snapshots`), `LOG_LEVEL`.
3. `main.py` — skeleton entrypoint: load config, init model, start health server pada `:9100`, log "worker ready". Belum connect ke MediaMTX atau API.
4. `Dockerfile` — base `python:3.12-slim`, install requirements, copy src, CMD `python -m src.main`.

### Task 2: Health endpoint + Docker Compose integration

**Files:**

- Create: `apps/analytics-worker/src/health.py`
- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.yml`
- Modify: `.env.dev.example`
- Modify: `.env.example`

**Steps:**

1. `health.py` — aiohttp/http.server lightweight `GET /health` → `{"status":"ok","model_loaded":bool}`.
2. Tambah service `analytics-worker` di kedua compose files: build dari `apps/analytics-worker/Dockerfile`, depends_on `mediamtx` + `api`, network internal.
3. Tambah env vars ke `.env.dev.example` dan `.env.example`: `ANALYTICS_WORKER_TOKEN`, `ANALYTICS_MODEL_PATH`, `ANALYTICS_SAMPLE_INTERVAL_MS`, `ANALYTICS_RETENTION_DAYS`.
4. `docker compose config` validasi.

## Fase B — Schema Prisma + CRUD Zona

### Task 3: Prisma schema + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Generate: migration SQL

**Schema additions:**

```prisma
enum Posture {
  SITTING
  STANDING
  UNKNOWN
}

enum WorkerStatus {
  IDLE
  RUNNING
  ERROR
}

model AnalyticsZone {
  id              String        @id @default(cuid())
  cameraChannelId String
  name            String
  polygon         Json          // [{x, y}, ...] relatif 0–1
  trackPosture    Boolean       @default(false)
  enabled         Boolean       @default(true)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  camera          CameraChannel @relation(fields: [cameraChannelId], references: [id], onDelete: Cascade)
  events          DwellEvent[]

  @@index([cameraChannelId, enabled])
}

model DwellEvent {
  id              String    @id @default(cuid())
  zoneId          String
  trackRef        String
  posture         Posture?
  enteredAt       DateTime
  exitedAt        DateTime?
  durationSeconds Int?
  createdAt       DateTime  @default(now())
  zone            AnalyticsZone @relation(fields: [zoneId], references: [id], onDelete: Cascade)

  @@index([zoneId, enteredAt])
  @@index([enteredAt])
}

model AnalyticsModuleStatus {
  id               String         @id @default(cuid())
  cameraChannelId  String         @unique
  analyticsEnabled Boolean        @default(false)
  sampleIntervalMs Int            @default(1000)
  lastEventAt      DateTime?
  workerStatus     WorkerStatus   @default(IDLE)
  lastErrorMessage String?
  snapshotPath     String?
  updatedAt        DateTime       @updatedAt
  camera           CameraChannel  @relation(fields: [cameraChannelId], references: [id], onDelete: Cascade)
}
```

Also add to `CameraChannel`:

```prisma
  analyticsZones    AnalyticsZone[]
  analyticsStatus   AnalyticsModuleStatus?
```

**Steps:**

1. Edit schema, run `npx prisma migrate dev --name add-analytics-module`.
2. Run `npm run prisma:generate`.
3. Verify `tsc --noEmit` passes.

### Task 4: Analytics API module (zones CRUD + status + internal endpoint)

**Files:**

- Create: `apps/api/src/analytics/analytics.module.ts`
- Create: `apps/api/src/analytics/analytics.controller.ts`
- Create: `apps/api/src/analytics/analytics.service.ts`
- Create: `apps/api/src/analytics/analytics.dto.ts`
- Create: `apps/api/src/analytics/analytics-internal.controller.ts`
- Create: `apps/api/src/analytics/analytics-internal.guard.ts`
- Test: `apps/api/src/analytics/analytics.service.spec.ts`

**Endpoints:**

```
GET    /api/analytics/zones?cameraId=:id          (AuthGuard)
POST   /api/analytics/zones                        (AuthGuard)
PUT    /api/analytics/zones/:id                    (AuthGuard)
DELETE /api/analytics/zones/:id                    (AuthGuard)

POST   /api/analytics/cameras/:cameraId/enable     (AuthGuard)
POST   /api/analytics/cameras/:cameraId/disable    (AuthGuard)
GET    /api/analytics/cameras/:cameraId/status     (AuthGuard)

GET    /api/analytics/cameras/:cameraId/snapshot   (AuthGuard) — serve worker snapshot JPEG

GET    /api/analytics/events?zoneId=&from=&to=     (AuthGuard)
GET    /api/analytics/summary?zoneId=&from=&to=    (AuthGuard)

POST   /api/internal/analytics/events              (InternalGuard — token + IP)
GET    /api/internal/analytics/active-cameras      (InternalGuard) — list cameras with analyticsEnabled
```

**Steps:**

1. DTO: `CreateZoneDto` (name, polygon validation min 3 points, each x/y 0–1), `UpdateZoneDto`, `BatchEventsDto`.
2. `AnalyticsService`: CRUD zona, enable/disable modul per kamera (create/update `AnalyticsModuleStatus`), query events + summary.
3. `AnalyticsInternalGuard`: verify `X-Internal-Token` header against `ANALYTICS_WORKER_TOKEN` env + check `req.ip` in Docker subnet.
4. `AnalyticsInternalController`: receive batch events, upsert `DwellEvent` rows, update `AnalyticsModuleStatus.lastEventAt` + `workerStatus`.
5. Snapshot endpoint: serve file dari disk (worker uploads via internal endpoint atau shared volume).
6. Register `AnalyticsModule` di `app.module.ts`.
7. Unit tests untuk service (mock Prisma).

### Task 5: Retention cleanup

**Files:**

- Create: `apps/api/src/analytics/analytics-cleanup.service.ts`
- Modify: `apps/api/src/analytics/analytics.module.ts`

**Steps:**

1. Install `@nestjs/schedule`.
2. `AnalyticsCleanupService` — `@Cron(CronExpression.EVERY_HOUR)` delete `DwellEvent` where `enteredAt < now - retentionDays`.
3. `retentionDays` dari env `ANALYTICS_RETENTION_DAYS` (default 30).
4. Register `ScheduleModule.forRoot()` di `app.module.ts`.

### Task 6: Zone editor frontend

**Files:**

- Create: `apps/web/src/app/(app)/analytics/page.tsx`
- Create: `apps/web/src/app/(app)/analytics/zones/page.tsx`
- Create: `apps/web/src/components/zone-editor/zone-editor.tsx`
- Create: `apps/web/src/components/zone-editor/zone-canvas.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`
- Create: `apps/web/src/lib/analytics.ts` (types + API functions)

**Steps:**

1. Sidebar: tambah item "Analitik" setelah "Grup", icon `Activity`.
2. `/analytics` — list kamera dengan status analitik (enabled/disabled, worker status).
3. `/analytics/zones?cameraId=:id` — zone editor: fetch snapshot dari API, render sebagai canvas background, draw polygon overlay (click to add points, drag to move, right-click to delete point).
4. Zone form: name, trackPosture checkbox, save/delete.
5. Polygon stored as relative coordinates (0–1).
6. Validation: min 3 points, show error toast.

## Fase C — Pipeline Deteksi + Tracking + Dwell Events

### Task 7: Worker — MediaMTX RTSP source + frame sampling

**Files:**

- Create: `apps/analytics-worker/src/mediamtx_source.py`
- Create: `apps/analytics-worker/src/frame_sampler.py`

**Steps:**

1. `mediamtx_source.py` — connect to `rtsp://mediamtx:8554/analytics-camera-<id>-sub` via OpenCV `VideoCapture`, reconnect logic with exponential backoff.
2. `frame_sampler.py` — yield 1 frame per `SAMPLE_INTERVAL_MS`, drop stale frames.
3. On first successful connection: save 1 JPEG snapshot to `SNAPSHOT_DIR`, upload to API via internal endpoint.

### Task 8: Worker — Detection + Tracking pipeline

**Files:**

- Create: `apps/analytics-worker/src/pipeline.py`
- Create: `apps/analytics-worker/src/tracker.py`
- Create: `apps/analytics-worker/src/zone_matcher.py`
- Create: `apps/analytics-worker/src/posture_classifier.py`

**Steps:**

1. `pipeline.py` — orchestrate: sample frame → YOLO11n-pose detect → filter class "person" → ByteTrack update → zone matching → posture classification → event generation.
2. `tracker.py` — ByteTrack wrapper from Ultralytics, maintain track IDs, timeout 5s for lost tracks.
3. `zone_matcher.py` — point-in-polygon test for track centroid vs `AnalyticsZone.polygon` (relative coords).
4. `posture_classifier.py` — heuristik: hitung rasio torso-length / hip-to-ankle-distance dari keypoint. Threshold: rasio < 0.6 → SITTING, ≥ 0.6 → STANDING, confidence rendah → UNKNOWN.

### Task 9: Worker — Event lifecycle + API client

**Files:**

- Create: `apps/analytics-worker/src/event_manager.py`
- Create: `apps/analytics-worker/src/api_client.py`

**Steps:**

1. `event_manager.py` — manage open/close `DwellEvent`: track enters zone → open event; track exits zone or lost >5s → close event with `exitedAt` + `durationSeconds` + majority posture.
2. `api_client.py` — HTTP client to NestJS internal endpoint: `GET /api/internal/analytics/active-cameras` (fetch zones + enabled cameras), `POST /api/internal/analytics/events` (batch send), upload snapshot.
3. Buffer events locally (max 500), flush every 5s or 50 events. On API unreachable: hold buffer, retry with backoff, drop oldest when full.

### Task 10: Worker — Camera orchestrator

**Files:**

- Create: `apps/analytics-worker/src/orchestrator.py`
- Modify: `apps/analytics-worker/src/main.py`

**Steps:**

1. `orchestrator.py` — manage per-camera pipeline lifecycle: fetch active cameras from API, start/stop `CameraPipeline` threads, periodic sync (30s) with API for camera/zone changes.
2. Each camera runs in its own `threading.Thread` — failure in one does not affect others.
3. `main.py` — wire everything: load config → init model → start health server → start orchestrator → graceful shutdown on SIGTERM.

## Fase D — Dashboard Analitik

### Task 11: Analytics dashboard page

**Files:**

- Create: `apps/web/src/app/(app)/analytics/dashboard/page.tsx`
- Create: `apps/web/src/components/analytics/event-table.tsx`
- Create: `apps/web/src/components/analytics/summary-cards.tsx`
- Create: `apps/web/src/components/analytics/filter-bar.tsx`

**Steps:**

1. Filter bar: camera select, zone select, date range picker (hari ini / 7 hari / kustom), posture filter.
2. Summary cards: total kehadiran, rata-rata durasi, durasi terlama, breakdown SITTING/STANDING/UNKNOWN.
3. Event table: compact density, columns: zona, waktu masuk, waktu keluar, durasi, postur. Pagination.
4. "Sedang berlangsung" indicator for events with `exitedAt = null` — show running duration.
5. Fetch from `GET /api/analytics/events` and `GET /api/analytics/summary`.

### Task 12: Camera analytics toggle + status

**Files:**

- Modify: `apps/web/src/app/(app)/cameras/page.tsx` (add analytics column/toggle)
- Create: `apps/web/src/components/analytics/camera-analytics-toggle.tsx`

**Steps:**

1. Di halaman cameras, tambah kolom "Analitik" dengan toggle switch per kamera.
2. Toggle calls `POST /api/analytics/cameras/:id/enable` atau `/disable`.
3. Tampilkan `workerStatus` badge (IDLE/RUNNING/ERROR) + `lastErrorMessage` tooltip.
4. Kamera yang `enabled = false` di dashboard: toggle disabled dengan tooltip.

## Fase E — Hardening

### Task 13: Docker Compose production + Windows deployment

**Files:**

- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `README.md`

**Steps:**

1. Verify worker service in prod compose with resource limits.
2. Document Windows deployment steps for analytics module.
3. Test `docker compose config`.

### Task 14: Static + unit verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
docker compose config
# Worker
cd apps/analytics-worker && python -m pytest tests/ -v
```

### Task 15: Runtime smoke test

1. `docker compose -f docker-compose.dev.yml --env-file .env.dev up --build`
2. Login → sidebar shows "Analitik".
3. Enable analytics on a camera → worker starts, snapshot saved.
4. Draw zone → save.
5. Verify worker processes frames, events appear in dashboard.
6. Disable camera → worker stops for that camera.

---

## Dependency Map

```
Fase A (Worker skeleton)     ←── independent
Fase B (Schema + CRUD zona)  ←── independent
Fase C (Pipeline)            ←── depends on A + B
Fase D (Dashboard)           ←── depends on B (API), partially C (events)
Fase E (Hardening)           ←── depends on all
```

**Execution order**: A+B parallel → C → D → E
