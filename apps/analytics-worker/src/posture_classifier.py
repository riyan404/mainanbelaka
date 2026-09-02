"""Klasifikasi postur duduk/berdiri dari keypoint pose YOLO11n-pose.

Menggunakan heuristik geometri sederhana:
- Rasio tinggi torso vs jarak hip-ke-ankle.
- Sudut lutut.
- Di bawah threshold confidence → UNKNOWN.
"""

import math
from enum import Enum

import numpy as np


class Posture(str, Enum):
    SITTING = "SITTING"
    STANDING = "STANDING"
    UNKNOWN = "UNKNOWN"


# COCO keypoint indices (YOLO pose format)
NOSE = 0
LEFT_SHOULDER = 5
RIGHT_SHOULDER = 6
LEFT_HIP = 11
RIGHT_HIP = 12
LEFT_KNEE = 13
RIGHT_KNEE = 14
LEFT_ANKLE = 15
RIGHT_ANKLE = 16

MIN_KEYPOINT_CONFIDENCE = 0.5


def _dist(p1: np.ndarray, p2: np.ndarray) -> float:
    """Euclidean distance between two points."""
    return float(np.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2))


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Angle at point b formed by points a-b-c, in degrees."""
    ba = a - b
    bc = c - b
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    cosine = np.clip(cosine, -1.0, 1.0)
    return float(math.degrees(math.acos(cosine)))


def classify_posture(
    keypoints: np.ndarray,
    keypoint_confidences: np.ndarray,
) -> Posture:
    """Klasifikasi postur dari keypoint pose.

    Args:
        keypoints: array shape (17, 2) — COCO keypoints (x, y) dalam pixel.
        keypoint_confidences: array shape (17,) — confidence per keypoint.

    Returns:
        Posture.SITTING, Posture.STANDING, atau Posture.UNKNOWN.
    """
    # Filter keypoint yang cukup percaya diri
    def get_point(idx: int) -> np.ndarray | None:
        if keypoint_confidences[idx] < MIN_KEYPOINT_CONFIDENCE:
            return None
        return keypoints[idx]

    left_shoulder = get_point(LEFT_SHOULDER)
    right_shoulder = get_point(RIGHT_SHOULDER)
    left_hip = get_point(LEFT_HIP)
    right_hip = get_point(RIGHT_HIP)
    left_knee = get_point(LEFT_KNEE)
    right_knee = get_point(RIGHT_KNEE)
    left_ankle = get_point(LEFT_ANKLE)
    right_ankle = get_point(RIGHT_ANKLE)

    # Butuh minimal bahu + hip untuk klasifikasi
    if left_shoulder is None and right_shoulder is None:
        return Posture.UNKNOWN
    if left_hip is None and right_hip is None:
        return Posture.UNKNOWN

    # Rata-rata kiri/kanan
    shoulder = _midpoint(left_shoulder, right_shoulder)
    hip = _midpoint(left_hip, right_hip)
    if shoulder is None or hip is None:
        return Posture.UNKNOWN

    torso_length = _dist(shoulder, hip)
    if torso_length < 1e-6:
        return Posture.UNKNOWN

    ankle = _midpoint(left_ankle, right_ankle)
    knee = _midpoint(left_knee, right_knee)

    # Strategi 1: Sudut lutut (paling andal)
    if knee is not None and ankle is not None:
        knee_angle = _angle(hip, knee, ankle)
        # Duduk: sudut lutut <120° (paha horizontal, betis vertikal)
        # Berdiri: sudut lutut >150° (hampir lurus)
        if knee_angle < 120:
            return Posture.SITTING
        if knee_angle > 150:
            return Posture.STANDING

    # Strategi 2: Posisi vertikal hip relatif terhadap shoulder-ankle
    if ankle is not None:
        hip_y = hip[1]
        ankle_y = ankle[1]
        shoulder_y = shoulder[1]
        total_height = abs(ankle_y - shoulder_y)
        if total_height > 1e-6:
            hip_ratio = abs(ankle_y - hip_y) / total_height
            # Duduk: hip dekat ke ankle (rasio kecil)
            if hip_ratio < 0.35:
                return Posture.SITTING
            if hip_ratio > 0.55:
                return Posture.STANDING

    # Strategi 3: Rasio torso / hip-to-ankle (tiebreaker)
    if ankle is not None:
        hip_to_ankle = _dist(hip, ankle)
        if hip_to_ankle > 1e-6:
            ratio = torso_length / hip_to_ankle
            # Berdiri: torso lebih panjang relatif ke kaki
            # Duduk: kaki terlipat sehingga hip-to-ankle lebih pendek
            if ratio < 0.45:
                return Posture.SITTING
            if ratio > 0.85:
                return Posture.STANDING

    return Posture.UNKNOWN


def _midpoint(
    p1: np.ndarray | None, p2: np.ndarray | None
) -> np.ndarray | None:
    """Rata-rata dua titik. None jika keduanya None."""
    if p1 is None and p2 is None:
        return None
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    return (p1 + p2) / 2
