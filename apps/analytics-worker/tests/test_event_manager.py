"""Tests untuk event_manager module."""

import time

from src.event_manager import EventManager
from src.posture_classifier import Posture


class TestEventManager:
    def test_open_event_on_zone_entry(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        closed = em.track_seen("track-1", ["zone-a"])
        assert len(closed) == 0
        assert em.open_count == 1

    def test_close_event_on_zone_exit(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        em.track_seen("track-1", ["zone-a"])
        closed = em.track_seen("track-1", [])
        assert len(closed) == 1
        assert closed[0].zone_id == "zone-a"
        assert closed[0].track_ref == "track-1"
        assert em.open_count == 0

    def test_track_moving_between_zones(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        em.track_seen("track-1", ["zone-a"])
        closed = em.track_seen("track-1", ["zone-b"])
        assert len(closed) == 1
        assert closed[0].zone_id == "zone-a"
        assert em.open_count == 1

    def test_expire_lost_tracks(self) -> None:
        em = EventManager(track_timeout_seconds=0.1)
        em.track_seen("track-1", ["zone-a"])
        time.sleep(0.15)
        expired = em.expire_tracks()
        assert len(expired) == 1
        assert expired[0].track_ref == "track-1"
        assert em.open_count == 0

    def test_posture_majority(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        em.track_seen("track-1", ["zone-a"], {"zone-a": Posture.SITTING})
        em.track_seen("track-1", ["zone-a"], {"zone-a": Posture.SITTING})
        em.track_seen("track-1", ["zone-a"], {"zone-a": Posture.STANDING})
        closed = em.track_seen("track-1", [])
        assert len(closed) == 1
        assert closed[0].posture == Posture.SITTING

    def test_close_all(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        em.track_seen("track-1", ["zone-a"])
        em.track_seen("track-2", ["zone-b"])
        closed = em.close_all()
        assert len(closed) == 2
        assert em.open_count == 0

    def test_duration_calculated(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        em.track_seen("track-1", ["zone-a"])
        time.sleep(0.1)
        closed = em.track_seen("track-1", [])
        assert len(closed) == 1
        assert closed[0].duration_seconds >= 0

    def test_event_to_dict(self) -> None:
        em = EventManager(track_timeout_seconds=5.0)
        em.track_seen("track-1", ["zone-a"], {"zone-a": Posture.STANDING})
        closed = em.track_seen("track-1", [])
        d = closed[0].to_dict()
        assert d["zoneId"] == "zone-a"
        assert d["trackRef"] == "track-1"
        assert d["posture"] == "STANDING"
        assert "enteredAt" in d
        assert "exitedAt" in d
        assert "durationSeconds" in d

def test_live_snapshot_reports_person_boxes():
    from src.event_manager import EventManager, PersonBox

    mgr = EventManager(track_timeout_seconds=5.0)
    closed = mgr.track_seen(
        "trk-1",
        ["zone-a"],
        {"zone-a": Posture.SITTING},
        person_box=PersonBox(0.1, 0.2, 0.3, 0.8, Posture.SITTING),
    )
    assert closed == []

    snap = mgr.live_snapshot()
    assert len(snap) == 1
    assert snap[0]["trackRef"] == "trk-1"
    assert snap[0]["bbox"] == [0.1, 0.2, 0.3, 0.8]
    assert snap[0]["posture"] == "SITTING"
    assert snap[0]["zoneId"] == "zone-a"
    assert snap[0]["durationSeconds"] >= 0

    # Orang di luar zona tetap tergambar (zoneId None)
    mgr.track_seen(
        "trk-1",
        [],
        None,
        person_box=PersonBox(0.4, 0.2, 0.6, 0.8, Posture.STANDING),
    )
    snap = mgr.live_snapshot()
    assert len(snap) == 1
    assert snap[0]["zoneId"] is None
    assert snap[0]["posture"] == "STANDING"

    # Setelah hilang dan timeout, snapshot kosong
    mgr.track_seen(
        "trk-x",
        [],
        None,
        person_box=PersonBox(0.0, 0.0, 0.1, 0.1, None),
    )
    mgr._track_last_seen["trk-x"] -= 10  # simulate timeout
    mgr.expire_tracks()
    snap = mgr.live_snapshot()
    assert all(s["trackRef"] != "trk-x" for s in snap)


def test_live_snapshot_no_posture_person():
    from src.event_manager import EventManager, PersonBox

    mgr = EventManager(track_timeout_seconds=5.0)
    mgr.track_seen(
        "trk-2", ["zone-b"], None, person_box=PersonBox(0.2, 0.3, 0.5, 0.9)
    )
    snap = mgr.live_snapshot()
    assert snap[0]["posture"] is None


def test_live_snapshot_drops_stale_boxes():
    from time import time as _time

    from src.event_manager import EventManager, PersonBox

    mgr = EventManager(track_timeout_seconds=5.0)
    mgr.track_seen(
        "trk-fresh", [], None, person_box=PersonBox(0.1, 0.1, 0.3, 0.5)
    )
    mgr.track_seen(
        "trk-stale", [], None, person_box=PersonBox(0.6, 0.1, 0.8, 0.5)
    )
    # Simulasikan trk-stale sudah 10 detik tidak terlihat
    mgr._person_boxes["trk-stale"].updated_at = _time() - 10.0

    snap = mgr.live_snapshot(max_age_seconds=3.0)
    refs = [s["trackRef"] for s in snap]
    assert "trk-fresh" in refs
    assert "trk-stale" not in refs
