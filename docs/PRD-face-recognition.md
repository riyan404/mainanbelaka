# PRD — Face Recognition & Laporan Kehadiran Staf

> Add-on modul dwell-time analytics (`PRD-dwell-time-analytics.md`). Status: **implemented**.

## 1. Latar Belakang

Modul dwell-time analytics hanya tahu "ada orang di zona X selama N menit" — tidak tahu **siapa**. Untuk laporan kehadiran kasir, sistem perlu mengidentifikasi staf yang benar-benar hadir, bukan hanya mendeteksi keberadaan orang.

## 2. Tujuan

1. Identifikasi otomatis staf di depan kamera via face recognition.
2. Laporan kehadiran shift yang akurat per staf — dwell time orang lain tidak tercampur.
3. Nama staf tampil realtime di overlay dashboard.

## 3. Solusi

### 3.1 Mode analitik FACE_ID

`AnalyticsMode` ditambah enum `FACE_ID` (selain `POSE`, `FACE`). Kamera yang di-set FACE_ID menjalankan pipeline pengenalan wajah via **insightface buffalo_l** (deteksi wajah Scrfd + embedding ArcFace, cosine similarity matching).

- Threshold kemiripan: configurable via settings UI (range 0.3–0.7, default 0.5).
- Wajah terdeteksi tapi tidak cocok → event `staffName: null` ("Tidak Dikenal"), auto-hapus setelah `unknownRetentionDays` (default 2 hari).

### 3.2 Enrollment staf

1. Admin upload foto staf di halaman `/staff` (multipart, field `photo` + `staffName`).
2. Foto disimpan di **filesystem** (`STAFF_FACE_DIR`, default `/tmp/staff-faces`, volume Docker `staff_faces` shared API↔worker) — bukan database (prinsip privasi: gambar tidak di-DB).
3. Worker sync setiap 30 detik → meng-extract embedding 512-dim dari foto pending → simpan via internal API.
4. Delete slot: `DELETE /api/staff/faces/by-name/:staffName` menghapus semua foto + embedding satu staf.

### 3.3 Pipeline worker

- `face_recognizer.py`: load model buffalo_l (provider ONNX configurable via `ONNX_PROVIDERS` — CoreML saat native macOS), sync enrollment, matching per frame.
- `pipeline.py::_process_frame_face_id`: deteksi wajah → recognize → track stabil `face-{staff_name}` / `face-unknown-{i}` → event manager.
- `event_manager.py`: `OpenEvent.staff_names` accumulate per-frame detection, majority voting saat event ditutup.
- `track_ref` stabil per identitas — satu orang = satu track kontinu (bukan per-frame index).

### 3.4 Overlay realtime

- Worker kirim live-state per ~2 detik: posisi box + `staffName`.
- Frontend `live-tracking-overlay.tsx`: nama staf **hitam bold**, "Tidak Dikenal" **merah**, label zona disembunyikan untuk face track.
- `staffName` mengalir lewat 3 layer: worker `PersonBox` → `LiveTrackDto`/`storeLiveState` API → response `getLiveState` → overlay.

### 3.5 Shift & laporan

- `ShiftSchedule`: `staffName`, `cameraChannelId`, `zoneId` (opsional — null = semua zona), `startTime`, `endTime`, `notes`.
- Form shift pakai **dropdown** nama staf dari face enrollment (`/api/staff/faces/names`), fallback input manual.
- Laporan `GET /api/shifts/report`: join shift → DwellEvent overlap waktu + **filter identitas** — event dengan `staffName` yang beda dengan nama staf shift di-skip (case-insensitive). Event `staffName: null` (POSE / tak dikenal) tetap dihitung untuk backward-compat.
- Semua perhitungan waktu pakai `.getTime()` (UTC-safe, container UTC vs user WIB).

## 4. Model Data

| Model | Field kunci |
| ------- | ------------- |
| `StaffFace` | `staffName`, `photoPath` (fs), `embedding` (base64, diisi worker) |
| `SystemSetting` | key-value: `faceRecognitionThreshold`, `unknownRetentionDays` |
| `DwellEvent` (tambah) | `staffName: String?` |
| `ShiftSchedule` (baru) | `staffName`, `cameraChannelId`, `zoneId?`, `startTime`, `endTime`, `notes?` |
| `AnalyticsModuleStatus` (tambah) | mode `POSE | FACE | FACE_ID` |

## 5. Endpoint Baru

Lihat AGENTS.md §5 untuk tabel lengkap. Ringkas: `/api/staff/*` (CRUD faces + settings), `/api/shifts/*` (CRUD + report + staff-names), internal `/api/internal/analytics/face-*` + `live-state`, public `/api/analytics/cameras/:id/live`.

## 6. Performa

Benchmark insightface buffalo_l, frame 720p, Apple M4 Pro:

| Mode | Inference | FPS |
| ------ | ----------- | ----- |
| Docker (CPU) | ~296ms | 3.4 |
| Native CPU | ~91ms | 10.9 |
| Native + CoreML | ~68ms | 14.6 |

Production VM Linux: GPU NVIDIA (T4/A2000) turun ke ~15ms/frame via CUDA. Tanpa GPU, ~1 core per kamera FACE_ID.

## 7. Privasi

- Foto staf di filesystem lokal server, tidak di database, tidak di-expose ke internet.
- Track ID anonim; identitas hanya nama staf yang sengaja di-enroll admin.
- Event "Tidak Dikenal" tidak menyimpan wajah — hanya metadata durasi + posisi.
- Retensi unknown event pendek (default 2 hari), event ter-identik mengikuti retensi dwell umum (30 hari).
