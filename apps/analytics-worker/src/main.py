"""Entrypoint Analytics Worker.

Fase C lengkap: load config → init model → start health server → start orchestrator.
"""

import logging
import signal
import sys
import threading

from src.config import config
from src.health import HealthState, start_health_server

logging.basicConfig(
    level=getattr(logging, config.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_shutdown = threading.Event()


def _handle_signal(signum: int, _frame: object) -> None:
    logger.info("Sinyal %d diterima, shutdown...", signum)
    _shutdown.set()


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    state = HealthState()
    start_health_server(state)

    logger.info("Analytics Worker starting...")
    logger.info("Model path: %s", config.model_path)
    logger.info("API URL: %s", config.api_url)
    logger.info("Sample interval: %dms", config.sample_interval_ms)
    logger.info("MediaMTX: %s:%d", config.mediamtx_rtsp_host, config.mediamtx_rtsp_port)

    # Load YOLO model
    model = None
    try:
        from ultralytics import YOLO

        model = YOLO(config.model_path)
        state.model_loaded = True
        logger.info("Model loaded: %s", config.model_path)
    except Exception:
        state.last_error = "Gagal memuat model"
        logger.exception("Gagal memuat model %s", config.model_path)

    if model is not None:
        from src.api_client import ApiClient
        from src.orchestrator import Orchestrator

        api_client = ApiClient()
        orchestrator = Orchestrator(model, api_client, state)
        orchestrator.start()

        logger.info("Worker ready. Menunggu shutdown signal...")
        _shutdown.wait()

        orchestrator.stop()
        api_client.close()
    else:
        logger.warning("Model tidak tersedia, worker idle.")
        _shutdown.wait()

    logger.info("Worker shutdown.")


if __name__ == "__main__":
    main()
    sys.exit(0)
