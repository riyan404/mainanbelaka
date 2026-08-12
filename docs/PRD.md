# Product Requirements Document — Local CCTV Monitor

## 1. Ringkasan

Local CCTV Monitor adalah aplikasi web lokal untuk memantau live stream perangkat Hikvision melalui jaringan LAN. Sistem menggantikan kebutuhan akses Hik-Connect untuk penggunaan internal ketika kapasitas akun/perangkat Hik-Connect sudah penuh.

Aplikasi mendukung banyak Hikvision IP camera dan NVR/DVR. Admin dapat menyimpan inventaris 50+ channel, mengaktifkan hanya kamera yang diperlukan, mengelompokkan kamera berdasarkan lokasi atau kebutuhan, lalu memantau maksimal 16 live stream per halaman.

Video Hikvision diambil melalui RTSP. Browser tidak menerima RTSP secara langsung, sehingga MediaMTX meneruskan stream sebagai WebRTC. ISAPI Hikvision digunakan untuk menguji perangkat dan mendeteksi channel NVR/DVR. ONVIF tidak digunakan pada MVP.

## 2. Sasaran Produk

1. Menampilkan live CCTV Hikvision melalui browser di jaringan lokal.
2. Mendukung banyak NVR/DVR dan kamera IP Hikvision dalam satu inventaris.
3. Memudahkan admin menambah perangkat hanya dengan data koneksi utama.
4. Mendeteksi dan menyimpan seluruh channel NVR/DVR secara otomatis.
5. Mengurangi beban server dengan hanya membuka stream yang sedang terlihat.
6. Memberikan pengalaman responsif pada desktop, laptop, tablet, dan HP.
7. Dapat dikembangkan di macOS dan dijalankan secara manual pada PC Windows melalui Docker Compose.

## 3. Batasan MVP

### Termasuk

- Satu akun admin.
- Login dan logout.
- Hikvision IP camera.
- Hikvision NVR/DVR kapasitas 4, 8, 16, 32 channel, serta model lain yang dapat dideteksi ISAPI.
- Tambah, edit, arsipkan, pulihkan, dan hapus permanen perangkat.
- Test koneksi perangkat sebelum disimpan.
- Deteksi channel melalui Hikvision ISAPI.
- RTSP probing sebagai validasi stream.
- Sinkronisasi ulang channel secara manual.
- Inventaris kamera/channel tanpa batas aplikasi.
- Enable/disable kamera untuk dashboard.
- Grup kamera many-to-many.
- Satu grup default.
- Dashboard WebRTC.
- Layout 1, 4, 9, dan 16 kamera.
- Layout default 2×2 atau 4 kamera.
- Maksimal 16 stream per halaman.
- Fullscreen seluruh grid.
- Fullscreen satu kamera.
- Sub-stream pada grid dan main stream pada fullscreen kamera.
- Dark mode tetap.
- Pemeriksaan status manual.
- Reconnect stream manual melalui tombol **Coba Lagi**.

### Tidak termasuk

- Playback rekaman.
- Perekaman video ke server aplikasi.
- Audio dan talkback.
- Snapshot.
- PTZ.
- Motion detection.
- Notifikasi.
- AI analytics.
- ONVIF.
- Merek selain Hikvision.
- Custom RTSP URL untuk vendor lain.
- Public IP atau akses internet.
- Multi-user, role, dan permission per kamera.
- HLS fallback.
- Transcoding ke H.264 atau codec lain.
- Stream H.264; seluruh live stream wajib H.265/HEVC.
- Penemuan perangkat otomatis melalui network scan.
- Pemeriksaan status berkala.

## 4. Pengguna

### Admin

Satu-satunya pengguna aplikasi. Admin dapat:

- Login dan logout.
- Melihat dashboard live.
- Mengelola perangkat Hikvision.
- Mengelola channel/kamera.
- Menjalankan test koneksi.
- Menjalankan deteksi dan sinkronisasi channel.
- Mengaktifkan atau menonaktifkan kamera.
- Mengelola grup.
- Memilih grup default.
- Mengganti password akun.

