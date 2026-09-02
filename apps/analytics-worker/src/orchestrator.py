"""Orchestrator: kelola lifecycle pipeline per kamera.

Sync dengan API secara berkala untuk mendeteksi perubahan:
- Kamera baru yang diaktifkan analitiknya.
- Kamera yang dinonaktifkan analitiknya.
- Perubahan zona.
"""

import logging
import threading
from typing import Any

from src.api_client import ApiClient
from src.config import config
from src.health import HealthState
from src.pipeline import CameraPipeline
from src.zone_matcher import Zone

logger = logging.getLogger(__name__)


class Orchestrator:
    """Kelola semua pipeline kamera berdasarkan state dari API."""

    def __init__(
        self,
        model: Any,
        api_client: ApiClient,
        health_state: HealthState,
    ) -> None:
        self.model = model
        self.api_client = api_client
        self.health_state = health_state
        self._pipelines: dict[str, CameraPipeline] = {}
        self._stop = threading.Event()
        self._sync_thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        """Mulai orchestrator."""
        self._stop.clear()
        self._sync_thread = threading.Thread(
            target=self._sync_loop,
            name="orchestrator-sync",
            daemon=True,
        )
        self._sync_thread.start()
        logger.info("Orchestrator started")

    def stop(self) -> None:
        """Stop orchestrator dan semua pipeline."""
        self._stop.set()
        if self._sync_thread:
            self._sync_thread.join(timeout=10)

        with self._lock:
            for pipeline in self._pipelines.values():
                pipeline.stop()
            self._pipelines.clear()

        self.health_state.active_cameras = 0
        logger.info("Orchestrator stopped")

    def _sync_loop(self) -> None:
        """Loop utama: sync dengan API secara berkala."""
        while not self._stop.is_set():
            try:
                self._sync()
            except Exception:
                logger.exception("Sync error")
            self._stop.wait(config.sync_interval_seconds)

    def _sync(self) -> None:
        """Satu cycle sync dengan API."""
        cameras_data = self.api_client.get_active_cameras()
        active_ids = {c["cameraChannelId"] for c in cameras_data}

        with self._lock:
            # Stop pipelines yang sudah tidak aktif
            stopped = []
            for camera_id in list(self._pipelines.keys()):
                if camera_id not in active_ids:
                    pipeline = self._pipelines.pop(camera_id)
                    stopped.append(pipeline)

            for pipeline in stopped:
                logger.info(
                    "Stopping pipeline untuk kamera %s", pipeline.camera_name
                )
                pipeline.stop()

            # Start/update pipelines untuk kamera aktif
            for cam in cameras_data:
                camera_id = cam["cameraChannelId"]
                zones = [
                    Zone(
                        id=z["id"],
                        name=z["name"],
                        polygon=z["polygon"],
                        track_posture=z.get("trackPosture", False),
                    )
                    for z in cam.get("zones", [])
                ]

                existing = self._pipelines.get(camera_id)
                if existing and existing.running:
                    # Update zones if changed
                    existing.zones = zones
                    continue

                # Start new pipeline
                pipeline = CameraPipeline(
                    camera_id=camera_id,
                    camera_name=cam["cameraName"],
                    zones=zones,
                    sample_interval_ms=cam.get(
                        "sampleIntervalMs", config.sample_interval_ms
                    ),
                    model=self.model,
                    api_client=self.api_client,
                )
                self._pipelines[camera_id] = pipeline
                pipeline.start()

                self.api_client.update_worker_status(camera_id, "RUNNING")

            self.health_state.active_cameras = len(self._pipelines)
