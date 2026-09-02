# Product Requirements Document — Modul Analitik Dwell-Time & Postur Duduk

## 0. Status Dokumen

Modul tambahan (add-on) di luar MVP inti CCTV Monitor. `docs/PRD.md` §3 secara eksplisit mengeluarkan "AI analytics" dari MVP — dokumen ini adalah spesifikasi modul opsional yang mengaktifkan kemampuan tersebut tanpa mengubah kontrak MVP yang sudah ada. Modul non-aktif secara default; admin mengaktifkan per kamera.

## 1. Ringkasan

Modul Analitik Dwell-Time menambahkan kemampuan deteksi orang, pelacakan identitas anonim antar-frame, dan pengukuran durasi keberadaan (dwell time) pada zona tertentu di dalam frame kamera — termasuk klasifikasi postur duduk vs berdiri. Modul berjalan sebagai service terpisah dari API dan web utama, mengonsumsi sub-stream RTSP yang sudah tersedia melalui MediaMTX, dan melaporkan hasil agregat (bukan video atau identitas) ke backend melalui event.

Modul tidak melakukan pengenalan wajah dan tidak menyimpan identitas orang. Output hanya berupa ID pelacakan anonim, zona, postur, dan durasi.

## 2. Sasaran

1. Mengukur berapa lama seseorang berada pada zona tertentu di kamera (mis. meja resepsionis, area tunggu, pos jaga).
2. Membedakan postur duduk dan berdiri pada zona yang relevan.
3. Menyediakan data dwell-time historis melalui dashboard admin tanpa membebani API/web utama.
4. Berjalan pada CPU untuk skala kecil (2–4 kamera teranalisis) tanpa mewajibkan GPU.
5. Tidak mengubah kontrak MVP CCTV Monitor yang sudah berjalan (dashboard live, dashboard grid, dan seterusnya tetap seperti PRD utama).

## 3. Batasan Modul

### Termasuk

- Deteksi orang pada sub-stream kamera yang sudah `enabled`.
- Pelacakan ID anonim antar-frame (multi-object tracking) dalam satu sesi kamera.
- Definisi zona analitik (area kotak/poligon) per kamera oleh admin.
- Klasifikasi postur duduk/berdiri pada zona yang ditandai relevan.
- Pencatatan event masuk-zona, keluar-zona, dan durasi per track.
- Sampling rate dapat dikonfigurasi (default 1 frame/detik).
- Dashboard riwayat dwell-time per zona/kamera dengan rentang waktu.
- Aktivasi/nonaktivasi modul per kamera, independen dari kamera lain.

### Tidak termasuk

- Pengenalan wajah atau identitas personal.
- Penyimpanan cuplikan wajah/gambar orang.
- Notifikasi/alert real-time (dorongan ke Fase 2, lihat §18).
- Rekaman video hasil anotasi.
- Analitik selain dwell-time dan postur duduk/berdiri (tanpa deteksi jatuh, kerumunan, dsb pada modul ini).
- Model kustom per pelanggan; model default terlatih generik (COCO-based).
- Penjadwalan analitik otomatis lintas grup; aktivasi tetap manual per kamera.
- Dukungan GPU wajib; modul didesain berjalan pada CPU untuk skala kecil.

## 4. Pengguna

Sama dengan aplikasi utama — hanya **Admin**. Admin dapat:

- Mengaktifkan/menonaktifkan modul analitik per kamera.
- Menggambar dan mengelola zona analitik pada frame kamera.
- Menentukan zona mana yang dianalisis posturnya (duduk/berdiri) vs hanya dwell-time kehadiran.
- Melihat riwayat dan ringkasan dwell-time per zona.

## 5. Arsitektur Sistem

