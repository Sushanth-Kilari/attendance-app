from __future__ import annotations

import logging
import random
import threading
from datetime import datetime
from typing import Iterable

import numpy as np

from .config import CameraConfig, Config
from .counting import WindowAggregator, count_frame
from .detector import Detector, OnnxYoloDetector, load_names
from .outbox import ObservationQueue
from .uploader import AuthError, RetryLater, Uploader

log = logging.getLogger("edgeworker")


def build_detector(cfg: Config) -> Detector:
    names = load_names(cfg.model.names)
    wanted = {"person"}
    for cam in cfg.cameras:
        for item in cam.equipment:
            wanted.update(item.classes)
    unknown = wanted - set(names)
    if unknown:
        raise ValueError(f"classes not in the model's label set: {sorted(unknown)}")
    return OnnxYoloDetector(
        cfg.model.path, names, input_size=cfg.model.input_size, conf=cfg.model.conf, iou=cfg.model.iou, wanted=wanted
    )


def process_frames(
    frames: Iterable[tuple[datetime, np.ndarray]],
    camera: CameraConfig,
    detector: Detector,
    queue: ObservationQueue,
    window_s: int,
    model_version: str | None,
) -> int:
    """Run frames -> counts -> windowed observations -> queue. Returns observations enqueued.

    The frame variable is rebound every iteration and never stored, written or
    logged: pixels exist only for the duration of one detect() call plus the
    optional operability check on the previous sample.
    """
    agg = WindowAggregator(camera=camera, window_s=window_s, model_version=model_version)
    prev: np.ndarray | None = None
    enqueued = 0

    for ts, frame in frames:
        counts = count_frame(detector.detect(frame), camera, frame, prev)
        prev = frame if any(i.operability == "motion" for i in camera.equipment) else None
        done = agg.add(ts, counts)
        if done:
            queue.enqueue(done.to_payload())
            enqueued += 1

    last = agg.flush()
    if last:
        queue.enqueue(last.to_payload())
        enqueued += 1
    return enqueued


def upload_loop(cfg: Config, queue: ObservationQueue, stop: threading.Event) -> None:
    """Background uploader: flush on an interval, back off while the link is down."""
    uploader = Uploader(cfg.api_url, cfg.centre_code, cfg.ingest_key, cfg.request_timeout_s, cfg.max_attempts)
    backoff = cfg.upload_interval_s
    while not stop.is_set():
        try:
            r = uploader.flush(queue, cfg.upload_batch_size)
            if r.sent or r.duplicates or r.failed:
                log.info("uploaded: %d stored, %d duplicate, %d failed, %d dropped", r.sent, r.duplicates, r.failed, r.dropped)
            backoff = cfg.upload_interval_s
        except AuthError as e:
            log.error("%s — pausing uploads, observations keep queuing", e)
            backoff = max(backoff, 600)
        except RetryLater as e:
            backoff = min(backoff * 2, 900)
            log.warning("offline (%s); %d queued; retrying in %.0fs", e, queue.size(), backoff)
        stop.wait(backoff * random.uniform(0.9, 1.1))  # jitter so many centres do not retry in lockstep


def run(cfg: Config) -> None:
    from .sources import live_frames

    queue = ObservationQueue(cfg.queue_path, cfg.queue_max_rows)
    detector = build_detector(cfg)
    stop = threading.Event()

    threads = [threading.Thread(target=upload_loop, args=(cfg, queue, stop), name="uploader", daemon=True)]
    for cam in cfg.cameras:
        frames = live_frames(cam.source, cfg.sample_interval_s, stop.is_set)
        threads.append(
            threading.Thread(
                target=process_frames,
                args=(frames, cam, detector, queue, cfg.window_s, cfg.model.version),
                name=f"cam-{cam.label}",
                daemon=True,
            )
        )
    for t in threads:
        t.start()
    try:
        while any(t.is_alive() for t in threads[1:]):
            stop.wait(1)
    except KeyboardInterrupt:
        log.info("stopping")
    finally:
        stop.set()
