#!/usr/bin/env bash
# webcam-bridge/mac-push.sh
# Push webcam ke MediaMTX supaya analytics worker bisa membacanya via RTSP.
# Jalankan di macOS host (bukan di Docker container).
#
# Prasyarat:
#   - ffmpeg tersedia: brew install ffmpeg
#   - MediaMTX sudah jalan (docker compose up mediamtx)
#
# Penggunaan:
#   ./mac-push.sh                                   # webcam pertama
#   ./mac-push.sh -i 1                              # webcam index 1
#   ./mac-push.sh -s kasir-2                        # custom slot name
#   ./mac-push.sh -h 192.168.1.10                   # MediaMTX di host lain

set -euo pipefail

CAMERA_INDEX=0
SLOT_NAME="kasir-1"
MEDIAMTX_HOST="localhost"
MEDIAMTX_PORT=8954
FRAME_RATE=10
RESOLUTION="640x480"

usage() {
	echo "Penggunaan: $0 [-i camera_index] [-s slot_name] [-h mediamtx_host] [-p port] [-r fps] [-v resolusi]"
	exit 1
}

while getopts "i:s:h:p:r:v:" opt; do
	case $opt in
	i) CAMERA_INDEX=$OPTARG ;;
	s) SLOT_NAME=$OPTARG ;;
	h) MEDIAMTX_HOST=$OPTARG ;;
	p) MEDIAMTX_PORT=$OPTARG ;;
	r) FRAME_RATE=$OPTARG ;;
	v) RESOLUTION=$OPTARG ;;
	*) usage ;;
	esac
done

# ── Validasi ffmpeg ────────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
	echo "Error: ffmpeg tidak ditemukan. Install: brew install ffmpeg" >&2
	exit 1
fi

# ── Daftar device via AVFoundation ────────────────────────────────────────────
echo "Mendaftar webcam yang tersedia (macOS AVFoundation)..."
DEVICE_LIST=$(ffmpeg -f avfoundation -list_devices true -i "" 2>&1 |
	grep -E '^\[AVFoundation.*\] \[([0-9]+)\]' |
	grep -iv 'audio\|microphone\|built-in mic' |
	sed 's/.*\[\([0-9]*\)\] \(.*\)/\1:\2/' ||
	true)

if [[ -z "$DEVICE_LIST" ]]; then
	echo "Tidak ada webcam video terdeteksi. Pastikan izin kamera sudah diberikan." >&2
	exit 1
fi

echo "Webcam terdeteksi:"
while IFS=: read -r idx name; do
	marker=""
	[[ "$idx" == "$CAMERA_INDEX" ]] && marker=" ◄ DIPILIH"
	printf "  [%s] %s%s\n" "$idx" "$name" "$marker"
done <<<"$DEVICE_LIST"

RTSP_URL="rtsp://${MEDIAMTX_HOST}:${MEDIAMTX_PORT}/webcam-${SLOT_NAME}"

echo ""
echo "Streaming webcam index $CAMERA_INDEX"
echo "  → $RTSP_URL"
echo "  Frame rate : $FRAME_RATE fps"
echo "  Resolusi   : $RESOLUTION"
echo "  Ctrl+C untuk berhenti."
echo ""

# ── Push ke MediaMTX ─────────────────────────────────────────────────────────
GOP=$((FRAME_RATE * 2))
ffmpeg \
	-f avfoundation \
	-framerate "$FRAME_RATE" \
	-video_size "$RESOLUTION" \
	-i "${CAMERA_INDEX}" \
	-vf "scale=${RESOLUTION}" \
	-c:v libx264 \
	-preset ultrafast \
	-tune zerolatency \
	-pix_fmt yuv420p \
	-g "$GOP" \
	-f rtsp \
	-rtsp_transport tcp \
	"$RTSP_URL"