## 5. Arsitektur Sistem

```text
Hikvision IP Camera / NVR / DVR
        │
        ├── ISAPI: autentikasi, identitas, daftar channel
        └── RTSP H.265/HEVC: main stream dan sub-stream
        │
        ▼
PC Windows dalam LAN
├── Reverse Proxy
├── Frontend Web
├── Backend API
├── MediaMTX
└── PostgreSQL
        │
        └── WebRTC
        ▼
Chrome / Edge / Safari pada desktop, tablet, atau HP
```

### Stack rekomendasi

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Backend: NestJS dan TypeScript.
- Media gateway: MediaMTX.
- Database: PostgreSQL.
- Probe metadata RTSP: `ffprobe`.
- Packaging: Docker Compose.
- Development host: macOS.
- Deployment host: Windows dengan Docker Desktop dan WSL2.

## 6. Model Domain

### 6.1 Admin

```text
Admin
- id
- username
- passwordHash
- createdAt
- updatedAt
- lastLoginAt
```

Akun awal dibuat dari environment variable saat database belum memiliki admin:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ubah-password-kuat
```

Password disimpan sebagai hash. Nilai `.env` tidak mengubah akun yang sudah dibuat.

### 6.2 Device

Mewakili Hikvision IP camera, NVR, atau DVR.

```text
Device
- id
- name
- type: IP_CAMERA | NVR | DVR
- host
- httpPort
- rtspPort
- usernameEncrypted
- passwordEncrypted
- manufacturer
- model
- serialNumber
- firmwareVersion
- detectionMethod
- connectionStatus
- lastCheckedAt
- archivedAt
- createdAt
- updatedAt
```

### 6.3 Camera Channel

Mewakili satu titik kamera/channel dari perangkat.

```text
CameraChannel
- id
- deviceId
- channelNumber
- name
- location
- mainStreamPath
- subStreamPath
- mainCodec
- subCodec
- mainResolution
- subResolution
- mainFps
- subFps
- enabled
- availability: AVAILABLE | UNAVAILABLE
- connectionStatus: UNTESTED | ONLINE | OFFLINE | ERROR
- lastTestedAt
- createdAt
- updatedAt
```

`enabled` berbeda dari `connectionStatus`:

- `enabled`: kamera dipilih agar tersedia di dashboard.
- `disabled`: kamera tetap tersimpan, tetapi tidak tersedia di dashboard.
- `online/offline`: hasil test koneksi terakhir.

### 6.4 Group

```text
Group
- id
- name
- description
- isDefault
- createdAt
- updatedAt
```

### 6.5 Camera Group

Relasi many-to-many. Satu kamera dapat berada dalam banyak grup.

```text
CameraGroup
- cameraChannelId
- groupId
```

## 7. Integrasi Hikvision

### 7.1 Deteksi perangkat

Backend menggunakan Hikvision ISAPI melalui HTTP Digest Authentication untuk:

- Memvalidasi username dan password.
- Membaca manufacturer, model, serial number, dan firmware.
- Membaca daftar input/channel.
- Membaca informasi streaming channel jika tersedia.

Endpoint aktual harus dipilih berdasarkan kapabilitas firmware. Implementasi harus menangani variasi respons XML antar-model Hikvision.

### 7.2 Pola RTSP

Pola standar Hikvision:

```text
rtsp://{username}:{password}@{host}:{rtspPort}/Streaming/Channels/{streamId}
```

Contoh:

```text
101 = channel 1 main stream
102 = channel 1 sub-stream
201 = channel 2 main stream
202 = channel 2 sub-stream
```

Kredensial lengkap tidak boleh dikirim ke frontend atau ditampilkan dalam log.

### 7.3 Test RTSP

Backend menggunakan probe terbatas waktu untuk memeriksa:

- Host dan port dapat dijangkau.
- Autentikasi berhasil.
- RTSP path tersedia.
- Video track tersedia.
- Codec adalah H.265/HEVC.
- Resolusi dan FPS dapat dibaca.
- Main stream tersedia.
- Sub-stream tersedia.

H.264 dan codec selain H.265/HEVC ditolak. Tidak ada transcoding atau fallback H.264. Browser/perangkat client wajib mendukung WebRTC H.265/HEVC.

## 8. Persyaratan Fungsional

### FR-01 — Login admin

- Sistem menampilkan form username dan password.
- Kredensial valid membuat sesi admin.
- Kredensial salah menampilkan pesan generik.
- Halaman selain login memerlukan sesi aktif.
- Admin dapat logout.

### FR-02 — Daftar perangkat

- Menampilkan perangkat aktif dan arsip pada tab berbeda.
- Menampilkan nama, jenis, IP/hostname, model, jumlah channel, status terakhir, dan waktu pengecekan.
- Menyediakan pencarian berdasarkan nama, IP, model, dan serial number.

### FR-03 — Tambah perangkat

Form minimum:

```text
Nama perangkat
Jenis perangkat: IP Camera | NVR | DVR
IP/hostname
HTTP port
RTSP port
Username
Password
```

Nilai default:

```text
HTTP port: 80
RTSP port: 554
```

Admin harus menjalankan **Test & Detect** sebelum **Simpan** aktif.

### FR-04 — Test & Detect

Urutan proses:

1. Validasi format input.
2. Uji koneksi ISAPI.
3. Validasi autentikasi.
4. Ambil identitas perangkat.
5. Ambil semua channel.
6. Bentuk main dan sub-stream RTSP tiap channel.
7. Uji main dan sub-stream.
8. Tampilkan hasil per channel.
9. Aktifkan tombol **Simpan** jika perangkat tervalidasi.

Hasil per channel menampilkan:

- Nomor channel.
- Nama channel dari perangkat jika tersedia.
- Online/offline.
- Main/sub-stream tersedia atau tidak.
- Codec.
- Resolusi.
- FPS.
- Pesan error aman.

Semua channel disimpan otomatis dengan `enabled: false`, termasuk channel offline.

### FR-05 — Edit perangkat

- Admin dapat mengubah nama, host, port, username, dan password.
- Perubahan data koneksi mewajibkan **Test & Detect** ulang sebelum disimpan.
- Perubahan nama saja tidak memerlukan tes ulang.

### FR-06 — Arsip dan pulihkan perangkat

- Arsip menonaktifkan akses live seluruh channel perangkat.
- Data perangkat, channel, status `enabled`, dan relasi grup tetap tersimpan.
- Perangkat arsip dapat dipulihkan.
- Setelah dipulihkan, channel harus lolos test koneksi sebelum kembali live.
- Hapus permanen tersedia sebagai tindakan terpisah dengan konfirmasi eksplisit.

### FR-07 — Deteksi ulang channel

Admin menjalankan sinkronisasi manual:

- Channel baru ditambahkan sebagai `disabled`.
- Channel lama yang tidak ditemukan ditandai `unavailable`.
- Channel tidak dihapus otomatis.
- Nama kustom, lokasi, grup, dan status `enabled` tidak ditimpa.
- UI menampilkan ringkasan perubahan sebelum penyimpanan.

### FR-08 — Inventaris kamera

- Menampilkan seluruh channel dari semua perangkat.
- Mendukung inventaris 50+ kamera.
- Filter berdasarkan perangkat, grup, enabled/disabled, available/unavailable, dan status terakhir.
- Pencarian berdasarkan nama, lokasi, nomor channel, perangkat, dan IP.
- Admin dapat mengubah nama dan lokasi kamera.

### FR-09 — Enable kamera

- Kamera `disabled` harus menjalani test RTSP sebelum menjadi `enabled`.
- Main dan sub-stream harus H.265/HEVC.
- Kamera unavailable tidak dapat diaktifkan.
- Kamera dapat dinonaktifkan tanpa tes.
- Kamera yang offline setelah pernah aktif tetap `enabled`; dashboard menampilkan kegagalan stream.

### FR-10 — Grup kamera

- Admin dapat membuat, mengubah, dan menghapus grup.
- Nama grup harus unik.
- Satu kamera dapat masuk banyak grup.
- Penghapusan grup tidak menghapus kamera.
- Admin dapat memilih satu grup default.
- Jika grup default kosong atau dihapus, dashboard menampilkan semua kamera `enabled`.

### FR-11 — Dashboard

- Dashboard pertama membuka grup default.
- Hanya kamera `enabled` dan tidak terarsip yang tampil.
- Kamera diurutkan alfabetis berdasarkan nama.
- Layout tersedia: 1, 4, 9, atau 16.
- Layout default: 4 kamera atau 2×2.
- Maksimal 16 kamera per halaman.
- Pagination tersedia jika kamera dalam grup melebihi kapasitas layout.
- Hanya stream pada halaman aktif yang dibuka.
- Saat pindah halaman atau grup, koneksi stream lama ditutup.

### FR-12 — Live player

- Grid menggunakan sub-stream H.265/HEVC melalui WebRTC.
- Fullscreen satu kamera menutup sub-stream dan membuka main stream.
- Saat keluar fullscreen, main stream ditutup dan sub-stream dibuka kembali.
- Jika main stream gagal, player kembali ke sub-stream dan menampilkan peringatan.
- Stream tanpa audio.
- Loading, online, offline, dan error memiliki tampilan berbeda.
- Tombol **Coba Lagi** tersedia saat stream gagal.
- Kegagalan satu kamera tidak menghentikan player lain.

### FR-13 — Fullscreen

Dua mode:

1. Fullscreen grid: seluruh dashboard masuk layar penuh dan mempertahankan layout.
2. Fullscreen kamera: satu kamera memakai main stream.

`Esc` keluar dari fullscreen. Kontrol disembunyikan ketika tidak digunakan dan muncul saat hover atau tap.

### FR-14 — Cek status manual

- Tidak ada scheduler status berkala.
- Admin dapat mengecek satu channel, satu perangkat, atau semua perangkat.
- Status dan waktu pengecekan terakhir disimpan.
- Cek semua perangkat menampilkan progres dan hasil parsial.

### FR-15 — Responsif

- Desktop: layout 1/4/9/16.
- Tablet: layout menyesuaikan lebar layar.
- HP: satu atau dua kolom sesuai orientasi dan ukuran layar.
- Kontrol harus dapat digunakan dengan mouse dan touch.

## 9. Alur Utama

### 9.1 Menambah NVR/DVR

```text
Login
→ Perangkat
→ Tambah Perangkat
→ Isi nama, IP, port, username, password
→ Test & Detect
→ Tinjau identitas dan daftar channel
→ Simpan
→ Semua channel masuk inventaris sebagai disabled
```

### 9.2 Mengaktifkan kamera

```text
Inventaris Kamera
→ Pilih channel
→ Isi nama dan lokasi
→ Pilih grup
→ Test Stream
→ Hasil H.265/HEVC berhasil
→ Enable
→ Kamera tersedia pada dashboard
```

### 9.3 Memantau kamera

```text
Login
→ Dashboard membuka grup default
→ Grid 2×2 memakai sub-stream
→ Pilih grup atau halaman
→ Klik kamera
→ Main stream terbuka fullscreen
→ Esc
→ Kembali ke grid sub-stream
```

## 10. API Konseptual

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session
PUT    /api/auth/password

GET    /api/devices
POST   /api/devices/test-detect
POST   /api/devices
GET    /api/devices/:id
PUT    /api/devices/:id
POST   /api/devices/:id/redetect
POST   /api/devices/:id/check-status
POST   /api/devices/:id/archive
POST   /api/devices/:id/restore
DELETE /api/devices/:id

GET    /api/cameras
GET    /api/cameras/:id
PUT    /api/cameras/:id
POST   /api/cameras/:id/test
POST   /api/cameras/:id/enable
POST   /api/cameras/:id/disable
POST   /api/cameras/check-status

GET    /api/groups
POST   /api/groups
PUT    /api/groups/:id
DELETE /api/groups/:id
PUT    /api/groups/:id/cameras
POST   /api/groups/:id/default

GET    /api/dashboard
POST   /api/streams/:cameraId/session
DELETE /api/streams/:cameraId/session/:sessionId
```

