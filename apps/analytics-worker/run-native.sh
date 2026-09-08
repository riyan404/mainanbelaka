#!/usr/bin/env bash
# -----------------------------------------------------------
# Jalankan analytics-worker secara NATIVE di macOS (tanpa Docker)
# Performa 3-4x lebih cepat karena akses langsung ke Apple Silicon.
#
# Prasyarat:
#   cd apps/analytics-worker
#   /opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
#   .venv/bin/pip install ultralytics opencv-python-headless httpx insightface onnxruntime
#
# Jalankan:
#   bash run-native.sh
# -----------------------------------------------------------
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Aktifkan venv
source .venv/bin/activate

# --- Environment (sesuaikan dengan .env.dev / docker-compose.dev.yml) ---
export ANALYTICS_API_URL="${ANALYTICS_API_URL:-http://localhost:4418/api}"
export ANALYTICS_WORKER_TOKEN="${ANALYTICS_WORKER_TOKEN:-dev-analytics-token-change-me}"
export ANALYTICS_MODEL_PATH="${ANALYTICS_MODEL_PATH:-yolo11n-pose.pt}"
export ANALYTICS_SAMPLE_INTERVAL_MS="${ANALYTICS_SAMPLE_INTERVAL_MS:-1000}"
export ANALYTICS_MIN_DWELL_SECONDS="${ANALYTICS_MIN_DWELL_SECONDS:-30}"
export ANALYTICS_MEDIAMTX_RTSP_HOST="${ANALYTICS_MEDIAMTX_RTSP_HOST:-localhost}"
export ANALYTICS_MEDIAMTX_RTSP_PORT="${ANALYTICS_MEDIAMTX_RTSP_PORT:-8554}"
export ANALYTICS_TRACK_TIMEOUT_SECONDS="${ANALYTICS_TRACK_TIMEOUT_SECONDS:-5.0}"
export ANALYTICS_SNAPSHOT_DIR="${ANALYTICS_SNAPSHOT_DIR:-/tmp/snapshots}"
export ANALYTICS_SYNC_INTERVAL_SECONDS="${ANALYTICS_SYNC_INTERVAL_SECONDS:-30.0}"
export STAFF_FACE_DIR="${STAFF_FACE_DIR:-/tmp/staff-faces}"

# Gunakan CoreML provider (Apple Silicon Neural Engine)
export ONNX_PROVIDERS="CoreMLExecutionProvider,CPUExecutionProvider"

# Pastikan direktori snapshot & faces ada
mkdir -p "$ANALYTICS_SNAPSHOT_DIR" "$STAFF_FACE_DIR"

echo "=== Analytics Worker (Native macOS) ==="
echo "API:      $ANALYTICS_API_URL"
echo "RTSP:     rtsp://$ANALYTICS_MEDIAMTX_RTSP_HOST:$ANALYTICS_MEDIAMTX_RTSP_PORT"
echo "Interval: ${ANALYTICS_SAMPLE_INTERVAL_MS}ms"
echo "Python:   $(python --version)"
echo "======================================="

exec python -m src.main
