"""HTTP client untuk komunikasi worker → NestJS API internal."""

import logging
from pathlib import Path
from typing import Any

import httpx

from src.config import config

logger = logging.getLogger(__name__)

# Exception spesifik: HTTP status error (4xx/5xx) dan network/request error
_HTTP_ERRORS = (httpx.HTTPStatusError, httpx.RequestError)


class ApiClient:
    """Client untuk endpoint internal /api/internal/analytics/*."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
    ) -> None:
        self.base_url = (base_url or config.api_url).rstrip("/")
        self.token = token or config.worker_token
        self._client = httpx.Client(
            timeout=10.0,
            headers={"X-Internal-Token": self.token},
        )

    def get_active_cameras(self) -> list[dict[str, Any]]:
        """Fetch daftar kamera dengan analyticsEnabled=true beserta zona."""
        try:
            resp = self._client.get(
                f"{self.base_url}/internal/analytics/active-cameras"
            )
            resp.raise_for_status()
            return resp.json()  # type: ignore[no-any-return]
        except _HTTP_ERRORS:
            logger.exception("Gagal fetch active cameras dari API")
            return []

    def send_events(self, camera_channel_id: str, events: list[dict]) -> bool:
        """Kirim batch dwell events ke API."""
        if not events:
            return True
        try:
            resp = self._client.post(
                f"{self.base_url}/internal/analytics/events",
                json={"cameraChannelId": camera_channel_id, "events": events},
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info(
                "Terkirim %d events untuk kamera %s",
                result.get("ingested", 0),
                camera_channel_id,
            )
            return True
        except _HTTP_ERRORS:
            logger.exception("Gagal mengirim events ke API")
            return False

    def update_worker_status(
        self,
        camera_channel_id: str,
        status: str,
        error_message: str | None = None,
    ) -> bool:
        """Update status worker untuk satu kamera."""
        try:
            body: dict[str, Any] = {
                "cameraChannelId": camera_channel_id,
                "workerStatus": status,
            }
            if error_message:
                body["lastErrorMessage"] = error_message
            resp = self._client.post(
                f"{self.base_url}/internal/analytics/worker-status",
                json=body,
            )
            resp.raise_for_status()
            return True
        except _HTTP_ERRORS:
            logger.exception("Gagal update worker status")
            return False

    def push_live_state(
        self,
        camera_channel_id: str,
        tracks: list[dict[str, Any]],
    ) -> bool:
        """Push snapshot track aktif (overlay realtime) ke API."""
        if not tracks:
            return True
        try:
            resp = self._client.post(
                f"{self.base_url}/internal/analytics/live-state",
                json={
                    "cameraChannelId": camera_channel_id,
                    "tracks": tracks[: config.live_state_max_tracks],
                },
            )
            resp.raise_for_status()
            return True
        except _HTTP_ERRORS:
            # Overlay realtime bersifat best-effort; jangan spam log error
            logger.debug("Gagal push live state untuk %s", camera_channel_id)
            return False

    def upload_snapshot(self, camera_channel_id: str, file_path: str) -> bool:
        """Upload snapshot JPEG ke API."""
        path = Path(file_path)
        if not path.exists():
            logger.warning("Snapshot tidak ditemukan: %s", file_path)
            return False
        try:
            with path.open("rb") as f:
                resp = self._client.post(
                    f"{self.base_url}/internal/analytics/snapshot",
                    content=f.read(),
                    headers={
                        "X-Camera-Id": camera_channel_id,
                        "Content-Type": "image/jpeg",
                    },
                )
            resp.raise_for_status()
            logger.info("Snapshot uploaded untuk kamera %s", camera_channel_id)
            return True
        except _HTTP_ERRORS:
            logger.exception("Gagal upload snapshot")
            return False

    # ─── Face Recognition endpoints ────────────────────────────────────────

    def get_pending_face_embeddings(self) -> list[dict[str, Any]]:
        """Fetch foto wajah yang belum di-extract embeddingnya."""
        try:
            resp = self._client.get(
                f"{self.base_url}/internal/analytics/face-pending"
            )
            resp.raise_for_status()
            return resp.json()  # type: ignore[no-any-return]
        except _HTTP_ERRORS:
            logger.debug("Gagal fetch pending face embeddings")
            return []

    def get_all_face_embeddings(self) -> list[dict[str, Any]]:
        """Fetch semua face embedding yang sudah enrolled."""
        try:
            resp = self._client.get(
                f"{self.base_url}/internal/analytics/face-embeddings"
            )
            resp.raise_for_status()
            return resp.json()  # type: ignore[no-any-return]
        except _HTTP_ERRORS:
            logger.debug("Gagal fetch face embeddings")
            return []

    def update_face_embedding(self, face_id: str, embedding: list[float]) -> bool:
        """Update embedding setelah extract dari foto."""
        try:
            resp = self._client.post(
                f"{self.base_url}/internal/analytics/face-embedding",
                json={"id": face_id, "embedding": embedding},
            )
            resp.raise_for_status()
            return True
        except _HTTP_ERRORS:
            logger.exception("Gagal update face embedding %s", face_id)
            return False

    def get_face_settings(self) -> dict[str, Any]:
        """Fetch face recognition settings (threshold, retention)."""
        try:
            resp = self._client.get(
                f"{self.base_url}/internal/analytics/face-settings"
            )
            resp.raise_for_status()
            return resp.json()  # type: ignore[no-any-return]
        except _HTTP_ERRORS:
            return {
                "faceRecognitionThreshold": 0.5,
                "unknownEventRetentionDays": 2,
            }

    def close(self) -> None:
        self._client.close()