Frontend hanya menerima ID/path publik MediaMTX atau session token berumur pendek. Frontend tidak menerima RTSP URI berkredensial.

## 11. Pengelolaan Stream

- MediaMTX mengambil RTSP hanya ketika stream dibutuhkan jika mode on-demand tersedia dan stabil.
- Setiap camera channel memiliki path publik yang tidak mengandung kredensial.
- Grid membuka sub-stream.
- Fullscreen kamera membuka main stream.
- Unmount komponen, pindah halaman, pindah grup, logout, dan tab hidden berkepanjangan harus menutup sesi player yang tidak diperlukan.
- Satu sumber MediaMTX dapat dibagikan kepada 1–3 perangkat browser bersamaan.
- Backend mengontrol apakah camera channel boleh dibuatkan sesi stream berdasarkan status `enabled`.

## 12. UI/UX

### 12.1 Identitas dan arah visual

Nama produk: **CCTV Monitor**.

Gaya visual memakai control room profesional: padat, tajam, utilitarian, minim dekorasi, dan menempatkan video sebagai fokus utama. Implementasi menggunakan shadcn/ui dan ikon Lucide.

- Dark mode tetap; tidak ada theme switcher.
- Palet utama monokrom hitam, putih, dan abu-abu.
- Warna hanya dipakai untuk status dan feedback.
- Radius komponen kecil; hindari card besar dan rounded berlebihan.
- Efek gradient hanya boleh dipakai sebagai overlay keterbacaan pada video.
- Tidak memakai glassmorphism, ilustrasi dekoratif, atau animasi berlebihan.
- Tombol utama putih dengan teks hitam.
- Tombol sekunder transparan dengan border abu-abu.
- Focus ring harus terlihat untuk navigasi keyboard.