```text
Hikvision Camera (sub-stream H.265/HEVC)
        │
        ▼
   MediaMTX (sudah ada di proyek utama)
        │
        ├── WebRTC ──────────────► Web Dashboard (live view, sudah ada)
        │
        └── RTSP (internal) ────► Analytics Worker (BARU)
                                        │
                                        ├── Person Detection (YOLO nano)
                                        ├── Multi-Object Tracking (ByteTrack)
                                        ├── Pose Classification (duduk/berdiri)
                                        └── Zone/Dwell-Time Logic
                                        │
                                        ▼
                                  Event (HTTP internal, tanpa gambar)
                                        │
                                        ▼
                              NestJS API (endpoint analytics BARU)
                                        │
                                        ▼
                                  PostgreSQL (agregat, bukan frame)
                                        │
                                        ▼
                              Next.js Web (halaman Analitik BARU)
```

**Prinsip desain**: Analytics Worker adalah proses Python terpisah, bukan bagian dari NestJS API. Worker menarik sub-stream langsung dari MediaMTX (bukan dari browser), sample rendah, dan hanya mengirim hasil terstruktur (JSON: zona, ID track, postur, durasi) ke API — tidak pernah mengirim frame video ke API/database.

### Stack tambahan

- Analytics Worker: Python, Ultralytics YOLO (varian nano) untuk deteksi + pose, ByteTrack untuk tracking.
- Komunikasi Worker → API: HTTP internal (Docker network), payload JSON kecil, tanpa kredensial kamera.
- Deployment: container terpisah dalam `docker-compose.yml`/`docker-compose.dev.yml` yang sudah ada, network internal sama dengan `mediamtx` dan `api`.

## 6. Model Domain (tambahan pada skema Prisma yang ada)

### 6.1 AnalyticsZone

Zona yang digambar admin di atas frame kamera (koordinat relatif 0–1 agar tidak bergantung resolusi).

```text
AnalyticsZone
- id
- cameraChannelId   (relasi ke CameraChannel yang sudah ada)
- name
- polygon           (array titik x,y relatif 0–1)
- trackPosture      (boolean: apakah zona ini dianalisis duduk/berdiri)
- enabled
- createdAt
- updatedAt
```

### 6.2 DwellEvent

Satu baris per keberadaan track dalam satu zona (dari masuk sampai keluar), bukan per frame.

```text
DwellEvent
- id
- zoneId
- trackRef          (ID anonim internal dari worker, bukan identitas orang)
- posture           (SITTING | STANDING | UNKNOWN, null jika trackPosture=false)
- enteredAt
- exitedAt          (null jika masih berlangsung)
- durationSeconds    (dihitung saat exit)
- createdAt
```

### 6.3 AnalyticsModuleStatus

Status aktivasi modul per kamera, terpisah dari `CameraChannel.enabled` milik dashboard live.

```text
AnalyticsModuleStatus
- cameraChannelId    (unique, relasi ke CameraChannel)
- analyticsEnabled
- sampleIntervalMs   (default 1000)
- lastEventAt
- workerStatus       (IDLE | RUNNING | ERROR)
- lastErrorMessage
- updatedAt
```

Retensi: `DwellEvent` disimpan maksimal N hari (default 30, dapat dikonfigurasi via `.env`), dibersihkan berkala. Tidak ada penyimpanan gambar/frame di database maupun disk pada MVP modul ini.

## 7. Integrasi Teknis

### 7.1 Sumber frame

Worker menarik RTSP sub-stream langsung dari MediaMTX menggunakan path publik yang sudah dibuat sistem existing (bukan RTSP asli kamera berkredensial) — konsisten dengan prinsip PRD utama §11 bahwa kredensial RTSP tidak boleh bocor ke luar backend.

### 7.2 Pipeline per kamera aktif analitik

1. Worker subscribe ke sub-stream MediaMTX kamera yang `analyticsEnabled = true`.
2. Sample 1 frame per `sampleIntervalMs` (default 1000ms).
3. Deteksi orang (YOLO nano) pada frame sample.
4. Update tracker (ByteTrack) — assign/pertahankan ID anonim.
5. Untuk tiap track, cek posisi terhadap `AnalyticsZone.polygon` kamera tsb.
6. Jika `trackPosture = true` pada zona, jalankan klasifikasi postur dari keypoint pose.
7. Kelola siklus event: track baru masuk zona → buat `DwellEvent` baru (`exitedAt = null`); track keluar zona atau hilang > timeout (mis. 5 detik tanpa terdeteksi) → set `exitedAt` dan `durationSeconds`.
8. Kirim batch event (bukan per-frame) ke API setiap beberapa detik.

