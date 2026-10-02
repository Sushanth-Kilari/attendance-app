from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Iterator

import numpy as np


def _open(source: str | int):
    import cv2

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise ConnectionError(f"cannot open video source: {source!r}")
    return cap


def file_frames(
    path: str,
    interval_s: float,
    start_time: datetime,
) -> Iterator[tuple[datetime, np.ndarray]]:
    """Sample a RECORDED video every `interval_s` of video time.

    Timestamps are start_time + position in the video, so a demo clip can be
    replayed as if it were a real morning of class. Uses grab() to skip frames
    without decoding them, which is far cheaper than reading every frame.
    """
    import cv2

    cap = _open(path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        step = max(1, round(fps * interval_s))
        index = 0
        while True:
            if not cap.grab():
                return
            if index % step == 0:
                ok, frame = cap.retrieve()
                if ok:
                    yield start_time + timedelta(seconds=index / fps), frame
            index += 1
    finally:
        cap.release()


def live_frames(
    source: str | int,
    interval_s: float,
    stop: "callable[[], bool] | None" = None,
    reconnect_max_s: float = 60.0,
) -> Iterator[tuple[datetime, np.ndarray]]:
    """Sample a live camera (RTSP URL or device index) by wall clock.

    Keeps draining the stream between samples so the next sample is the
    CURRENT frame, not a stale buffered one. A dropped stream reconnects with
    capped exponential backoff instead of killing the worker, since rural
    cameras and links drop constantly.
    """
    stop = stop or (lambda: False)
    backoff = 1.0
    cap = None
    next_sample = 0.0

    while not stop():
        if cap is None:
            try:
                cap = _open(source)
                backoff = 1.0
            except ConnectionError:
                time.sleep(backoff)
                backoff = min(backoff * 2, reconnect_max_s)
                continue

        if not cap.grab():
            cap.release()
            cap = None
            continue

        now = time.monotonic()
        if now >= next_sample:
            ok, frame = cap.retrieve()
            if ok:
                next_sample = now + interval_s
                yield datetime.now(timezone.utc), frame

    if cap is not None:
        cap.release()