### 12.2 Design tokens

Palet awal memakai token semantik agar nilai akhir dapat disesuaikan saat implementasi:

```text
Background utama   neutral-950
Panel               neutral-900
Panel elevated      neutral-850 atau padanan token CSS
Border              neutral-800
Teks utama          neutral-50
Teks sekunder       neutral-400
Hover/selected      neutral-800
Berhasil/online     blue
Error/offline       red
Proses/peringatan   orange
Disabled/arsip      neutral
```

Aturan warna status:

- Biru: berhasil dan online.
- Merah: error dan offline.
- Oranye: proses, belum dites, dan peringatan.
- Abu-abu: disabled, unavailable, dan arsip.

Warna bukan satu-satunya indikator; selalu sertakan ikon atau label teks.

Spacing memakai skala 4px. Ukuran kontrol dan tabel dibuat compact tanpa mengurangi area sentuh minimum pada perangkat touch.

### 12.3 Tipografi

- Font UI: Inter.
- Ukuran dasar desktop: 14px.
- Nama kamera: medium atau semibold.
- Metadata: regular dengan warna teks sekunder.
- IP, port, channel, codec, resolusi, FPS, dan angka teknis memakai tabular numerals.
- Tidak memakai font dekoratif atau italic pada heading.

### 12.4 Navigasi

