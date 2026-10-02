import textwrap

import cv2
import numpy as np
import pytest

from edgeworker.config import ConfigError, load_config
from edgeworker.operability import display_on, moving
from edgeworker.sources import file_frames
from tests.conftest import utc


# ---------- sources ----------
def make_video(path, seconds=10, fps=10, size=(160, 120)):
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, size)
    for i in range(seconds * fps):
        w.write(np.full((size[1], size[0], 3), i % 255, dtype=np.uint8))
    w.release()


def test_file_frames_samples_on_video_time_with_simulated_clock(tmp_path):
    path = tmp_path / "clip.avi"
    make_video(path, seconds=10, fps=10)
    got = list(file_frames(str(path), interval_s=2, start_time=utc(9)))
    assert [t.second for t, _ in got] == [0, 2, 4, 6, 8]
    assert got[0][0] == utc(9)


def test_missing_video_fails_loudly(tmp_path):
    with pytest.raises(ConnectionError):
        list(file_frames(str(tmp_path / "nope.avi"), 1, utc(9)))


# ---------- operability heuristics ----------
BOX = (10, 10, 60, 60)


def test_display_on_distinguishes_bright_from_dark():
    assert display_on(np.full((100, 100, 3), 220, dtype=np.uint8), BOX)
    assert not display_on(np.full((100, 100, 3), 10, dtype=np.uint8), BOX)


def test_motion_needs_a_change_between_samples():
    a = np.zeros((100, 100, 3), dtype=np.uint8)
    b = a.copy()
    b[10:60, 10:60] = 90
    assert moving(b, a, BOX)
    assert not moving(a, a.copy(), BOX)
    assert not moving(a, None, BOX)  # first sample: no baseline, never claims motion


def test_tiny_boxes_are_ignored():
    assert not display_on(np.full((100, 100, 3), 255, dtype=np.uint8), (10, 10, 12, 12))


# ---------- config ----------
def write(tmp_path, body):
    p = tmp_path / "config.yaml"
    p.write_text(textwrap.dedent(body), encoding="utf-8")
    return p


BASE = """
    centre_code: tc-hyd-014
    api_url: http://localhost:3000/api/video-ingest
    model: {path: m.onnx}
    cameras:
      - label: Lab-1
        source: 0
"""


def test_loads_and_normalises(tmp_path, monkeypatch):
    monkeypatch.setenv("INGEST_KEY", "k123")
    cfg = load_config(write(tmp_path, BASE))
    assert cfg.centre_code == "TC-HYD-014" and cfg.ingest_key == "k123"
    assert cfg.window_s == 60 and cfg.model.input_size == 640


def test_key_must_come_from_the_environment(tmp_path, monkeypatch):
    monkeypatch.delenv("INGEST_KEY", raising=False)
    with pytest.raises(ConfigError, match="INGEST_KEY"):
        load_config(write(tmp_path, BASE))


def cfg_file(tmp_path, **over):
    import yaml

    base = {
        "centre_code": "TC-1",
        "api_url": "http://localhost:3000/api/video-ingest",
        "model": {"path": "m.onnx"},
        "cameras": [{"label": "Lab-1", "source": 0}],
    }
    base.update(over)
    p = tmp_path / "config.yaml"
    p.write_text(yaml.safe_dump(base), encoding="utf-8")
    return p


def test_a_key_in_the_file_is_ignored(tmp_path, monkeypatch):
    monkeypatch.delenv("INGEST_KEY", raising=False)
    with pytest.raises(ConfigError, match="INGEST_KEY"):
        load_config(cfg_file(tmp_path, ingest_key="sneaky"))


@pytest.mark.parametrize(
    "over, message",
    [
        ({"window_s": 2, "sample_interval_s": 5}, "window_s"),
        ({"upload": {"batch_size": 500}}, "batch_size"),
        ({"cameras": [{"label": "A", "source": 0}, {"label": "A", "source": 1}]}, "unique"),
        ({"cameras": []}, "at least one camera"),
        ({"cameras": [{"label": "A"}]}, "needs a source"),
    ],
)
def test_rejects_bad_values(tmp_path, monkeypatch, over, message):
    monkeypatch.setenv("INGEST_KEY", "k")
    with pytest.raises(ConfigError, match=message):
        load_config(cfg_file(tmp_path, **over))


def test_rejects_bad_equipment_and_roi(tmp_path, monkeypatch):
    monkeypatch.setenv("INGEST_KEY", "k")
    bad_op = BASE + "        equipment:\n          Bench: {classes: [bench], operability: telepathy}\n"
    with pytest.raises(ConfigError, match="operability"):
        load_config(write(tmp_path, bad_op))
    bad_roi = BASE + "        roi: [[0, 0], [2, 0], [1, 1]]\n"
    with pytest.raises(ConfigError, match="normalised"):
        load_config(write(tmp_path, bad_roi))
