# webcam-bridge/windows-push.ps1
# Push webcam ke MediaMTX supaya analytics worker bisa membacanya via RTSP.
# Jalankan di Windows host (bukan di WSL2 / Docker container).
#
# Prasyarat:
#   - ffmpeg tersedia di PATH (winget install ffmpeg  ATAU  choco install ffmpeg)
#   - MediaMTX sudah jalan (docker compose up mediamtx)
#
# Penggunaan:
#   .\windows-push.ps1                          # webcam pertama (index 0)
#   .\windows-push.ps1 -CameraIndex 1           # webcam kedua
#   .\windows-push.ps1 -SlotName "kasir-2"      # custom nama stream
#   .\windows-push.ps1 -MediaMtxHost 192.168.1.10  # MediaMTX di mesin lain (LAN)

param(
    [int]    $CameraIndex  = 0,
    [string] $SlotName     = "kasir-1",
    [string] $MediaMtxHost = "localhost",
    [int]    $MediaMtxPort = 8954,
    [int]    $FrameRate    = 10,
    [string] $Resolution   = "640x480"
)

# ── Validasi ffmpeg ────────────────────────────────────────────────────────────
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg tidak ditemukan. Install dulu: winget install ffmpeg"
    exit 1
}

# ── Cari nama device webcam dari DirectShow ────────────────────────────────────
Write-Host "Mendaftar webcam yang tersedia..."
$deviceList = ffmpeg -list_devices true -f dshow -i dummy 2>&1 |
              Select-String '"[^"]*"' |
              ForEach-Object { $_.Matches[0].Value -replace '"', '' }

if ($deviceList.Count -eq 0) {
    Write-Error "Tidak ada webcam ditemukan di sistem ini."
    exit 1
}

Write-Host "Webcam terdeteksi:"
for ($i = 0; $i -lt $deviceList.Count; $i++) {
    $marker = if ($i -eq $CameraIndex) { " ◄ DIPILIH" } else { "" }
    Write-Host "  [$i] $($deviceList[$i])$marker"
}

if ($CameraIndex -ge $deviceList.Count) {
    Write-Error "CameraIndex $CameraIndex tidak valid. Pilih 0-$($deviceList.Count - 1)."
    exit 1
}

$deviceName = $deviceList[$CameraIndex]
$rtspUrl    = "rtsp://${MediaMtxHost}:${MediaMtxPort}/webcam-${SlotName}"

Write-Host ""
Write-Host "Streaming: $deviceName"
Write-Host "  → $rtspUrl"
Write-Host "  Frame rate : $FrameRate fps"
Write-Host "  Resolusi   : $Resolution"
Write-Host "  Ctrl+C untuk berhenti."
Write-Host ""

# ── Push ke MediaMTX ─────────────────────────────────────────────────────────
# -re          : baca sesuai frame rate sumber (tidak rush)
# -rtsp_transport tcp : gunakan TCP supaya stabil di LAN
ffmpeg `
    -f dshow `
    -framerate $FrameRate `
    -video_size $Resolution `
    -i "video=$deviceName" `
    -vf "scale=${Resolution}" `
    -c:v libx264 `
    -preset ultrafast `
    -tune zerolatency `
    -pix_fmt yuv420p `
    -g ($FrameRate * 2) `
    -f rtsp `
    -rtsp_transport tcp `
    $rtspUrl
