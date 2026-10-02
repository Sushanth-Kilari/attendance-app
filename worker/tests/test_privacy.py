"""The privacy contract, pinned. If one of these fails, a change has widened
what leaves the centre — that needs a deliberate decision, not a test edit."""

import os
import sqlite3
from datetime import timedelta

import numpy as np

from edgeworker.counting import Observation
from edgeworker.outbox import ObservationQueue
from edgeworker.pipeline import process_frames
from tests.conftest import FakeDetector, det, utc

ALLOWED_KEYS = {
    "camera_label", "observed_at", "person_count", "equipment", "frames_sampled", "mean_confidence", "model_version",
}


def test_payload_has_exactly_the_allowed_keys():
    obs = Observation("Lab-1", utc(9), 12, {"Welding bench": 5}, 12, 0.81234, "yolov8n")
    assert set(obs.to_payload()) == ALLOWED_KEYS


def test_extra_attributes_on_an_observation_cannot_leak_into_the_payload():
    obs = Observation("Lab-1", utc(9), 12, {}, 12, None, None)
    obs.frame_jpeg = b"\xff\xd8secret"  # type: ignore[attr-defined]
    obs.face_embedding = [0.1, 0.2]  # type: ignore[attr-defined]
    assert set(obs.to_payload()) == ALLOWED_KEYS


def test_pipeline_stores_only_counts_and_writes_no_image_files(tmp_path, camera):
    # Frames carry a distinctive marker so a leak of pixel data would be detectable.
    marker = np.full((120, 160, 3), 173, dtype=np.uint8)
    frames = [(utc(9) + timedelta(seconds=s), marker.copy()) for s in range(0, 130, 5)]
    detector = FakeDetector([[det("person"), det("person", 100, 10, 140, 90)]])

    db = tmp_path / "queue.sqlite"
    queue = ObservationQueue(str(db))
    n = process_frames(frames, camera, detector, queue, 60, "yolov8n")
    assert n == 3

    rows = [p for _, p in queue.peek(10)]
    assert all(set(r) == ALLOWED_KEYS for r in rows)
    assert all(r["person_count"] == 2 for r in rows)

    # The whole outbox is tiny: counts, not pictures.
    assert os.path.getsize(db) < 64 * 1024
    stored = " ".join(r[0] for r in sqlite3.connect(db).execute("select payload from pending"))
    assert len(stored) < 2000 and "base64" not in stored

    # Nothing but the sqlite file was written anywhere in the working area.
    assert [p.name for p in tmp_path.iterdir()] == ["queue.sqlite"]


def test_payload_is_small_enough_for_a_poor_link():
    obs = Observation("Lab-1 front", utc(9), 24, {"Desktop computer": {"count": 12, "operating": 11}, "Welding bench": 6}, 12, 0.8123, "yolov8n-coco")
    import json

    assert len(json.dumps(obs.to_payload())) < 400
