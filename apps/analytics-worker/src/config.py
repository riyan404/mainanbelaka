"""Konfigurasi worker melalui environment variables."""

from pydantic_settings import BaseSettings


class WorkerConfig(BaseSettings):
    """Semua konfigurasi worker di-load dari env dengan prefix ANALYTICS_."""

    # Koneksi ke NestJS API internal
    api_url: str = "http://api:4000/api"
    worker_token: str = ""

    # Model YOLO
    model_path: str = "yolo11n-pose.pt"

    # Ambang confidence deteksi (di bawah ini = false positive, dibuang)
    detection_conf_threshold: float = 0.30

    # Resolusi inferensi YOLO (naikkan untuk deteksi orang kecil/jauh)
    detection_imgsz: int = 736

    # Sampling
    sample_interval_ms: int = 1000

    # MediaMTX
    mediamtx_rtsp_host: str = "mediamtx"
    mediamtx_rtsp_port: int = 8554

    # Tracking
    track_timeout_seconds: float = 5.0

    # Event buffer
    event_flush_interval_seconds: float = 5.0
    event_buffer_max: int = 500
    event_batch_size: int = 50

    # Snapshot
    snapshot_dir: str = "/tmp/snapshots"

    # Live state push (overlay realtime di dashboard)
    live_state_interval_seconds: float = 2.0
    live_state_max_tracks: int = 30

    # Sync interval untuk fetch active cameras dari API
    sync_interval_seconds: float = 30.0

    # Logging
    log_level: str = "INFO"

    model_config = {"env_prefix": "ANALYTICS_"}


config = WorkerConfig()
