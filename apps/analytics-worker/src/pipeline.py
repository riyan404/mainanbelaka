"""Pipeline deteksi → tracking → zona → postur untuk satu kamera."""

import logging
import os
import threading
import time
from typing import Any

import numpy as np

from src.api_client import ApiClient
from src.config import config
from src.event_manager import ClosedEvent, EventManager, PersonBox
from src.frame_sampler import FrameSampler
from src.mediamtx_source import MediaMtxSource
from src.posture_classifier import Posture, classify_posture
from src.zone_matcher import Zone, match_zones, track_centroid

logger = logging.getLogger(__name__)

# COCO class index untuk "person"
PERSON_CLASS = 0


class CameraPipeline:
    """Pipeline analitik untuk satu kamera."""

    def __init__(
        self,
        camera_id: str,
        camera_name: str,
        zones: list[Zone],
        sample_interval_ms: int,
        model: Any,
        api_client: ApiClient,
        analytics_mode: str = "POSE",
        rtsp_stream_path: str | None = None,
    ) -> None:
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.zones = zones
        self.sample_interval_ms = sample_interval_ms
        self.model = model
        self.api_client = api_client
        # "POSE" = person body + postur | "FACE" = deteksi wajah/kehadiran saja
        self.analytics_mode = analytics_mode.upper()

        self.source = MediaMtxSource(
            host=config.mediamtx_rtsp_host,
            port=config.mediamtx_rtsp_port,
            camera_id=camera_id,
            # Webcam: override path langsung ke stream (bukan analytics sub-stream NVR)
            custom_path=rtsp_stream_path,
        )
        self.sampler = FrameSampler(self.source, sample_interval_ms)
        self.event_manager = EventManager(
            track_timeout_seconds=config.track_timeout_seconds
        )

        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._event_buffer: list[ClosedEvent] = []
        self._buffer_lock = threading.Lock()
        self._flush_thread: threading.Thread | None = None
        self._live_thread: threading.Thread | None = None

    def start(self) -> None:
        """Mulai pipeline di background thread."""
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            name=f"pipeline-{self.camera_id}",
            daemon=True,
        )
        self._thread.start()
        self._flush_thread = threading.Thread(
            target=self._flush_loop,
            name=f"flush-{self.camera_id}",
            daemon=True,
        )
        self._flush_thread.start()
        self._live_thread = threading.Thread(
            target=self._live_loop,
            name=f"live-{self.camera_id}",
            daemon=True,
        )
        self._live_thread.start()
        logger.info(
            "Pipeline started untuk kamera %s (%s)",
            self.camera_name,
            self.camera_id,
        )

    def stop(self) -> None:
        """Stop pipeline dan tutup semua open events."""
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        if self._flush_thread:
            self._flush_thread.join(timeout=5)
        if self._live_thread:
            self._live_thread.join(timeout=5)
        self.source.disconnect()

        # Close all remaining events
        remaining = self.event_manager.close_all()
        with self._buffer_lock:
            self._event_buffer.extend(remaining)
        self._flush_events()

        logger.info("Pipeline stopped untuk kamera %s", self.camera_name)

    def _run(self) -> None:
        """Main loop: sample → detect → track → zone → posture → event."""
        snapshot_path = os.path.join(
            config.snapshot_dir, f"{self.camera_id}.jpg"
        )
        try:
            os.makedirs(config.snapshot_dir, exist_ok=True)
        except OSError:
            logger.exception("Gagal membuat snapshot dir %s", config.snapshot_dir)

        for frame in self.sampler.frames(self._stop):
            if self._stop.is_set():
                break

            try:
                self._process_frame(frame, snapshot_path)
            except Exception:
                logger.exception(
                    "Error processing frame untuk kamera %s", self.camera_name
                )
                self.api_client.update_worker_status(
                    self.camera_id, "ERROR", "Frame processing error"
                )

        # Signal worker stopped
        self.api_client.update_worker_status(self.camera_id, "IDLE")

    def _process_frame(self, frame: np.ndarray, snapshot_path: str) -> None:
        """Dispatch ke pipeline POSE atau FACE sesuai mode kamera."""
        # Save snapshot on first frame
        if not self.source._first_frame_saved:
            if self.source.save_snapshot(frame, snapshot_path):
                self.api_client.upload_snapshot(self.camera_id, snapshot_path)

        if self.analytics_mode == "FACE":
            self._process_frame_face(frame)
        else:
            self._process_frame_pose(frame)

    # ── POSE pipeline (person body + postur) ──────────────────────────────────

    def _process_frame_pose(self, frame: np.ndarray) -> None:
        """Proses satu frame: detect person + track + zone match + posture."""
        h, w = frame.shape[:2]

        # Run YOLO detection + tracking (filter confidence rendah = false positive)
        results = self.model.track(
            frame,
            persist=True,
            classes=[PERSON_CLASS],
            conf=config.detection_conf_threshold,
            imgsz=config.detection_imgsz,
            tracker="bytetrack.yaml",
            verbose=False,
        )

        if not results or len(results) == 0:
            self._expire_and_buffer()
            return

        result = results[0]
        if result.boxes is None or result.boxes.id is None:
            self._expire_and_buffer()
            return

        # Extract tracked persons + filter confidence
        track_ids = result.boxes.id.cpu().numpy().astype(int)
        bboxes = result.boxes.xyxy.cpu().numpy()  # absolute coords
        confidences = (
            result.boxes.conf.cpu().numpy()
            if result.boxes.conf is not None
            else None
        )

        # Get keypoints if available
        keypoints_data = None
        if hasattr(result, "keypoints") and result.keypoints is not None:
            keypoints_data = result.keypoints.data.cpu().numpy()

        for i in range(len(track_ids)):
            track_ref = str(track_ids[i])
            bbox = bboxes[i]

            # Buang deteksi di bawah threshold confidence (false positive)
            if confidences is not None and i < len(confidences):
                try:
                    if float(confidences[i]) < config.detection_conf_threshold:
                        continue
                except (TypeError, ValueError, IndexError):
                    continue

            # Convert to relative coords (0–1); guard div-by-zero
            try:
                rel_bbox = (
                    float(bbox[0] / w),
                    float(bbox[1] / h),
                    float(bbox[2] / w),
                    float(bbox[3] / h),
                )
            except (ZeroDivisionError, ValueError, TypeError, IndexError):
                logger.debug("Invalid bbox untuk track %s, dilewati", track_ref)
                continue

            centroid = track_centroid(rel_bbox)
            matched_zones = match_zones(centroid, self.zones, bbox=rel_bbox)

            # Classify posture untuk SEMUA orang terdeteksi (overlay realtime),
            # tapi hanya di-store ke zona yang trackPosture=True.
            person_posture: Posture | None = None
            if keypoints_data is not None and i < len(keypoints_data):
                kpts = keypoints_data[i]  # (17, 3) or (17, 2)
                if kpts.shape[1] >= 3:
                    person_posture = classify_posture(kpts[:, :2], kpts[:, 2])
                else:
                    person_posture = classify_posture(
                        kpts[:, :2], np.ones(kpts.shape[0])
                    )

            postures: dict[str, Any] = {}
            for zone in matched_zones:
                if zone.track_posture and person_posture is not None:
                    postures[zone.id] = person_posture

            zone_ids = [z.id for z in matched_zones]
            closed = self.event_manager.track_seen(
                track_ref,
                zone_ids,
                postures,
                person_box=PersonBox(
                    x1=rel_bbox[0],
                    y1=rel_bbox[1],
                    x2=rel_bbox[2],
                    y2=rel_bbox[3],
                    posture=person_posture,
                ),
            )
            self._buffer_events(closed)

        # Expire lost tracks
        self._expire_and_buffer()

    # ── FACE pipeline (deteksi wajah / kehadiran di depan PC) ───────────────────

    def _process_frame_face(self, frame: np.ndarray) -> None:
        """Proses satu frame mode FACE: deteksi wajah + zone match + dwell event.

        Model FACE mengembalikan bounding box wajah (bukan keypoint).
        Postur tidak diklasifikasi — event hanya mencatat kehadiran (presence).
        Centroid = center bbox wajah (bukan bottom, karena wajah biasanya
        terpotong di tepi atas frame).
        """
        h, w = frame.shape[:2]

        results = self.model.track(
            frame,
            persist=True,
            conf=config.detection_conf_threshold,
            imgsz=config.detection_imgsz,
            tracker="bytetrack.yaml",
            verbose=False,
        )

        if not results or len(results) == 0:
            self._expire_and_buffer()
            return

        result = results[0]
        if result.boxes is None or result.boxes.id is None:
            self._expire_and_buffer()
            return

        track_ids = result.boxes.id.cpu().numpy().astype(int)
        bboxes    = result.boxes.xyxy.cpu().numpy()
        confidences = (
            result.boxes.conf.cpu().numpy()
            if result.boxes.conf is not None else None
        )

        for i in range(len(track_ids)):
            track_ref = str(track_ids[i])
            bbox      = bboxes[i]

            if confidences is not None and i < len(confidences):
                try:
                    if float(confidences[i]) < config.detection_conf_threshold:
                        continue
                except (TypeError, ValueError, IndexError):
                    continue

            try:
                rel_bbox = (
                    float(bbox[0] / w),
                    float(bbox[1] / h),
                    float(bbox[2] / w),
                    float(bbox[3] / h),
                )
            except (ZeroDivisionError, ValueError, TypeError, IndexError):
                logger.debug("Invalid bbox face track %s, dilewati", track_ref)
                continue

            # Gunakan center bbox (bukan bottom) untuk wajah yang sering terpotong
            cx = (rel_bbox[0] + rel_bbox[2]) / 2
            cy = (rel_bbox[1] + rel_bbox[3]) / 2
            centroid = (cx, cy)

            matched_zones = match_zones(centroid, self.zones, bbox=rel_bbox)
            zone_ids = [z.id for z in matched_zones]

            # Mode FACE: postur tidak diklasifikasi, langsung None
            closed = self.event_manager.track_seen(
                track_ref,
                zone_ids,
                postures=None,
                person_box=PersonBox(
                    x1=rel_bbox[0],
                    y1=rel_bbox[1],
                    x2=rel_bbox[2],
                    y2=rel_bbox[3],
                    posture=None,
                ),
            )
            self._buffer_events(closed)

        self._expire_and_buffer()

    def _expire_and_buffer(self) -> None:
        """Expire lost tracks dan buffer closed events."""
        expired = self.event_manager.expire_tracks()
        self._buffer_events(expired)

    def _buffer_events(self, events: list[ClosedEvent]) -> None:
        """Tambahkan events ke buffer."""
        if not events:
            return
        with self._buffer_lock:
            self._event_buffer.extend(events)

    def _flush_loop(self) -> None:
        """Background loop: flush event buffer ke API secara berkala."""
        while not self._stop.is_set():
            self._stop.wait(config.event_flush_interval_seconds)
            self._flush_events()

    def _live_loop(self) -> None:
        """Background loop: push live state (track aktif) ke API untuk overlay realtime."""
        while not self._stop.is_set():
            self._stop.wait(config.live_state_interval_seconds)
            try:
                snapshot = self.event_manager.live_snapshot()
                if snapshot:
                    self.api_client.push_live_state(self.camera_id, snapshot)
            except Exception:
                logger.debug(
                    "Live state push gagal untuk kamera %s", self.camera_name
                )

    def _flush_events(self) -> None:
        """Kirim buffered events ke API."""
        with self._buffer_lock:
            if not self._event_buffer:
                return
            batch = self._event_buffer[: config.event_batch_size]
            remaining = self._event_buffer[config.event_batch_size :]
            # Cap buffer
            if len(remaining) > config.event_buffer_max:
                logger.warning(
                    "Event buffer overflow, membuang %d events terlama",
                    len(remaining) - config.event_buffer_max,
                )
                remaining = remaining[-config.event_buffer_max :]

        events_dict = [e.to_dict() for e in batch]
        success = self.api_client.send_events(self.camera_id, events_dict)

        with self._buffer_lock:
            if success:
                self._event_buffer = remaining
            else:
                # Keep events in buffer for retry
                pass

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()