### 7.3 Beban komputasi (lihat diskusi sebelumnya)

- Target: CPU modern (4 core+), tanpa GPU, untuk 2–4 kamera teranalisis bersamaan pada resolusi sub-stream (640×360–704×576) dan sample 1 fps.
- Model default: varian nano (deteksi+pose) demi latensi inferensi rendah di CPU.
- Skala di atas ~8–10 kamera teranalisis bersamaan direkomendasikan GPU; di luar cakupan MVP modul ini (lihat §18).

## 8. Persyaratan Fungsional

### FR-A01 — Aktivasi modul per kamera

- Admin dapat mengaktifkan/menonaktifkan analitik per `CameraChannel` yang sudah `enabled` pada dashboard live.
- Kamera yang tidak `enabled` di dashboard tidak dapat diaktifkan analitiknya.
- Menonaktifkan kamera di dashboard live turut menghentikan worker analitik kamera tsb.

### FR-A02 — Definisi zona

- Admin menggambar poligon zona di atas snapshot/preview sub-stream kamera.
- Minimal 3 titik per zona, koordinat disimpan relatif (0–1) terhadap frame.
- Admin menandai zona sebagai "lacak postur" atau "hanya kehadiran".
- Satu kamera dapat memiliki lebih dari satu zona.

### FR-A03 — Deteksi dan tracking

- Worker mendeteksi orang pada sample frame dan mempertahankan ID track selama orang tetap terdeteksi kontinu (toleransi hilang maksimal N detik, default 5).
- ID track bersifat sementara per sesi kamera, tidak dikaitkan dengan identitas nyata.

### FR-A04 — Klasifikasi postur

- Untuk zona `trackPosture = true`, worker mengklasifikasikan tiap sample sebagai `SITTING`, `STANDING`, atau `UNKNOWN` (mis. keypoint tidak cukup jelas).
- Postur pada `DwellEvent` diambil dari mayoritas sample selama event berlangsung.

### FR-A05 — Pencatatan durasi

- Event dwell dibuat saat track pertama kali masuk poligon zona dan ditutup saat track keluar zona atau hilang melewati timeout.
- `durationSeconds` dihitung dari `enteredAt` sampai `exitedAt`.
- Event yang masih berlangsung ditampilkan di dashboard sebagai "sedang berlangsung" dengan durasi berjalan.

### FR-A06 — Dashboard analitik

- Halaman baru "Analitik" menampilkan daftar zona, jumlah kehadiran, dan rata-rata/durasi terlama per rentang waktu (hari ini, 7 hari, kustom).
- Filter berdasarkan kamera, zona, dan postur (jika zona melacak postur).
- Tidak menampilkan cuplikan gambar orang — hanya data agregat/tabel.

### FR-A07 — Status worker

- Admin dapat melihat status tiap worker kamera (`IDLE`/`RUNNING`/`ERROR`) dan pesan error terakhir.
- Kegagalan satu worker kamera tidak mematikan worker kamera lain.

## 9. Alur Utama

### 9.1 Mengaktifkan analitik pada kamera

```text
Inventaris Kamera / Detail Kamera
→ Tab Analitik
→ Gambar zona pada preview sub-stream
→ Tandai zona: lacak postur atau hanya kehadiran
→ Simpan
→ Aktifkan modul analitik
→ Worker mulai berjalan untuk kamera tsb
```

### 9.2 Melihat riwayat dwell-time

```text
Halaman Analitik
→ Pilih kamera/zona
→ Pilih rentang waktu
→ Lihat daftar event: masuk, keluar, durasi, postur
→ Lihat ringkasan: total kehadiran, rata-rata durasi, durasi terlama
```

## 10. API Konseptual (tambahan)

