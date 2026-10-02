from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone

from .config import ConfigError, load_config
from .outbox import ObservationQueue
from .uploader import AuthError, RetryLater, Uploader


def _parse_time(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def cmd_run(args, cfg) -> int:
    from .pipeline import run

    run(cfg)
    return 0


def cmd_process_video(args, cfg) -> int:
    """Replay a recorded clip as if it were live: for demos and the accuracy assessment."""
    from .pipeline import build_detector, process_frames
    from .sources import file_frames

    camera = next((c for c in cfg.cameras if c.label == args.camera), None)
    if camera is None:
        print(f"no camera labelled {args.camera!r} in the config", file=sys.stderr)
        return 2

    queue = ObservationQueue(args.queue or cfg.queue_path, cfg.queue_max_rows)
    before = queue.size()
    frames = file_frames(args.video, cfg.sample_interval_s, _parse_time(args.start))
    n = process_frames(frames, camera, build_detector(cfg), queue, cfg.window_s, cfg.model.version)
    print(f"{n} observation(s) queued ({queue.size() - before} new rows). Pending in queue: {queue.size()}")

    if args.print:
        for _, payload in queue.peek(n):
            print(json.dumps(payload))
    if args.upload:
        return cmd_flush(args, cfg)
    return 0


def cmd_flush(args, cfg) -> int:
    queue = ObservationQueue(getattr(args, "queue", None) or cfg.queue_path, cfg.queue_max_rows)
    uploader = Uploader(cfg.api_url, cfg.centre_code, cfg.ingest_key, cfg.request_timeout_s, cfg.max_attempts)
    try:
        r = uploader.flush(queue, cfg.upload_batch_size)
    except AuthError as e:
        print(f"auth error: {e}", file=sys.stderr)
        return 3
    except RetryLater as e:
        print(f"offline: {e}. {queue.size()} observation(s) stay queued.", file=sys.stderr)
        return 4
    print(f"stored {r.sent}, duplicate {r.duplicates}, failed {r.failed}, dropped {r.dropped}; {queue.size()} pending")
    return 0


def cmd_status(args, cfg) -> int:
    print(f"centre {cfg.centre_code}: {ObservationQueue(cfg.queue_path, cfg.queue_max_rows).size()} observation(s) pending")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="edgeworker", description=__doc__)
    parser.add_argument("-c", "--config", default="config.yaml")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="process live cameras and upload continuously").set_defaults(fn=cmd_run)

    pv = sub.add_parser("process-video", help="replay a recorded clip through the pipeline")
    pv.add_argument("video")
    pv.add_argument("--camera", required=True, help="camera label from the config to apply (ROI, equipment)")
    pv.add_argument("--start", default=datetime.now(timezone.utc).isoformat(), help="ISO time the clip starts, e.g. 2026-10-02T09:00:00+05:30")
    pv.add_argument("--queue", help="override the queue file (keeps demo data out of the real outbox)")
    pv.add_argument("--print", action="store_true", help="print the queued payloads")
    pv.add_argument("--upload", action="store_true", help="flush to the server afterwards")
    pv.set_defaults(fn=cmd_process_video)

    sub.add_parser("flush", help="upload whatever is queued, once").set_defaults(fn=cmd_flush)
    sub.add_parser("status", help="show the queue size").set_defaults(fn=cmd_status)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    try:
        cfg = load_config(args.config)
    except (ConfigError, FileNotFoundError) as e:
        print(f"config error: {e}", file=sys.stderr)
        return 2
    return args.fn(args, cfg)


if __name__ == "__main__":
    sys.exit(main())
