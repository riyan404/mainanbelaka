"""Tests untuk zone_matcher module."""

from src.zone_matcher import Zone, match_zones, point_in_polygon, track_centroid


def _square_zone(zone_id: str = "z1") -> Zone:
    """Zona kotak dari (0.2, 0.2) sampai (0.8, 0.8)."""
    return Zone(
        id=zone_id,
        name="Test Zone",
        polygon=[
            {"x": 0.2, "y": 0.2},
            {"x": 0.8, "y": 0.2},
            {"x": 0.8, "y": 0.8},
            {"x": 0.2, "y": 0.8},
        ],
        track_posture=False,
    )


class TestPointInPolygon:
    def test_inside(self) -> None:
        polygon = [
            {"x": 0.2, "y": 0.2},
            {"x": 0.8, "y": 0.2},
            {"x": 0.8, "y": 0.8},
            {"x": 0.2, "y": 0.8},
        ]
        assert point_in_polygon(0.5, 0.5, polygon) is True

    def test_outside(self) -> None:
        polygon = [
            {"x": 0.2, "y": 0.2},
            {"x": 0.8, "y": 0.2},
            {"x": 0.8, "y": 0.8},
            {"x": 0.2, "y": 0.8},
        ]
        assert point_in_polygon(0.1, 0.1, polygon) is False

    def test_triangle(self) -> None:
        polygon = [
            {"x": 0.5, "y": 0.1},
            {"x": 0.9, "y": 0.9},
            {"x": 0.1, "y": 0.9},
        ]
        assert point_in_polygon(0.5, 0.6, polygon) is True
        assert point_in_polygon(0.1, 0.1, polygon) is False

    def test_less_than_3_points(self) -> None:
        assert point_in_polygon(0.5, 0.5, [{"x": 0, "y": 0}]) is False
        assert point_in_polygon(0.5, 0.5, []) is False


class TestTrackCentroid:
    def test_bottom_center(self) -> None:
        bbox = (0.2, 0.3, 0.6, 0.9)
        cx, cy = track_centroid(bbox)
        assert cx == 0.4
        assert cy == 0.9  # bottom


class TestMatchZones:
    def test_match(self) -> None:
        zone = _square_zone()
        matched = match_zones((0.5, 0.5), [zone])
        assert len(matched) == 1
        assert matched[0].id == "z1"

    def test_no_match(self) -> None:
        zone = _square_zone()
        matched = match_zones((0.1, 0.1), [zone])
        assert len(matched) == 0

    def test_multiple_zones(self) -> None:
        z1 = _square_zone("z1")
        z2 = Zone(
            id="z2",
            name="Small",
            polygon=[
                {"x": 0.4, "y": 0.4},
                {"x": 0.6, "y": 0.4},
                {"x": 0.6, "y": 0.6},
                {"x": 0.4, "y": 0.6},
            ],
            track_posture=True,
        )
        matched = match_zones((0.5, 0.5), [z1, z2])
        assert len(matched) == 2


def test_match_zones_fallback_bbox_center():
    """Orang dengan kaki terpotong (feet di luar zona) tetap match via center bbox."""
    from src.zone_matcher import Zone, match_zones, track_centroid

    zone = Zone(
        id="z1",
        name="Tepi Atas",
        polygon=[{"x": 0.4, "y": 0.0}, {"x": 0.6, "y": 0.0},
                 {"x": 0.6, "y": 0.3}, {"x": 0.4, "y": 0.3}],
        track_posture=True,
    )
    # Orang di tepi atas: bbox center (0.5, 0.15) di dalam zona,
    # tapi feet (0.5, 0.45) di luar zona.
    bbox = (0.45, -0.15, 0.55, 0.45)  # y1 negatif = kepala terpotong atas frame
    centroid = track_centroid(bbox)
    assert centroid == (0.5, 0.45)

    # Tanpa fallback: feet di luar → tidak match
    matched_no_fallback = match_zones(centroid, [zone])
    assert matched_no_fallback == []

    # Dengan fallback bbox center → match
    matched = match_zones(centroid, [zone], bbox=bbox)
    assert len(matched) == 1
    assert matched[0].id == "z1"


def test_match_zones_feet_priority():
    """Feet di dalam zona → langsung match meski center di luar zona."""
    from src.zone_matcher import Zone, match_zones, track_centroid

    zone = Zone(
        id="z1",
        name="Lantai",
        polygon=[{"x": 0.3, "y": 0.8}, {"x": 0.7, "y": 0.8},
                 {"x": 0.7, "y": 1.0}, {"x": 0.3, "y": 1.0}],
        track_posture=False,
    )
    # Orang berdiri: center (0.5, 0.5) di luar, feet (0.5, 0.95) di dalam
    bbox = (0.45, 0.05, 0.55, 0.95)
    centroid = track_centroid(bbox)
    matched = match_zones(centroid, [zone], bbox=bbox)
    assert len(matched) == 1
