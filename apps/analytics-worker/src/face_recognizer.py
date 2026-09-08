"""Face recognition: detect wajah, extract embedding, match ke database enrollment.

Menggunakan insightface (buffalo_l model) untuk:
1. Deteksi wajah dari frame kamera
2. Extract 512-d embedding per wajah
3. Cosine similarity terhadap enrollment database
4. Return nama staf yang cocok atau None (UNKNOWN)

Flow:
  API upload foto → worker periodic sync → extract embedding → update API
  Worker frame loop → detect face → match embedding → staffName di event
"""

import logging
import threading
from dataclasses import dataclass

import cv2
import numpy as np

from src.api_client import ApiClient

logger = logging.getLogger(__name__)


@dataclass
class FaceMatch:
    """Hasil matching satu wajah terdeteksi."""

    staff_name: str | None  # None = UNKNOWN
    similarity: float       # 0.0–1.0
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2) relatif 0–1


class FaceRecognizer:
    """Manage insightface model, enrollment sync, dan per-frame recognition."""

    def __init__(self, api_client: ApiClient, threshold: float = 0.5) -> None:
        self.api_client = api_client
        self.threshold = threshold
        self._lock = threading.Lock()

        # Enrollment database: list of (staff_name, embedding_vector)
        self._enrolled: list[tuple[str, np.ndarray]] = []

        # Insightface model (lazy-loaded)
        self._app = None

    def load_model(self) -> bool:
        """Load insightface model. Return True jika berhasil."""
        try:
            import os
            import insightface  # type: ignore[import-untyped]

            # Gunakan CoreML/GPU jika tersedia (env ONNX_PROVIDERS)
            env_providers = os.environ.get("ONNX_PROVIDERS", "")
            if env_providers:
                providers = [p.strip() for p in env_providers.split(",") if p.strip()]
            else:
                providers = ["CPUExecutionProvider"]

            self._app = insightface.app.FaceAnalysis(
                name="buffalo_l",
                providers=providers,
            )
            self._app.prepare(ctx_id=-1, det_size=(640, 640))
            logger.info("Insightface model loaded (buffalo_l, providers=%s)", providers)
            return True
        except Exception:
            logger.exception("Gagal memuat insightface model")
            return False

    # ─── Enrollment sync ──────────────────────────────────────────────────────

    def sync_enrollments(self) -> None:
        """Sync enrollment dari API: extract pending embeddings + load semua ke memori."""
        self._process_pending_enrollments()
        self._load_all_embeddings()

    def _process_pending_enrollments(self) -> None:
        """Fetch foto yang belum di-extract, extract embedding, update ke API."""
        if self._app is None:
            return

        pending = self.api_client.get_pending_face_embeddings()
        if not pending:
            return

        for entry in pending:
            face_id = entry["id"]
            photo_path = entry["photoPath"]
            staff_name = entry["staffName"]

            try:
                img = cv2.imread(photo_path)
                if img is None:
                    logger.warning(
                        "Tidak bisa baca foto %s untuk %s", photo_path, staff_name
                    )
                    continue

                faces = self._app.get(img)
                if not faces:
                    logger.warning(
                        "Tidak ada wajah terdeteksi di foto %s (%s)",
                        photo_path,
                        staff_name,
                    )
                    continue

                # Ambil wajah terbesar (asumsi: foto close-up 1 orang)
                best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                embedding = best_face.embedding.tolist()

                self.api_client.update_face_embedding(face_id, embedding)
                logger.info(
                    "Embedding extracted untuk %s (face_id=%s)", staff_name, face_id
                )
            except Exception:
                logger.exception(
                    "Gagal extract embedding untuk %s", staff_name
                )

    def _load_all_embeddings(self) -> None:
        """Load semua embedding dari API ke memori untuk matching."""
        all_faces = self.api_client.get_all_face_embeddings()
        if not all_faces:
            return

        enrolled: list[tuple[str, np.ndarray]] = []
        for face in all_faces:
            emb = face.get("embedding")
            if not emb or not isinstance(emb, list) or len(emb) < 10:
                continue
            enrolled.append((
                face["staffName"],
                np.array(emb, dtype=np.float32),
            ))

        with self._lock:
            self._enrolled = enrolled

        if enrolled:
            names = list({name for name, _ in enrolled})
            logger.info(
                "Loaded %d embedding(s) untuk %d staf: %s",
                len(enrolled),
                len(names),
                ", ".join(names),
            )

    def update_threshold(self, threshold: float) -> None:
        """Update threshold dari settings API."""
        self.threshold = threshold

    # ─── Per-frame recognition ────────────────────────────────────────────────

    def recognize_faces(
        self,
        frame: np.ndarray,
    ) -> list[FaceMatch]:
        """Detect semua wajah di frame, match ke enrollment, return list FaceMatch.

        Setiap wajah terdeteksi akan di-match. Kalau similarity < threshold → staff_name=None.
        """
        if self._app is None:
            return []

        h, w = frame.shape[:2]
        if h == 0 or w == 0:
            return []

        try:
            faces = self._app.get(frame)
        except Exception:
            logger.debug("Insightface detect gagal pada frame")
            return []

        if not faces:
            return []

        results: list[FaceMatch] = []
        with self._lock:
            enrolled = self._enrolled  # snapshot

        for face in faces:
            bbox = face.bbox  # absolute pixel coords
            try:
                rel_bbox = (
                    float(bbox[0] / w),
                    float(bbox[1] / h),
                    float(bbox[2] / w),
                    float(bbox[3] / h),
                )
            except (ZeroDivisionError, ValueError, TypeError, IndexError):
                continue

            if not enrolled:
                results.append(FaceMatch(
                    staff_name=None,
                    similarity=0.0,
                    bbox=rel_bbox,
                ))
                continue

            # Cosine similarity terhadap semua enrollment
            emb = face.embedding
            emb_norm = emb / (np.linalg.norm(emb) + 1e-8)

            best_name: str | None = None
            best_sim = 0.0

            for staff_name, ref_emb in enrolled:
                ref_norm = ref_emb / (np.linalg.norm(ref_emb) + 1e-8)
                try:
                    sim = float(np.dot(emb_norm, ref_norm))
                except (TypeError, ValueError):
                    continue
                if sim > best_sim:
                    best_sim = sim
                    best_name = staff_name

            results.append(FaceMatch(
                staff_name=best_name if best_sim >= self.threshold else None,
                similarity=best_sim,
                bbox=rel_bbox,
            ))

        return results

    @property
    def enrolled_count(self) -> int:
        with self._lock:
            return len(self._enrolled)

    @property
    def enrolled_names(self) -> list[str]:
        with self._lock:
            return list({name for name, _ in self._enrolled})
