"""Cheap, explainable "is it apparently in use?" heuristics for equipment.

These are HEURISTICS, not a diagnosis. They look at pixels inside a box the
detector already found, in memory, and return a number. They cannot tell a
machine that is switched off from one that is idle-but-powered, and a person
walking past a lathe can fool `motion`. That is why the server only raises
`equipment_nonfunctional` from the PEAK across a whole day, and why the
accuracy assessment (M5) reports their error rates separately.
"""

from __future__ import annotations

import numpy as np

from .detector import Detection

# A powered display shows content: its brighter pixels are well above black.
DISPLAY_ON_P90 = 90.0
# Mean absolute grey-level change between two samples that counts as movement.
MOTION_THRESHOLD = 6.0


def _crop_gray(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray | None:
    h, w = frame.shape[:2]
    x1, y1 = max(0, int(box[0])), max(0, int(box[1]))
    x2, y2 = min(w, int(box[2])), min(h, int(box[3]))
    if x2 - x1 < 4 or y2 - y1 < 4:
        return None
    crop = frame[y1:y2, x1:x2]
    if crop.ndim == 3:
        crop = crop.astype(np.float32).mean(axis=2)
    return crop.astype(np.float32)


def display_on(frame: np.ndarray, box: tuple[float, float, float, float]) -> bool:
    crop = _crop_gray(frame, box)
    return crop is not None and float(np.percentile(crop, 90)) > DISPLAY_ON_P90


def moving(frame: np.ndarray, prev: np.ndarray | None, box: tuple[float, float, float, float]) -> bool:
    if prev is None or prev.shape != frame.shape:
        return False
    a, b = _crop_gray(frame, box), _crop_gray(prev, box)
    if a is None or b is None:
        return False
    return float(np.abs(a - b).mean()) > MOTION_THRESHOLD


def estimate_operating(mode: str, frame: np.ndarray, prev: np.ndarray | None, boxes: list[Detection]) -> int:
    if mode == "display_on":
        return sum(1 for d in boxes if display_on(frame, d.box))
    if mode == "motion":
        return sum(1 for d in boxes if moving(frame, prev, d.box))
    raise ValueError(f"unknown operability mode: {mode}")
