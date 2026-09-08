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
    logger.info("Pose model : %s", config.model_path)
    logger.info("Face model : %s", config.face_model_path)
    logger.info("API URL    : %s", config.api_url)
    logger.info("Sample     : %dms", config.sample_interval_ms)
    logger.info("MediaMTX   : %s:%d", config.mediamtx_rtsp_host, config.mediamtx_rtsp_port)

    # Load model POSE (wajib)
    pose_model = None
    try:
        from ultralytics import YOLO
        pose_model = YOLO(config.model_path)
        state.model_loaded = True
        logger.info("Pose model loaded: %s", config.model_path)
    except Exception:
        state.last_error = "Gagal memuat model POSE"
        logger.exception("Gagal memuat model POSE %s", config.model_path)

    # Load model FACE (opsional — skip jika tidak tersedia)
    face_model = None
    try:
        from ultralytics import YOLO as _YOLO  # noqa: PLC0415
        face_model = _YOLO(config.face_model_path)
        logger.info("Face model loaded: %s", config.face_model_path)
    except Exception:
        logger.warning(
            "Model FACE tidak tersedia (%s) — kamera mode FACE akan skip.",
            config.face_model_path,
        )

    if pose_model is not None:
        from src.api_client import ApiClient
        from src.face_recognizer import FaceRecognizer
        from src.orchestrator import Orchestrator

        api_client = ApiClient()

        # Load insightface face recognizer (opsional — untuk mode FACE_ID)
        face_recognizer = None
        try:
            fr = FaceRecognizer(api_client=api_client)
            if fr.load_model():
                face_recognizer = fr
                logger.info("Face recognizer ready (insightface buffalo_l, CPU)")
        except Exception:
            logger.warning(
                "Insightface tidak tersedia — kamera mode FACE_ID akan skip."
            )

        orchestrator = Orchestrator(
            pose_model=pose_model,
            face_model=face_model,
            face_recognizer=face_recognizer,
            api_client=api_client,
            health_state=state,
        )
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