```text
Dashboard
Perangkat
Inventaris Kamera
Grup
Pengaturan
Logout
```

- Desktop memakai sidebar collapsible.
- Keadaan default sidebar desktop: tertutup menjadi ikon dengan lebar sekitar 56–64px.
- Tooltip muncul saat ikon di-hover atau difokuskan.
- Preferensi collapse disimpan di browser.
- Tablet memakai sidebar overlay.
- HP memakai komponen `Sheet`.
- Fullscreen grid menyembunyikan sidebar dan header.

Komponen shadcn/ui utama: `Sidebar`, `Table`, `Dialog`, `AlertDialog`, `Sheet`, `Tabs`, `Badge`, `Form`, `Skeleton`, `Tooltip`, `DropdownMenu`, dan toast notification.

### 12.5 Dashboard

Header dashboard minimal dengan tinggi sekitar 48px. Isinya:

- Nama grup aktif.
- Jumlah kamera.
- Pemilih layout 1/4/9/16.
- Pagination.
- Tombol fullscreen grid.

Header tidak menampilkan jam, pencarian, status server, atau tombol refresh. Header hilang saat fullscreen grid.

Tile CCTV memakai desain edge-to-edge:

- Rasio tile default 16:9.
- Video memakai `object-fit: contain`; seluruh frame harus terlihat tanpa crop.
- Ruang kosong akibat perbedaan rasio memakai hitam murni.
- Nama kamera dan lokasi berada pada overlay gradient tipis di bawah.
- Status berada pada sisi kanan overlay.
- Kontrol muncul saat hover, focus-within, atau tap.
- Loading memakai `Skeleton` dengan ukuran tile tetap.
- Offline/error mempertahankan ukuran tile dan memakai border merah tipis.
- Klik tile membuka fullscreen satu kamera.
- Fullscreen juga memakai `object-fit: contain`.

