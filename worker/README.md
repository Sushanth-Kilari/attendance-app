# Edge worker

Runs at the training centre. Reads the centre's cameras, counts people and
configured equipment on a small CPU, and sends **only the counts** to the
monitoring app. It never sends, stores or logs video or images.

```
camera ──▶ sample 1 frame / 5 s ──▶ detector (ONNX, CPU) ──▶ counts ──▶ 60 s window (peak)
                                      │ pixels exist only here │            │
                                      └─ discarded after the call          ▼
                                                              SQLite outbox ──▶ POST /api/video-ingest
                                                              (survives outages)   (batched, ~250 B/obs)
```

## What is and is not identified

| Leaves the centre | Never leaves, never stored |
|---|---|
| head-count per camera per minute (peak) | frames, video, crops, thumbnails |
| tally of each configured equipment item | faces, face embeddings, any biometric |
| "n of them appear to be operating" (optional) | names, roll numbers, track IDs |
| mean detector confidence, frame count, model version | who was where, or for how long |

There is no tracking and no re-identification: each frame is counted on its
own, so nobody can be followed across frames. The payload is built from an
allow-list (`counting.Observation.to_payload`) and `tests/test_privacy.py`
pins the exact key set, so widening it requires changing a test on purpose.

## Install

```bash
cd worker
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"      # Windows;  .venv/bin/pip on Linux
cp config.example.yaml config.yaml          # edit it
```

You supply a YOLOv8-format ONNX model at `model.path` (not included). The
ingest key is generated at **/admin/cameras** and passed by environment
variable, never written in the config file:

```bash
export INGEST_KEY=...      # PowerShell: $env:INGEST_KEY = "..."
python -m edgeworker run                    # live cameras, continuous upload
```

Other commands:

```bash
python -m edgeworker process-video clip.mp4 --camera "Lab-1 front" \
    --start 2026-10-02T09:00:00+05:30 --queue demo.sqlite --print   # replay a recording as if live
python -m edgeworker flush       # upload whatever is queued, once
python -m edgeworker status      # how many observations are waiting
```

## Low-bandwidth mode

- **Compute at the edge, ship numbers.** One observation is ~250 bytes of JSON;
  at one per camera per minute that is ~15 KB per camera per hour. A single
  1 Mbps video stream is ~450 MB per hour, about 30,000x more.
- **Tune the link, not the code:** raise `window_s` (fewer, coarser
  observations), raise `sample_interval_s` (less CPU), lower `model.input_size`
  to 416 or 320 (faster on weak CPUs, at some cost to people far from the camera).
- **Offline-first.** Every observation goes to a local SQLite outbox first; the
  uploader drains it when the link is up, with exponential backoff and jitter.
  Replays are safe: `observed_at` is aligned to the window start, so a retry
  produces the same key and the server answers `duplicate`.
- **Bounded disk.** The outbox keeps the newest `queue.max_rows` and drops the
  oldest beyond that, so a weeks-long outage cannot fill a small disk.
- **Failure handling.** Network errors and 5xx keep everything queued; a bad
  ingest key (401) pauses uploads without discarding data; one malformed row is
  isolated and dropped so it cannot block the rest.

## Known limits (be honest about these in the demo)

- **COCO has no "workbench" or "machinery".** The stock COCO model counts
  people, chairs, laptops and TVs. Detecting a lathe or a welding bench needs a
  model fine-tuned on that equipment; point `model.path` and `model.names` at it
  and list its class names under each item's `classes`.
- **Operability is a heuristic.** `display_on` (a screen shows bright content)
  and `motion` (pixels changed between samples) are cheap cues, not a diagnosis:
  they cannot tell "off" from "idle but powered". The server only raises
  `equipment_nonfunctional` from the day's peak, and M5 reports their error
  rates separately.
- **Per-camera peaks are not summed.** If two cameras each see half the benches,
  the server's daily peak is the larger of the two, so it can under-count and
  raise a false "missing". Place cameras so each equipment item is listed on one
  camera only, or on the one with the full view.
- **Not benchmarked on target hardware yet.** Throughput claims will come from
  M5 on a real low-end CPU, not from this README.
- **Occlusion.** Crowded rooms and people far from the camera are under-counted.
  The server compensates with a tolerance, and the accuracy assessment reports it.

## Tests

```bash
.venv/Scripts/python -m pytest -q
```

Covers the YOLO decoder and NMS, ROI filtering, windowing and peak logic, the
privacy contract, the SQLite outbox, uploader failure modes, frame sampling,
config validation, and a smoke test of the real ONNX detector against a tiny
generated model. `tests/fixtures/payload_example.json` is shared with the
TypeScript suite (`tests/unit/video-ingest.test.ts`), so the worker and the
server cannot drift apart unnoticed.