```text
GET    /api/analytics/zones?cameraId=:id
POST   /api/analytics/zones
PUT    /api/analytics/zones/:id
DELETE /api/analytics/zones/:id

POST   /api/analytics/cameras/:cameraId/enable
POST   /api/analytics/cameras/:cameraId/disable
GET    /api/analytics/cameras/:cameraId/status

GET    /api/analytics/events?zoneId=:id&from=&to=
GET    /api/analytics/summary?zoneId=:id&from=&to=

POST   /api/internal/analytics/events   (dipanggil oleh Analytics Worker, bukan frontend)
```

Endpoint `/api/internal/analytics/events` hanya menerima koneksi dari network internal Docker (worker), diverifikasi dengan token internal terpisah dari sesi admin — tidak pernah diekspos ke frontend/publik.

## 11. UI/UX (mengikuti bahasa desain PRD utama §12)

- Konsisten dengan identitas monokrom control-room CCTV Monitor: neutral-950/900/800, shadcn/ui, ikon Lucide, dark mode tetap.
- Menu navigasi baru "Analitik" ditambahkan setelah "Grup" pada sidebar (lihat PRD utama §12.4).
- Editor zona: overlay poligon di atas gambar preview sub-stream, garis dan titik monokrom dengan aksen warna status (oranye = draft belum disimpan, biru = tersimpan aktif).
- Tabel riwayat event memakai density compact yang sama dengan halaman admin lain (tinggi baris ~40px, PRD utama §12.6).
- Status worker memakai warna status yang sama dengan aturan PRD utama §12.2 (biru=online/running, merah=error, abu=idle/nonaktif).
- Tidak ada thumbnail wajah/gambar orang di UI mana pun pada modul ini.

## 12. Keamanan & Privasi

- Tidak ada pengenalan wajah, tidak ada penyimpanan gambar orang, tidak ada biometrik.
- ID track bersifat anonim dan sementara (hidup selama sesi kamera berjalan), tidak pernah disimpan bersama data yang dapat mengidentifikasi orang.
- Endpoint internal worker→API diautentikasi token terpisah, hanya dapat diakses dari network Docker internal.
- Retensi `DwellEvent` dibatasi (default 30 hari) dan dapat dikonfigurasi admin; pembersihan berkala otomatis.
- Worker tidak pernah menerima kredensial kamera asli — hanya path publik MediaMTX, konsisten dengan PRD utama §7.3/§11.
- Aktivasi modul per kamera bersifat opt-in eksplisit oleh admin — tidak aktif otomatis untuk kamera baru.

## 13. Kinerja

- Target 2–4 kamera teranalisis bersamaan pada CPU tanpa GPU, sample 1 fps, resolusi sub-stream.
- Latensi event (dari kejadian nyata ke tercatat di database): dapat ditoleransi hingga beberapa detik, karena tujuan modul adalah agregat historis, bukan alert real-time.
- Worker per kamera berjalan sebagai proses/goroutine terpisah agar kegagalan satu kamera tidak menghentikan kamera lain (selaras FR-A07).

## 14. Penanganan Error

- Sub-stream MediaMTX tidak tersedia: worker menandai `workerStatus = ERROR`, mencoba ulang dengan backoff, tidak membuat event palsu.
- Model gagal dimuat: worker gagal start, status `ERROR` dengan pesan jelas di dashboard, tidak menghentikan API/web utama.
- Zona tanpa titik valid (kurang dari 3 titik): ditolak saat penyimpanan, validasi di frontend dan backend.
- Kehilangan koneksi worker→API: event ditahan sementara di worker (buffer terbatas) dan dikirim ulang saat koneksi pulih; buffer penuh membuang event terlama dan mencatat peringatan, bukan crash.

## 15. Acceptance Criteria Modul

