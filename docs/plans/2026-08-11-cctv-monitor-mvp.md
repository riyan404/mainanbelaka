# CCTV Monitor MVP Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Membangun vertical slice CCTV Monitor yang dapat dijalankan melalui Docker Compose, mengelola perangkat/channel/grup Hikvision, serta menampilkan dashboard WebRTC MediaMTX.

**Architecture:** Monorepo npm workspaces berisi Next.js frontend dan NestJS backend. Backend menyimpan domain di PostgreSQL melalui Prisma, mengakses Hikvision lewat adapter ISAPI, memvalidasi RTSP lewat adapter `ffprobe`, dan menghasilkan URL WebRTC MediaMTX tanpa membocorkan kredensial. Frontend memakai control-room UI monokrom, API client terpusat, dan player MediaMTX berbasis iframe untuk MVP.

**Tech Stack:** Node.js 22, TypeScript, Next.js 15, React 19, Tailwind CSS, komponen shadcn-style, NestJS 11, Prisma 6, PostgreSQL 16, MediaMTX, FFmpeg/ffprobe, Vitest, Jest, Docker Compose.

---

## Milestone 1 — Workspace dan kontrak bersama

### Task 1: Scaffold monorepo

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/web/package.json`

**Steps:**

1. Definisikan npm workspaces untuk `apps/*`.
2. Tambahkan script root `dev`, `build`, `test`, `lint`, dan `typecheck`.
3. Pin major dependency agar macOS dan Windows memakai dependency graph sama.
4. Jalankan `npm install` dan pastikan lockfile terbentuk.

### Task 2: Tambah kontrak domain

**Files:**

- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/common/domain.ts`
- Test: `apps/api/src/common/domain.spec.ts`

**Steps:**

1. Tulis test mapping stream ID Hikvision.
2. Jalankan test dan verifikasi gagal.
3. Implementasikan enum/status dan `buildHikvisionStreamId`.
4. Jalankan test dan verifikasi lulus.

## Milestone 2 — Backend

### Task 3: Bootstrap NestJS dan health endpoint

**Files:**

- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`

**Steps:**

1. Tulis test health response.
2. Implementasikan app module, global validation, cookie parsing, CORS LAN, dan health endpoint.
3. Jalankan Jest dan typecheck.

### Task 4: Implementasikan auth admin

**Files:**

- Create: `apps/api/src/auth/*`
- Create: `apps/api/src/database/*`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Steps:**

1. Tulis test login sukses/gagal dan sanitasi response.
2. Implementasikan seed admin dari `.env`, Argon2, JWT cookie HttpOnly, guard, login/logout/session/password.
3. Pastikan nilai `.env` hanya membuat admin saat database kosong.
4. Jalankan test terfokus.

### Task 5: Implementasikan Hikvision adapter

**Files:**

- Create: `apps/api/src/hikvision/hikvision.types.ts`
- Create: `apps/api/src/hikvision/hikvision.client.ts`
- Create: `apps/api/src/hikvision/hikvision.parser.ts`
- Create: `apps/api/src/hikvision/rtsp-probe.service.ts`
- Test: `apps/api/src/hikvision/*.spec.ts`

**Steps:**

1. Tulis fixture XML device/channel dan test parser toleran namespace.
2. Implementasikan HTTP Digest via `digest-fetch` dengan timeout.
3. Implementasikan endpoint fallback ISAPI untuk device info dan channel.
4. Implementasikan RTSP URL builder dan `ffprobe` tanpa shell interpolation.
5. Redact password dari error/log.
6. Jalankan test parser, URL builder, dan codec policy H.265/HEVC.

### Task 6: Implementasikan perangkat dan channel

**Files:**

- Create: `apps/api/src/devices/*`
- Create: `apps/api/src/cameras/*`
- Test: `apps/api/src/devices/devices.service.spec.ts`

**Steps:**

1. Buat DTO tervalidasi untuk test/detect, create, edit, archive, restore.
2. Implementasikan test/detect tanpa menyimpan data.
3. Buat token hasil deteksi berumur pendek agar create hanya menerima hasil tervalidasi.
4. Enkripsi username/password perangkat dengan AES-256-GCM.
5. Simpan semua channel sebagai disabled.
6. Implementasikan enable hanya setelah main/sub H.265/HEVC lulus tes.
7. Implementasikan status manual dan re-detect merge non-destruktif.
8. Jalankan unit test dan Prisma validation.

### Task 7: Implementasikan grup, dashboard, dan stream session

**Files:**

- Create: `apps/api/src/groups/*`
- Create: `apps/api/src/dashboard/*`
- Create: `apps/api/src/streams/*`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`

**Steps:**

1. Implementasikan CRUD grup many-to-many dan satu default group.
2. Implementasikan query dashboard alfabetis dan pagination maksimal 16.
3. Implementasikan URL MediaMTX publik dari camera ID + quality, tanpa RTSP credential.
4. Implementasikan konfigurasi path MediaMTX lewat Control API dengan fallback config contract.
5. Jalankan test query/pagination dan sanitasi URL.

## Milestone 3 — Frontend

### Task 8: Bootstrap design system

**Files:**

- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/ui/*`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/app/layout.tsx`

**Steps:**

1. Definisikan semantic tokens monokrom dan status blue/red/orange.
2. Pasang Inter, Lucide, focus-visible, reduced motion, dan no horizontal overflow.
3. Implementasikan Button, Badge, Input, Table, Dialog, Skeleton, Tooltip, Dropdown, dan Sheet primitives.
4. Verifikasi lint dan typecheck.

### Task 9: Implementasikan shell, login, dan dashboard

**Files:**

- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/page.tsx`
- Create: `apps/web/src/components/app-sidebar.tsx`
- Create: `apps/web/src/components/camera-grid.tsx`
- Create: `apps/web/src/components/camera-tile.tsx`
- Test: `apps/web/src/components/camera-grid.test.tsx`

**Steps:**

1. Implementasikan login minimal terpusat.
2. Implementasikan sidebar default icon-only, responsive Sheet, dan localStorage preference.
3. Implementasikan toolbar dashboard minimal dan layout 1/4/9/16.
4. Implementasikan tile edge-to-edge, `object-fit: contain`, state loading/offline/error, retry.
5. Implementasikan fullscreen grid dan fullscreen satu kamera; ganti sub/main stream.
6. Jalankan component tests.

### Task 10: Implementasikan halaman admin

**Files:**

- Create: `apps/web/src/app/(app)/devices/*`
- Create: `apps/web/src/app/(app)/cameras/*`
- Create: `apps/web/src/app/(app)/groups/*`
- Create: `apps/web/src/app/(app)/settings/*`
- Create: `apps/web/src/components/device-wizard/*`

**Steps:**

1. Implementasikan tabel perangkat compact dan archive tab.
2. Implementasikan wizard Data Koneksi → Test & Detect → Review → Simpan.
3. Implementasikan inventaris kamera dengan filter dan enable/disable.
4. Implementasikan grup many-to-many dan default group.
5. Implementasikan ubah password.
6. Pastikan mobile berubah menjadi compact list tanpa horizontal scroll.

## Milestone 4 — Runtime lokal

### Task 11: Docker Compose dan MediaMTX

**Files:**

- Create: `docker-compose.yml`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `infra/mediamtx/mediamtx.yml`
- Create: `README.md`

**Steps:**

1. Tambahkan PostgreSQL healthcheck dan volume persisten.
2. Tambahkan API dengan FFmpeg/ffprobe.
3. Tambahkan web dan MediaMTX dengan WebRTC/control API.
4. Dokumentasikan `.env`, development macOS, dan deployment manual Windows.
5. Jalankan `docker compose config`.

## Milestone 5 — Verifikasi

### Task 12: Static dan unit verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
docker compose config
```

Expected: seluruh command exit code 0.

### Task 13: Runtime smoke test

Run:

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:4000/api/health
curl -fsS http://localhost:3000/login
```

Expected: PostgreSQL, API, web, dan MediaMTX healthy/running; health response `{"status":"ok"}`; login HTML tersedia.

### Task 14: User-flow validation

1. Login dengan admin `.env`.
2. Buka dashboard mock/empty state.
3. Tambah perangkat menggunakan Hikvision LAN bila tersedia.
4. Verifikasi password tidak muncul pada network response/log.
5. Test/detect channel dan simpan seluruh channel disabled.
6. Enable channel H.265/HEVC, masukkan ke grup default, buka grid dan fullscreen.
7. Verifikasi stream lama ditutup saat pindah halaman/fullscreen.

Jika perangkat fisik belum tersedia, catat langkah 3–7 sebagai residual manual validation dan gunakan adapter fixtures untuk unit test.
