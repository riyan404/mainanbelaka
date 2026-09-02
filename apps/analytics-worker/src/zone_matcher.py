"""Point-in-polygon test untuk zona analitik."""

from dataclasses import dataclass


@dataclass
class Zone:
    """Zona analitik dari database."""

    id: str
    name: str
    polygon: list[dict[str, float]]  # [{"x": 0.5, "y": 0.3}, ...]
    track_posture: bool


def point_in_polygon(
    px: float, py: float, polygon: list[dict[str, float]]
) -> bool:
    """Ray-casting algorithm untuk cek apakah titik (px,py) di dalam poligon.

    Koordinat dalam range 0–1 (relatif terhadap frame).
    """
    n = len(polygon)
    if n < 3:
        return False

    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]["x"], polygon[i]["y"]
        xj, yj = polygon[j]["x"], polygon[j]["y"]

        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i

    return inside


def track_centroid(
    bbox: tuple[float, float, float, float],
) -> tuple[float, float]:
    """Hitung centroid (bottom-center) dari bounding box.

    Menggunakan bottom-center karena lebih representatif untuk posisi kaki.
    bbox: (x1, y1, x2, y2) relatif 0–1.
    """
    x1, _y1, x2, y2 = bbox
    cx = (x1 + x2) / 2
    cy = y2  # bottom of bbox (kaki)
    # Clamp ke dalam frame: kaki yang menyentuh tepi bawah tetap match
    # poligon zona yang digambar sampai y=1 (tepi frame).
    cy = min(cy, 0.995)
    return (cx, cy)


def match_zones(
    centroid: tuple[float, float],
    zones: list[Zone],
    bbox: tuple[float, float, float, float] | None = None,
) -> list[Zone]:
    """Return daftar zona yang mengandung orang.

    Strategi dua lapis:
    1. Titik kaki (bottom-center bbox) di dalam poligon — paling akurat.
    2. Fallback: titik tengah bbox di dalam poligon — menangkap orang
       yang kakinya terpotong tepi frame / tertutup objek (oklusi),
       atau zona di tepi bawah frame yang poligonnya menyentuh y=1.
    """
    matched = []
    for zone in zones:
        if point_in_polygon(centroid[0], centroid[1], zone.polygon):
            matched.append(zone)
            continue
        if bbox is not None:
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
            if point_in_polygon(cx, cy, zone.polygon):
                matched.append(zone)
    return matched
