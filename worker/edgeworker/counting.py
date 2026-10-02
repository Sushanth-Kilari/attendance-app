from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np

from .config import CameraConfig
from .detector import Detection
from .operability import estimate_operating


def point_in_polygon(x: float, y: float, poly: tuple[tuple[float, float], ...]) -> bool:
    """Ray casting. Works in any consistent coordinate space."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_roi(det: Detection, roi: tuple[tuple[float, float], ...] | None, frame_shape: tuple[int, int]) -> bool:
    if roi is None:
        return True
    h, w = frame_shape
    cx = (det.box[0] + det.box[2]) / 2 / w
    # Bottom-centre of a person box is where they stand; centre of a box is
    # fine for equipment, so use the lower third for both as a cheap compromise.
    cy = (det.box[1] + (det.box[3] - det.box[1]) * 0.75) / h
    return point_in_polygon(cx, cy, roi)


@dataclass
class FrameCounts:
    people: int
    person_confidences: list[float]
    equipment: dict[str, int]  # item name -> units seen
    operating: dict[str, int]  # item name -> units that appeared to be operating (only for items with a heuristic)


def count_frame(
    detections: list[Detection],
    camera: CameraConfig,
    frame: np.ndarray,
    prev_frame: np.ndarray | None,
) -> FrameCounts:
    shape = frame.shape[:2]
    kept = [d for d in detections if in_roi(d, camera.roi, shape)]

    people = [d for d in kept if d.label == "person"]
    equipment: dict[str, int] = {}
    operating: dict[str, int] = {}

    for item in camera.equipment:
        boxes = [d for d in kept if d.label in item.classes]
        equipment[item.name] = len(boxes)
        if item.operability != "none":
            operating[item.name] = estimate_operating(item.operability, frame, prev_frame, boxes)

    return FrameCounts(
        people=len(people),
        person_confidences=[d.confidence for d in people],
        equipment=equipment,
        operating=operating,
    )


@dataclass
class Observation:
    camera_label: str
    observed_at: datetime  # window start, UTC
    person_count: int
    equipment: dict[str, int | dict[str, int]]
    frames_sampled: int
    mean_confidence: float | None
    model_version: str | None

    def to_payload(self) -> dict:
        """The ONLY thing that ever leaves the centre.

        Built field by field from an allow-list rather than serialising the
        object, so adding an attribute here (a crop, an embedding, a track id)
        can never leak by accident: it would have to be added to this dict on
        purpose, and tests/test_privacy.py pins the exact key set.
        """
        return {
            "camera_label": self.camera_label,
            "observed_at": self.observed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "person_count": self.person_count,
            "equipment": self.equipment,
            "frames_sampled": self.frames_sampled,
            "mean_confidence": None if self.mean_confidence is None else round(self.mean_confidence, 3),
            "model_version": self.model_version,
        }


@dataclass
class WindowAggregator:
    """Folds many sampled frames into one observation per fixed time window.

    Uses the PEAK count per window, matching the server's engine: a detector
    under-counts through occlusion and never over-counts a room, so the maximum
    is the fairest estimate. Window starts are aligned to the epoch, so a replay
    after a crash regenerates the same observed_at and the server de-duplicates.
    """

    camera: CameraConfig
    window_s: int
    model_version: str | None = None
    _start: datetime | None = field(default=None, init=False)
    _peak_people: int = field(default=0, init=False)
    _conf_sum: float = field(default=0.0, init=False)
    _conf_n: int = field(default=0, init=False)
    _frames: int = field(default=0, init=False)
    _eq_peak: dict[str, int] = field(default_factory=dict, init=False)
    _op_peak: dict[str, int] = field(default_factory=dict, init=False)

    def _window_start(self, ts: datetime) -> datetime:
        epoch = int(ts.timestamp())
        return datetime.fromtimestamp(epoch - epoch % self.window_s, tz=timezone.utc)

    def add(self, ts: datetime, counts: FrameCounts) -> Observation | None:
        """Add one frame's counts; returns the PREVIOUS window's observation if this frame starts a new one."""
        start = self._window_start(ts)
        finished = None
        if self._start is not None and start != self._start:
            finished = self.flush()
        if self._start is None:
            self._start = start

        self._frames += 1
        self._peak_people = max(self._peak_people, counts.people)
        self._conf_sum += sum(counts.person_confidences)
        self._conf_n += len(counts.person_confidences)
        for name, n in counts.equipment.items():
            self._eq_peak[name] = max(self._eq_peak.get(name, 0), n)
        for name, n in counts.operating.items():
            self._op_peak[name] = max(self._op_peak.get(name, 0), n)
        return finished

    def flush(self) -> Observation | None:
        if self._start is None or self._frames == 0:
            return None

        equipment: dict[str, int | dict[str, int]] = {}
        for name, count in self._eq_peak.items():
            if name in self._op_peak:
                # operating can never exceed count (server rejects it); the two
                # peaks may come from different frames, so clamp.
                equipment[name] = {"count": count, "operating": min(self._op_peak[name], count)}
            else:
                equipment[name] = count

        obs = Observation(
            camera_label=self.camera.label,
            observed_at=self._start,
            person_count=self._peak_people,
            equipment=equipment,
            frames_sampled=self._frames,
            mean_confidence=(self._conf_sum / self._conf_n) if self._conf_n else None,
            model_version=self.model_version,
        )
        self._start = None
        self._peak_people = 0
        self._conf_sum, self._conf_n, self._frames = 0.0, 0, 0
        self._eq_peak, self._op_peak = {}, {}
        return obs