### 12.6 Halaman admin

Daftar NVR dan inventaris kamera memakai density compact:

- Tinggi baris tabel sekitar 40px.
- Filter dan pencarian berada pada satu toolbar.
- Status memakai label kecil.
- Aksi sekunder berada dalam menu `…`.
- Desktop memaksimalkan jumlah baris terlihat.
- HP mengganti tabel lebar menjadi list compact agar tidak menimbulkan horizontal scroll.

### 12.7 Wizard tambah perangkat

Tambah NVR/DVR/IP camera memakai halaman penuh dengan empat tahap:

```text
1. Data Koneksi
2. Test & Detect
3. Review Channel
4. Simpan
```

- Stepper monokrom berada di bagian atas.
- Tahap aktif/proses memakai oranye.
- Tahap berhasil memakai biru.
- Tahap gagal memakai merah.
- Tombol **Lanjut** terkunci sampai tahap aktif valid.
- Review hingga 32 channel memakai tabel compact.
- Data form tetap tersimpan saat admin kembali ke tahap sebelumnya.
- Password tidak pernah muncul pada ringkasan.

### 12.8 Login

- Latar hitam polos.
- Form kecil terpusat.
- Nama **CCTV Monitor** dan ikon monokrom.
- Input username dan password.
- Tombol masuk putih dengan teks hitam.
- Error login merah berada dekat field/form terkait.
- Versi aplikasi tampil kecil di bagian bawah.
- Tidak memakai ilustrasi, statistik, atau preview CCTV dekoratif.

### 12.9 Responsif dan aksesibilitas

- Tidak boleh ada horizontal scroll pada lebar 320, 375, 414, dan 768px.
- Desktop mendukung layout 1/4/9/16.
- Tablet dan HP menurunkan jumlah kolom sesuai ruang tanpa memotong video.
- Seluruh kontrol dapat digunakan dengan mouse, keyboard, dan touch.
- Klik/tap target pada perangkat touch minimal 44×44px meski tampilan visual compact.
- Semua input memiliki label.
- Status tidak bergantung pada warna saja.
- Loading dan perubahan status penting diumumkan melalui live region jika sesuai.
- Animasi menghormati `prefers-reduced-motion`.

### 12.10 State interaksi

Komponen interaktif wajib mendukung state relevan:

```text
default
hover
focus-visible
active
disabled
loading
error
success
```

Motion dibatasi pada feedback singkat sekitar 120–180ms. Tidak ada animasi ornamental pada video grid.

### 12.11 Pesan error

Pesan harus membantu tanpa membocorkan kredensial:

```text
Tidak dapat menjangkau perangkat.
Username atau password ditolak perangkat.
ISAPI tidak tersedia pada perangkat ini.
Channel 4 tidak memiliki video stream.
Channel 2 tidak memakai H.265/HEVC. Ubah encoding menjadi H.265.
RTSP timeout setelah batas waktu koneksi.
```

## 13. Keamanan

