"""Tests untuk posture_classifier module."""

import numpy as np

from src.posture_classifier import Posture, classify_posture


def _make_keypoints(
    shoulder_y: float = 100,
    hip_y: float = 200,
    knee_y: float = 300,
    ankle_y: float = 400,
    confidence: float = 0.9,
) -> tuple[np.ndarray, np.ndarray]:
    """Buat keypoint COCO 17-point untuk pengujian.

    Layout COCO:
    0=nose, 5=L_shoulder, 6=R_shoulder,
    11=L_hip, 12=R_hip, 13=L_knee, 14=R_knee,
    15=L_ankle, 16=R_ankle
    """
    kpts = np.zeros((17, 2), dtype=np.float64)
    conf = np.full(17, confidence, dtype=np.float64)

    # Nose
    kpts[0] = [320, shoulder_y - 30]

    # Shoulders
    kpts[5] = [300, shoulder_y]  # left
    kpts[6] = [340, shoulder_y]  # right

    # Hips
    kpts[11] = [305, hip_y]  # left
    kpts[12] = [335, hip_y]  # right

    # Knees
    kpts[13] = [308, knee_y]  # left
    kpts[14] = [332, knee_y]  # right

    # Ankles
    kpts[15] = [310, ankle_y]  # left
    kpts[16] = [330, ankle_y]  # right

    return kpts, conf


class TestClassifyPosture:
    def test_standing(self) -> None:
        """Orang berdiri: hip jauh dari ankle, sudut lutut hampir lurus."""
        kpts, conf = _make_keypoints(
            shoulder_y=100, hip_y=200, knee_y=300, ankle_y=400
        )
        result = classify_posture(kpts, conf)
        assert result in (Posture.STANDING, Posture.UNKNOWN)

    def test_sitting(self) -> None:
        """Orang duduk: hip turun, lutut menekuk ~90°, hip dekat ankle."""
        kpts = np.zeros((17, 2), dtype=np.float64)
        conf = np.full(17, 0.9, dtype=np.float64)

        # Nose
        kpts[0] = [320, 70]
        # Shoulders
        kpts[5] = [300, 100]
        kpts[6] = [340, 100]
        # Hips (turun ke posisi duduk)
        kpts[11] = [305, 220]
        kpts[12] = [335, 220]
        # Knees (paha horizontal keluar)
        kpts[13] = [250, 220]
        kpts[14] = [240, 220]
        # Ankles (betis vertikal ke bawah)
        kpts[15] = [250, 320]
        kpts[16] = [240, 320]

        result = classify_posture(kpts, conf)
        assert result in (Posture.SITTING, Posture.UNKNOWN)

    def test_low_confidence_returns_unknown(self) -> None:
        """Confidence rendah → UNKNOWN."""
        kpts, conf = _make_keypoints(confidence=0.1)
        result = classify_posture(kpts, conf)
        assert result == Posture.UNKNOWN

    def test_missing_shoulders_returns_unknown(self) -> None:
        """Tanpa bahu → UNKNOWN."""
        kpts, conf = _make_keypoints()
        conf[5] = 0.0  # left shoulder
        conf[6] = 0.0  # right shoulder
        result = classify_posture(kpts, conf)
        assert result == Posture.UNKNOWN

    def test_missing_hips_returns_unknown(self) -> None:
        """Tanpa hip → UNKNOWN."""
        kpts, conf = _make_keypoints()
        conf[11] = 0.0  # left hip
        conf[12] = 0.0  # right hip
        result = classify_posture(kpts, conf)
        assert result == Posture.UNKNOWN

    def test_all_keypoints_zero_returns_unknown(self) -> None:
        """Semua keypoint nol → UNKNOWN."""
        kpts = np.zeros((17, 2))
        conf = np.ones(17)
        result = classify_posture(kpts, conf)
        assert result == Posture.UNKNOWN