1. Admin dapat mengaktifkan analitik pada kamera yang sudah `enabled` di dashboard live.
2. Admin dapat menggambar minimal satu zona analitik per kamera dan menyimpannya.
3. Worker mendeteksi dan melacak orang pada zona tanpa GPU untuk skenario 2–4 kamera.
4. Sistem mencatat `DwellEvent` lengkap dengan `enteredAt`, `exitedAt`, `durationSeconds` saat track keluar zona.
5. Zona yang ditandai `trackPosture = true` menghasilkan klasifikasi `SITTING`/`STANDING`/`UNKNOWN` pada event.
6. Dashboard Analitik menampilkan riwayat dan ringkasan durasi per zona/rentang waktu tanpa menampilkan gambar orang.
7. Menonaktifkan kamera di dashboard live turut menghentikan worker analitik kamera tsb.
8. Kegagalan satu worker kamera tidak memengaruhi kamera lain maupun aplikasi utama (API/web tetap berjalan normal).
9. Tidak ada kredensial kamera atau gambar/frame video yang tersimpan di database analitik.

## 16. Tahapan Implementasi

### Fase A — Fondasi Worker

- Skeleton Analytics Worker Python, koneksi ke sub-stream MediaMTX.
- Deteksi orang dasar (YOLO nano) + logging lokal, belum terhubung ke API.

### Fase B — Tracking & Zona

- Integrasi ByteTrack untuk ID persisten.
- Skema Prisma `AnalyticsZone`, `AnalyticsModuleStatus`.
- Editor zona di web (overlay poligon pada preview kamera).
- Endpoint CRUD zona di API.

### Fase C — Dwell-Time & Postur

- Logika masuk/keluar zona dan perhitungan `durationSeconds`.
- Klasifikasi postur duduk/berdiri dari pose keypoint.
- Endpoint internal worker→API untuk event.
- Skema `DwellEvent` dan retensi otomatis.

### Fase D — Dashboard Analitik

- Halaman Analitik: daftar event, ringkasan, filter kamera/zona/rentang waktu.
- Status worker per kamera di UI.
- Aktivasi/nonaktivasi modul per kamera dari UI.

### Fase E — Hardening

- Uji beban 2–4 kamera bersamaan di CPU target deployment (PC Windows).
- Backoff dan buffer saat worker/API terputus sementara.
- Dokumentasi instalasi container worker baru (docker-compose).

## 17. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| CPU target (PC Windows deployment) tidak sekuat asumsi | FPS sample turun, dwell time kurang akurat | Sample rate adaptif, model nano, uji beban di Fase E sebelum rilis |
| Klasifikasi postur keliru pada sudut kamera ekstrem | Postur SITTING/STANDING salah label | Tandai UNKNOWN saat confidence rendah, minimal 1 zona uji per sudut kamera nyata sebelum go-live |
| Worker menjadi permukaan serangan baru (proses tambahan, dependensi Python) | Kerentanan keamanan baru di luar stack Node existing | Isolasi network Docker internal, token internal terpisah, tanpa endpoint publik langsung ke worker |
| Kesalahpahaman fitur ini sebagai pengawasan biometrik | Masalah kepercayaan/privasi pengguna internal | Tegaskan tanpa pengenalan wajah/identitas di dokumentasi dan UI, retensi data dibatasi |
| Tracking kehilangan ID saat oklusi (orang saling menutupi) | Dwell time terpecah jadi beberapa event pendek | Timeout toleransi hilang beberapa detik sebelum menutup event (FR-A03) |

## 18. Di Luar Cakupan (kandidat fase berikutnya, bukan bagian modul ini)

- Notifikasi/alert saat dwell time melewati ambang batas.
- Skala di atas ~8–10 kamera teranalisis bersamaan (kebutuhan GPU).
- Analitik tambahan: deteksi kerumunan, deteksi jatuh, penghitungan orang lintas-kamera (re-identification).
- Model kustom hasil fine-tuning spesifik lokasi.

## 19. Keputusan Modul

- Bahasa/gaya dokumen dan UI mengikuti `docs/PRD.md` yang sudah ada — modul ini bukan produk terpisah.
- Modul tidak wajib GPU untuk skala kecil (2–4 kamera), sesuai diskusi kebutuhan awal.
- Tidak ada pengenalan wajah atau penyimpanan identitas — hanya data agregat anonim.
- Worker analitik adalah proses Python terpisah, tidak menyatu dengan NestJS API.
- Aktivasi selalu opt-in per kamera, default nonaktif.