- Aplikasi hanya ditujukan untuk LAN.
- RTSP port dan database tidak dipublikasikan keluar host kecuali diperlukan di LAN.
- Username/password perangkat dienkripsi saat disimpan.
- Password admin di-hash memakai Argon2id atau bcrypt dengan cost kuat.
- Secret enkripsi berasal dari `.env`, bukan database.
- RTSP URI berkredensial tidak dikirim ke frontend.
- Kredensial tidak ditulis ke application log.
- Login memiliki rate limit dan penundaan setelah kegagalan berulang.
- Cookie sesi memakai `HttpOnly` dan `SameSite=Strict`.
- Operasi hapus permanen memerlukan password admin atau konfirmasi nama perangkat.
- XML ISAPI diproses dengan parser yang menonaktifkan external entity.
- Input host tidak boleh digunakan untuk menjalankan shell command mentah.

## 14. Kinerja

Target MVP:

- 50+ kamera tersimpan dalam inventaris.
- Kamera `enabled` tidak dibatasi aplikasi.
- Maksimal 16 player aktif per halaman browser.
- 1–3 perangkat browser bersamaan.
- Tidak ada transcoding.
- Dashboard interaktif dalam 2 detik, tidak termasuk waktu koneksi stream.
- Status loading stream pertama terlihat dalam 500 ms.
- Timeout test koneksi dapat dikonfigurasi.
- Proses test banyak channel memiliki batas concurrency agar tidak membebani NVR.

Rekomendasi Hikvision sub-stream:

```text
Codec: H.265/HEVC
Resolution: 640×360 atau 704×576
FPS: 10–15
Bitrate: 256–768 Kbps
```

Main stream mengikuti kemampuan kamera, tetap H.265/HEVC. Tidak ada transcoding ke H.264.

## 15. Deployment

### Development macOS

```bash
docker compose up -d
```

### Deployment Windows

Persyaratan:

- Windows 10/11 64-bit.
- Docker Desktop.
- WSL2.
- PC berada dalam LAN yang dapat menjangkau semua Hikvision.

Menjalankan manual:

```powershell
docker compose up -d
```

Menghentikan:

```powershell
docker compose down
```

Volume persisten menyimpan PostgreSQL dan konfigurasi yang dibutuhkan. `docker compose down` tidak boleh menghapus volume kecuali operator memakai opsi penghapusan volume secara eksplisit.

## 16. Penanganan Error

- ISAPI gagal, tetapi host dapat dijangkau: tampilkan error ISAPI; perangkat tidak dapat disimpan pada MVP karena deteksi otomatis diwajibkan.
- Sebagian channel gagal: perangkat tetap dapat disimpan; channel gagal tersimpan sebagai offline/disabled.
- Sub-stream gagal: kamera tidak dapat di-enable sampai sub-stream H.265/HEVC berhasil.
- Main stream gagal: kamera tidak dapat di-enable sampai main stream H.265/HEVC berhasil.
- Stream terputus saat dashboard: tile menampilkan error lokal dan **Coba Lagi**.
- MediaMTX tidak tersedia: seluruh tile menampilkan gateway unavailable; admin diarahkan memeriksa service.
- Database tidak tersedia: aplikasi menampilkan service unavailable tanpa membocorkan detail internal.

## 17. Acceptance Criteria MVP

