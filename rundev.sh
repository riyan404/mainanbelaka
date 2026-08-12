#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DEV_DIR="$ROOT_DIR/.dev"
PG_DATA="$DEV_DIR/postgres"
PG_LOG="$DEV_DIR/postgres.log"
ENV_FILE="$ROOT_DIR/.env.dev"
MEDIAMTX_CONFIG="$ROOT_DIR/infra/mediamtx/mediamtx.dev.yml"

if [[ ! -f "$ENV_FILE" ]]; then
	cp "$ROOT_DIR/.env.dev.example" "$ENV_FILE"
	echo "[setup] Membuat .env.dev dari .env.dev.example"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

WEB_PORT="${WEB_PORT:-3417}"
API_PORT="${API_PORT:-4417}"
POSTGRES_PORT="${POSTGRES_PORT:-5517}"
MEDIAMTX_RTSP_PORT="${MEDIAMTX_RTSP_PORT:-8517}"
MEDIAMTX_WEBRTC_PORT="${MEDIAMTX_WEBRTC_PORT:-8917}"
MEDIAMTX_WEBRTC_UDP_PORT="${MEDIAMTX_WEBRTC_UDP_PORT:-8918}"
MEDIAMTX_API_PORT="${MEDIAMTX_API_PORT:-9917}"
POSTGRES_DB="${POSTGRES_DB:-cctv_dev}"
POSTGRES_USER="${POSTGRES_USER:-$(id -un)}"

export API_PORT
export WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:$WEB_PORT}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:$API_PORT/api}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:$API_PORT/api}"
export NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL="${NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL:-http://localhost:$MEDIAMTX_WEBRTC_PORT}"
export MEDIAMTX_PUBLIC_WEBRTC_URL="${MEDIAMTX_PUBLIC_WEBRTC_URL:-http://localhost:$MEDIAMTX_WEBRTC_PORT}"
export MEDIAMTX_API_URL="http://127.0.0.1:$MEDIAMTX_API_PORT"
export DATABASE_URL="postgresql://$POSTGRES_USER@127.0.0.1:$POSTGRES_PORT/$POSTGRES_DB?schema=public"

if command -v brew >/dev/null 2>&1; then
	PG_PREFIX="$(brew --prefix postgresql@16 2>/dev/null || true)"
	[[ -n "$PG_PREFIX" ]] && export PATH="$PG_PREFIX/bin:$PATH"
fi

required=(node npm ffprobe initdb pg_ctl createdb psql mediamtx)
missing=()
for command_name in "${required[@]}"; do
	command -v "$command_name" >/dev/null 2>&1 || missing+=("$command_name")
done

if ((${#missing[@]} > 0)); then
	echo "[error] Dependency belum tersedia: ${missing[*]}" >&2
	if command -v brew >/dev/null 2>&1; then
		echo "[fix] Jalankan: brew install postgresql@16 mediamtx ffmpeg" >&2
	else
		echo "[fix] Instal PostgreSQL 16, MediaMTX, dan FFmpeg; lalu ulangi bash rundev.sh" >&2
	fi
	exit 1
fi

port_in_use() {
	lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

for port in "$WEB_PORT" "$API_PORT" "$POSTGRES_PORT" "$MEDIAMTX_RTSP_PORT" "$MEDIAMTX_WEBRTC_PORT" "$MEDIAMTX_API_PORT"; do
	if port_in_use "$port"; then
		echo "[error] Port $port sedang dipakai. Ubah port di .env.dev atau hentikan proses pemakai." >&2
		lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
		exit 1
	fi
done

mkdir -p "$DEV_DIR"

if [[ ! -d "$PG_DATA/base" ]]; then
	echo "[postgres] Inisialisasi database lokal di .dev/postgres"
	initdb -D "$PG_DATA" -A trust -U "$POSTGRES_USER" --no-locale --encoding=UTF8 >/dev/null
fi

PG_STARTED=0
MEDIAMTX_PID=""
cleanup() {
	local exit_code=$?
	trap - EXIT INT TERM
	echo
	echo "[stop] Menghentikan CCTV Monitor dev..."
	[[ -n "$MEDIAMTX_PID" ]] && kill "$MEDIAMTX_PID" 2>/dev/null || true
	if [[ "$PG_STARTED" == "1" ]]; then
		pg_ctl -D "$PG_DATA" -m fast stop >/dev/null 2>&1 || true
	fi
	exit "$exit_code"
}
trap cleanup EXIT INT TERM

printf "[postgres] Start port %s\n" "$POSTGRES_PORT"
pg_ctl -D "$PG_DATA" -l "$PG_LOG" -o "-h 127.0.0.1 -p $POSTGRES_PORT" start >/dev/null
PG_STARTED=1

for _ in {1..30}; do
	pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1 && break
	sleep 0.2
done
if ! pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; then
	echo "[error] PostgreSQL gagal start. Cek $PG_LOG" >&2
	exit 1
fi

if ! psql -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | grep -q 1; then
	createdb -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB"
	echo "[postgres] Database $POSTGRES_DB dibuat"
fi

if [[ ! -d node_modules ]]; then
	echo "[npm] Install dependency"
	npm install --cache .npm-cache
fi

echo "[prisma] Generate client dan apply migration"
npm run prisma:generate --workspace @cctv/api >/dev/null
npm run prisma:migrate --workspace @cctv/api >/dev/null

echo "[mediamtx] Start RTSP :$MEDIAMTX_RTSP_PORT · WebRTC :$MEDIAMTX_WEBRTC_PORT · API :$MEDIAMTX_API_PORT"
mediamtx "$MEDIAMTX_CONFIG" >"$DEV_DIR/mediamtx.log" 2>&1 &
MEDIAMTX_PID=$!
sleep 0.8
if ! kill -0 "$MEDIAMTX_PID" 2>/dev/null; then
	echo "[error] MediaMTX gagal start. Cek $DEV_DIR/mediamtx.log" >&2
	exit 1
fi

cat <<EOF

CCTV Monitor dev aktif
  Web       http://localhost:$WEB_PORT
  API       http://localhost:$API_PORT/api
  Health    http://localhost:$API_PORT/api/health
  WebRTC    http://localhost:$MEDIAMTX_WEBRTC_PORT
  PostgreSQL 127.0.0.1:$POSTGRES_PORT/$POSTGRES_DB

Login awal
  Username  ${ADMIN_USERNAME:-admin}
  Password  lihat ADMIN_PASSWORD di .env.dev

Tekan Ctrl+C untuk stop semua service.
EOF

npm exec -- concurrently --kill-others --names API,WEB --prefix-colors blue,white \
	"npm run dev --workspace @cctv/api" \
	"npm run dev --workspace @cctv/web -- --hostname 0.0.0.0 --port $WEB_PORT"
