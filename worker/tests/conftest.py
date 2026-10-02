from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

from edgeworker.config import CameraConfig, EquipmentItem
from edgeworker.detector import Detection


def utc(h: int, m: int = 0, s: int = 0) -> datetime:
    return datetime(2026, 10, 2, h, m, s, tzinfo=timezone.utc)


def det(label: str, x1=10.0, y1=10.0, x2=50.0, y2=90.0, conf=0.9) -> Detection:
    return Detection(label=label, confidence=conf, box=(x1, y1, x2, y2))


@pytest.fixture
def blank():
    return np.zeros((100, 200, 3), dtype=np.uint8)


@pytest.fixture
def camera():
    return CameraConfig(label="Lab-1 front", source="x.mp4")


@pytest.fixture
def camera_with_equipment():
    return CameraConfig(
        label="Lab-1 front",
        source="x.mp4",
        equipment=(
            EquipmentItem("Desktop computer", ("tv", "laptop"), "display_on"),
            EquipmentItem("Welding bench", ("bench",), "none"),
        ),
    )


class FakeDetector:
    """Returns a scripted list of detections per call, repeating the last one."""

    def __init__(self, script):
        self.script, self.calls = script, 0

    def detect(self, frame):
        out = self.script[min(self.calls, len(self.script) - 1)]
        self.calls += 1
        return out
