"""Worker <-> server contract. The same fixture is parsed by the TypeScript
validator in tests/unit/video-ingest.test.ts, so a change on either side that
breaks the other fails a test on that side."""

import json
from pathlib import Path

from edgeworker.counting import Observation
from tests.conftest import utc

FIXTURE = Path(__file__).parent / "fixtures" / "payload_example.json"


def test_worker_payload_matches_the_shared_fixture_exactly():
    expected = json.loads(FIXTURE.read_text(encoding="utf-8"))["observations"][0]
    obs = Observation(
        camera_label="Lab-1 front",
        observed_at=utc(9),
        person_count=24,
        equipment={"Desktop computer": {"count": 12, "operating": 11}, "Welding bench": 6},
        frames_sampled=12,
        mean_confidence=0.81234,
        model_version="yolov8n-coco",
    )
    assert obs.to_payload() == expected
