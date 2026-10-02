import numpy as np

from edgeworker.config import CameraConfig
from edgeworker.counting import FrameCounts, WindowAggregator, count_frame, in_roi, point_in_polygon
from tests.conftest import det, utc

SQUARE = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
LEFT_HALF = ((0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0))


def counts(people=0, eq=None, op=None, confs=None):
    return FrameCounts(people=people, person_confidences=confs or [0.9] * people, equipment=eq or {}, operating=op or {})


def test_point_in_polygon():
    assert point_in_polygon(0.25, 0.5, LEFT_HALF)
    assert not point_in_polygon(0.75, 0.5, LEFT_HALF)


def test_roi_excludes_people_outside_the_training_area(blank):
    cam = CameraConfig(label="c", source="x", roi=LEFT_HALF)
    inside = det("person", 10, 10, 50, 90)  # centre x = 30 of 200 -> 0.15
    outside = det("person", 150, 10, 190, 90)  # centre x = 170 -> 0.85
    c = count_frame([inside, outside], cam, blank, None)
    assert c.people == 1


def test_no_roi_counts_everyone(blank, camera):
    assert in_roi(det("person"), None, blank.shape[:2])
    assert count_frame([det("person"), det("person", 100, 10, 140, 90)], camera, blank, None).people == 2


def test_equipment_reported_even_when_zero_and_only_for_configured_items(blank, camera_with_equipment):
    c = count_frame([det("person"), det("bench"), det("bench", 100, 10, 140, 90), det("chair")], camera_with_equipment, blank, None)
    assert c.equipment == {"Desktop computer": 0, "Welding bench": 2}  # 0 reported on purpose; chair ignored
    assert "chair" not in c.equipment


def test_operating_only_for_items_with_a_heuristic(blank, camera_with_equipment):
    bright = np.full((100, 200, 3), 255, dtype=np.uint8)
    c = count_frame([det("tv", 10, 10, 60, 60)], camera_with_equipment, bright, None)
    assert c.operating == {"Desktop computer": 1}  # Welding bench has operability "none"


def test_window_uses_peak_not_average(camera):
    agg = WindowAggregator(camera, window_s=60)
    for s, n in [(0, 4), (5, 12), (10, 9)]:
        assert agg.add(utc(9, 0, s), counts(n)) is None
    obs = agg.flush()
    assert obs.person_count == 12
    assert obs.frames_sampled == 3


def test_new_window_emits_the_previous_one(camera):
    agg = WindowAggregator(camera, window_s=60)
    agg.add(utc(9, 0, 10), counts(5))
    done = agg.add(utc(9, 1, 5), counts(7))
    assert done.person_count == 5
    assert done.observed_at == utc(9, 0, 0)  # aligned to the window start, not the first frame
    assert agg.flush().person_count == 7


def test_window_start_is_deterministic_so_replays_deduplicate(camera):
    a, b = WindowAggregator(camera, 60), WindowAggregator(camera, 60)
    a.add(utc(9, 0, 7), counts(3))
    b.add(utc(9, 0, 41), counts(3))  # restarted worker sees a later frame of the same window
    assert a.flush().observed_at == b.flush().observed_at


def test_operating_is_clamped_to_count_when_peaks_come_from_different_frames(camera_with_equipment):
    agg = WindowAggregator(camera_with_equipment, 60)
    agg.add(utc(9, 0, 0), counts(eq={"Desktop computer": 1}, op={"Desktop computer": 1}))
    agg.add(utc(9, 0, 5), counts(eq={"Desktop computer": 0}, op={"Desktop computer": 3}))  # noisy heuristic
    obs = agg.flush()
    assert obs.equipment["Desktop computer"] == {"count": 1, "operating": 1}


def test_mean_confidence_is_over_person_detections_and_none_when_empty(camera):
    agg = WindowAggregator(camera, 60)
    agg.add(utc(9, 0, 0), counts(2, confs=[0.8, 0.6]))
    assert abs(agg.flush().mean_confidence - 0.7) < 1e-9
    agg.add(utc(9, 0, 0), counts(0))
    assert agg.flush().mean_confidence is None


def test_flush_with_nothing_returns_none(camera):
    assert WindowAggregator(camera, 60).flush() is None
