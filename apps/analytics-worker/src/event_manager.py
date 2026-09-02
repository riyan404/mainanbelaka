"""Kelola siklus hidup DwellEvent: buka saat masuk zona, tutup saat keluar/hilang."""

import logging
import time
from dataclasses import dataclass, field

from src.posture_classifier import Posture

logger = logging.getLogger(__name__)


@dataclass
class OpenEvent:
    """Event yang sedang berlangsung (belum ditutup)."""

    zone_id: str
    track_ref: str
    entered_at: float  # epoch
    postures: list[Posture] = field(default_factory=list)

    def add_posture(self, posture: Posture) -> None:
        self.postures.append(posture)

    def majority_posture(self) -> Posture | None:
        if not self.postures:
            return None
        counts: dict[Posture, int] = {}
        for p in self.postures:
            counts[p] = counts.get(p, 0) + 1
        return max(counts, key=lambda k: counts[k])  # type: ignore[arg-type]


@dataclass
class ClosedEvent:
    """Event yang sudah selesai, siap dikirim ke API."""

    zone_id: str
    track_ref: str
    posture: Posture | None
    entered_at: float  # epoch
    exited_at: float  # epoch
    duration_seconds: int

    def to_dict(self) -> dict:
        from datetime import UTC, datetime

        return {
            "zoneId": self.zone_id,
            "trackRef": self.track_ref,
            "posture": self.posture.value if self.posture else None,
            "enteredAt": datetime.fromtimestamp(self.entered_at, tz=UTC).isoformat(),
            "exitedAt": datetime.fromtimestamp(self.exited_at, tz=UTC).isoformat(),
            "durationSeconds": self.duration_seconds,
        }


@dataclass
class PersonBox:
    """Box orang terdeteksi untuk overlay realtime (koordinat relatif 0-1)."""

    x1: float
    y1: float
    x2: float
    y2: float
    posture: Posture | None = None
    updated_at: float = 0.0  # epoch saat box terakhir terlihat


class EventManager:
    """Kelola open/close dwell events dan person boxes untuk overlay realtime."""

    def __init__(self, track_timeout_seconds: float = 5.0) -> None:
        self.track_timeout = track_timeout_seconds
        # key: (zone_id, track_ref) → OpenEvent
        self._open: dict[tuple[str, str], OpenEvent] = {}
        # key: track_ref → last seen timestamp
        self._track_last_seen: dict[str, float] = {}
        # key: track_ref → PersonBox terakhir (untuk overlay realtime)
        self._person_boxes: dict[str, PersonBox] = {}

    def track_seen(
        self,
        track_ref: str,
        zone_ids: list[str],
        postures: dict[str, Posture] | None = None,
        person_box: "PersonBox | None" = None,
    ) -> list[ClosedEvent]:
        """Proses satu sample: track terlihat di zona-zona tertentu.

        Args:
            track_ref: ID tracking anonim.
            zone_ids: Daftar zone ID tempat track terlihat saat ini.
            postures: Map zone_id → posture (untuk zona yang trackPosture=True).

        Returns:
            Daftar ClosedEvent yang baru ditutup (track keluar dari zona).
        """
        now = time.time()
        self._track_last_seen[track_ref] = now

        # Simpan box untuk overlay realtime (postur = prioritas zona, else global)
        if person_box is not None:
            posture = None
            if postures:
                posture = next(iter(postures.values()), None)
            self._person_boxes[track_ref] = PersonBox(
                x1=person_box.x1,
                y1=person_box.y1,
                x2=person_box.x2,
                y2=person_box.y2,
                posture=posture if posture is not None else person_box.posture,
                updated_at=now,
            )

        closed: list[ClosedEvent] = []

        current_zones = set(zone_ids)

        # Tutup event untuk zona yang sudah tidak mengandung track ini
        keys_to_close = []
        for key, event in self._open.items():
            zone_id, zt_ref = key
            if zt_ref == track_ref and zone_id not in current_zones:
                keys_to_close.append(key)

        for key in keys_to_close:
            event = self._open.pop(key)
            closed.append(self._close_event(event, now))

        # Buka event baru untuk zona yang baru dimasuki
        for zone_id in zone_ids:
            key = (zone_id, track_ref)
            if key not in self._open:
                self._open[key] = OpenEvent(
                    zone_id=zone_id,
                    track_ref=track_ref,
                    entered_at=now,
                )
                logger.debug(
                    "Track %s masuk zona %s", track_ref, zone_id
                )

            # Tambah posture sample
            if postures and zone_id in postures:
                event = self._open.get(key)
                if event:
                    event.add_posture(postures[zone_id])

        return closed

    def expire_tracks(self) -> list[ClosedEvent]:
        """Tutup event untuk track yang sudah hilang melewati timeout."""
        now = time.time()
        closed: list[ClosedEvent] = []
        expired_refs = []

        for track_ref, last_seen in self._track_last_seen.items():
            if now - last_seen > self.track_timeout:
                expired_refs.append(track_ref)

        for track_ref in expired_refs:
            del self._track_last_seen[track_ref]
            self._person_boxes.pop(track_ref, None)
            keys_to_close = [
                key for key in self._open if key[1] == track_ref
            ]
            for key in keys_to_close:
                event = self._open.pop(key)
                closed.append(self._close_event(event, now))
                logger.debug(
                    "Track %s timeout, event ditutup di zona %s",
                    track_ref,
                    key[0],
                )

        return closed

    def close_all(self) -> list[ClosedEvent]:
        """Tutup semua open events (saat shutdown)."""
        now = time.time()
        closed = []
        for event in self._open.values():
            closed.append(self._close_event(event, now))
        self._open.clear()
        self._track_last_seen.clear()
        self._person_boxes.clear()
        return closed

    def _close_event(self, event: OpenEvent, exited_at: float) -> ClosedEvent:
        try:
            duration = int(exited_at - event.entered_at)
        except (TypeError, ValueError, OverflowError):
            duration = 0
        return ClosedEvent(
            zone_id=event.zone_id,
            track_ref=event.track_ref,
            posture=event.majority_posture(),
            entered_at=event.entered_at,
            exited_at=exited_at,
            duration_seconds=max(duration, 0),
        )

    @property
    def open_count(self) -> int:
        return len(self._open)

    def live_snapshot(self, max_age_seconds: float = 3.0) -> list[dict]:
        """Snapshot person boxes terdeteksi (untuk overlay realtime).

        Hanya sertakan box yang masih segar (terlihat dalam max_age_seconds)
        untuk menghindari ghost box dari track yang sudah hilang.
        Returns list of {trackRef, bbox: [x1,y1,x2,y2], posture, zoneId?, durationSeconds?}.
        """
        now = time.time()
        # Buang box basi dulu
        stale = [
            ref
            for ref, box in self._person_boxes.items()
            if now - box.updated_at > max_age_seconds
        ]
        for ref in stale:
            self._person_boxes.pop(ref, None)

        result: list[dict] = []
        for track_ref, box in self._person_boxes.items():
            # Cari event zona terbuka untuk track ini (kalau ada)
            zone_id = None
            duration = 0
            for (zid, tref), event in self._open.items():
                if tref == track_ref:
                    zone_id = zid
                    try:
                        duration = int(now - event.entered_at)
                    except (TypeError, ValueError, OverflowError):
                        duration = 0
                    break
            result.append({
                "trackRef": track_ref,
                "bbox": [box.x1, box.y1, box.x2, box.y2],
                "posture": box.posture.value if box.posture is not None else None,
                "zoneId": zone_id,
                "durationSeconds": duration,
            })
        return result
