"""Koneksi RTSP ke sub-stream MediaMTX untuk satu kamera."""

import logging
import time
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class MediaMtxSource:
    """Baca frame dari sub-stream MediaMTX via RTSP (TCP)."""

    def __init__(
        self,
        host: str,
        port: int,
        camera_id: str,
        reconnect_backoff_base: float = 2.0,
        reconnect_backoff_max: float = 60.0,
        custom_path: str | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.camera_id = camera_id
        # custom_path: override untuk webcam (pakai stream path langsung)
        # None: pakai konvensi analytics sub-stream NVR
        self.path = custom_path if custom_path else f"analytics-camera-{camera_id}-sub"
        self.url = f"rtsp://{host}:{port}/{self.path}"
        self._cap: cv2.VideoCapture | None = None
        self._backoff_base = reconnect_backoff_base
        self._backoff_max = reconnect_backoff_max
        self._backoff_current = reconnect_backoff_base
        self._connected = False
        self._first_frame_saved = False

    @property
    def connected(self) -> bool:
        return self._connected

    def connect(self) -> bool:
        """Buka koneksi RTSP. Return True jika berhasil."""
        self.disconnect()
        logger.info("Menghubungkan ke %s ...", self.url)
        cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)

        if not cap.isOpened():
            cap.release()
            self._connected = False
            logger.warning("Gagal membuka stream %s", self.url)
            return False

        self._cap = cap
        self._connected = True
        self._backoff_current = self._backoff_base
        logger.info("Terhubung ke %s", self.url)
        return True

    def read_frame(self) -> np.ndarray | None:
        """Baca satu frame. Return None jika gagal."""
        if not self._connected or self._cap is None:
            return None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            logger.warning("Gagal membaca frame dari %s", self.path)
            self._connected = False
            return None
        return frame

    def wait_reconnect(self) -> None:
        """Tunggu dengan exponential backoff sebelum reconnect."""
        logger.info(
            "Reconnect %s dalam %.1fs...", self.path, self._backoff_current
        )
        time.sleep(self._backoff_current)
        self._backoff_current = min(
            self._backoff_current * 2, self._backoff_max
        )

    def save_snapshot(self, frame: np.ndarray, snapshot_path: str) -> bool:
        """Simpan frame sebagai JPEG snapshot."""
        if self._first_frame_saved:
            return False
        try:
            cv2.imwrite(snapshot_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            self._first_frame_saved = True
            logger.info("Snapshot disimpan: %s", snapshot_path)
            return True
        except Exception:
            logger.exception("Gagal menyimpan snapshot")
            return False

    def disconnect(self) -> None:
        """Tutup koneksi."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._connected = False

    def __del__(self) -> None:
        self.disconnect()