1. Admin dapat login memakai akun yang dibuat dari `.env`.
2. Admin dapat menambah Hikvision NVR dengan IP, port, username, dan password.
3. **Test & Detect** menampilkan identitas perangkat dan seluruh channel yang dilaporkan ISAPI.
4. Sistem mendukung NVR 4, 8, 16, dan 32 channel tanpa konfigurasi kapasitas manual.
5. Semua channel tersimpan otomatis sebagai `disabled`.
6. Admin dapat menyimpan beberapa NVR dengan total sedikitnya 50 channel.
7. Admin dapat mengubah nama dan lokasi setiap channel.
8. Admin dapat memasukkan satu kamera ke beberapa grup.
9. Admin dapat memilih satu grup default.
10. Kamera tidak dapat di-enable sebelum main dan sub-stream lolos tes H.265/HEVC.
11. Dashboard default menampilkan layout 2×2 dari grup default.
12. Admin dapat memilih layout 1/4/9/16.
13. Dashboard hanya membuka stream pada halaman aktif.
14. Grid memutar sub-stream H.265/HEVC melalui WebRTC tanpa audio pada browser/perangkat yang kompatibel.
15. Fullscreen satu kamera memutar main stream dan kembali ke sub-stream saat ditutup.
16. Seluruh grid dapat masuk mode fullscreen.
17. Kegagalan satu stream tidak menghentikan stream lain.
18. Admin dapat menjalankan cek status manual.
19. Deteksi ulang menambah channel baru dan menandai channel hilang tanpa menghapus metadata admin.
20. Arsip perangkat mempertahankan data dan menghentikan live stream.
21. Aplikasi berjalan lewat Docker Compose pada macOS dan Windows.
22. RTSP URI dan password perangkat tidak terlihat dalam frontend atau log normal.

## 18. Tahapan Implementasi

### Fase 1 — Fondasi

- Docker Compose.
- PostgreSQL.
- Backend dan frontend skeleton.
- Login admin dari `.env`.
- Skema database.

### Fase 2 — Integrasi Hikvision

- ISAPI client dengan Digest Auth.
- Deteksi identitas dan channel.
- RTSP path builder.
- `ffprobe` validation.
- CRUD perangkat dan inventaris kamera.

### Fase 3 — Media dan Dashboard

- MediaMTX integration.
- WebRTC player.
- Layout 1/4/9/16.
- Pagination.
- Fullscreen grid dan kamera.
- Lifecycle stream on-demand.

### Fase 4 — Grup dan Operasional

- Grup many-to-many.
- Grup default.
- Enable/disable dengan validasi.
- Cek status manual.
- Arsip/pulihkan.
- Deteksi ulang channel.

### Fase 5 — Hardening

- Enkripsi kredensial.
- Rate limit login.
- Sanitasi log.
- Error handling lintas model Hikvision.
- Pengujian Windows.
- Dokumentasi instalasi dan backup.

## 19. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Variasi ISAPI antar-firmware | Channel tidak terdeteksi | Capability check, parser XML toleran, fixture beberapa model |
| Browser/perangkat tidak mendukung WebRTC H.265/HEVC | Video tidak tampil | Deteksi capability dan tampilkan error kompatibilitas; tanpa fallback H.264 |
| Main/sub-stream tidak tersedia | Kamera tidak bisa di-enable | Hasil tes per stream dan pesan spesifik |
| Banyak test RTSP bersamaan | NVR atau jaringan terbebani | Batasi concurrency dan timeout |
| Docker Desktop Windows berhenti | Website tidak tersedia | Health check dan panduan start manual |
| Kredensial muncul dalam log | Kebocoran akses CCTV | Redaction menyeluruh dan structured logging |
| Browser membuka terlalu banyak stream | CPU/bandwidth tinggi | Maksimal 16 per halaman dan close stream lama |
| Nama channel berubah di NVR | Metadata admin tertimpa | Sinkronisasi tidak menimpa nama/lokasi/grup lokal |

## 20. Keputusan Produk Final

- Lingkungan: LAN lokal.
- Development: macOS.
- Deployment: PC Windows, dijalankan manual.
- Vendor: Hikvision saja.
- Integrasi: ISAPI + RTSP, tanpa ONVIF.
- Playback: live saja.
- Codec: H.265/HEVC wajib; H.264 ditolak.
- Browser protocol: WebRTC melalui MediaMTX.
- Audio: tidak ada.
- Akun: satu admin dari `.env`.
- Inventaris: tanpa batas aplikasi.
- Kamera enabled: tanpa batas aplikasi.
- Player aktif: maksimal 16 per halaman.
- Pengguna bersamaan: 1–3 perangkat.
- Grup: many-to-many dengan satu grup default.
- Layout default: 2×2.
- Status: dicek manual.
- Penghapusan normal: arsip.
