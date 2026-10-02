from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

VALID_OPERABILITY = {"none", "display_on", "motion"}


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class EquipmentItem:
    # Must match centre_inventory.item_name EXACTLY — the server compares by name.
    name: str
    classes: tuple[str, ...]  # detector labels that count as this item
    operability: str = "none"  # none | display_on | motion


@dataclass(frozen=True)
class CameraConfig:
    label: str  # must match centre_cameras.label on the server
    source: str | int
    # Normalised [0..1] polygon; only detections whose centre falls inside count.
    # Keeps corridors, windows and the street out of the head-count.
    roi: tuple[tuple[float, float], ...] | None = None
    equipment: tuple[EquipmentItem, ...] = ()


@dataclass(frozen=True)
class ModelConfig:
    path: str
    names: str = "coco"  # "coco" or a path to a one-label-per-line file
    input_size: int = 640
    conf: float = 0.35
    iou: float = 0.5
    version: str = "unknown"


@dataclass(frozen=True)
class Config:
    centre_code: str
    api_url: str
    ingest_key: str
    model: ModelConfig
    cameras: tuple[CameraConfig, ...]
    queue_path: str = "data/queue.sqlite"
    queue_max_rows: int = 50_000
    # Sample a frame every sample_interval_s; fold every window_s of samples
    # into ONE observation. Larger window = fewer bytes on a poor link.
    sample_interval_s: float = 5.0
    window_s: int = 60
    upload_batch_size: int = 50
    upload_interval_s: float = 60.0
    request_timeout_s: float = 15.0
    max_attempts: int = 8
    extras: dict = field(default_factory=dict)


def _roi(raw) -> tuple[tuple[float, float], ...] | None:
    if raw is None:
        return None
    if not isinstance(raw, list) or len(raw) < 3:
        raise ConfigError("roi must be a list of at least 3 [x, y] points")
    pts = []
    for p in raw:
        if not (isinstance(p, (list, tuple)) and len(p) == 2 and all(isinstance(v, (int, float)) for v in p)):
            raise ConfigError("roi points must be [x, y] numbers")
        if not all(0 <= v <= 1 for v in p):
            raise ConfigError("roi points are normalised: every value must be between 0 and 1")
        pts.append((float(p[0]), float(p[1])))
    return tuple(pts)


def _camera(raw: dict) -> CameraConfig:
    if not raw.get("label"):
        raise ConfigError("every camera needs a label")
    if raw.get("source") is None:
        raise ConfigError(f"camera '{raw['label']}' needs a source")

    items = []
    for name, spec in (raw.get("equipment") or {}).items():
        spec = spec or {}
        classes = spec.get("classes")
        if not classes or not isinstance(classes, list):
            raise ConfigError(f"equipment '{name}' needs a non-empty classes list")
        op = spec.get("operability", "none")
        if op not in VALID_OPERABILITY:
            raise ConfigError(f"equipment '{name}': operability must be one of {sorted(VALID_OPERABILITY)}")
        items.append(EquipmentItem(name=name, classes=tuple(classes), operability=op))

    return CameraConfig(label=raw["label"], source=raw["source"], roi=_roi(raw.get("roi")), equipment=tuple(items))


def load_config(path: str | Path) -> Config:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}

    for key in ("centre_code", "api_url", "model", "cameras"):
        if key not in raw:
            raise ConfigError(f"config is missing '{key}'")

    # The key comes from the environment, never the file: config.yaml gets
    # copied around and committed; a credential must not ride along.
    env_name = raw.get("ingest_key_env", "INGEST_KEY")
    ingest_key = os.environ.get(env_name, "")
    if not ingest_key:
        raise ConfigError(f"set the {env_name} environment variable to this centre's ingest key")

    m = raw["model"]
    if "path" not in m:
        raise ConfigError("model.path is required")
    model = ModelConfig(
        path=m["path"],
        names=m.get("names", "coco"),
        input_size=int(m.get("input_size", 640)),
        conf=float(m.get("conf", 0.35)),
        iou=float(m.get("iou", 0.5)),
        version=str(m.get("version", Path(m["path"]).stem)),
    )

    cameras = tuple(_camera(c) for c in raw["cameras"])
    if not cameras:
        raise ConfigError("at least one camera is required")
    labels = [c.label for c in cameras]
    if len(set(labels)) != len(labels):
        raise ConfigError("camera labels must be unique")

    q = raw.get("queue", {})
    u = raw.get("upload", {})
    cfg = Config(
        centre_code=str(raw["centre_code"]).strip().upper(),
        api_url=str(raw["api_url"]),
        ingest_key=ingest_key,
        model=model,
        cameras=cameras,
        queue_path=q.get("path", "data/queue.sqlite"),
        queue_max_rows=int(q.get("max_rows", 50_000)),
        sample_interval_s=float(raw.get("sample_interval_s", 5.0)),
        window_s=int(raw.get("window_s", 60)),
        upload_batch_size=int(u.get("batch_size", 50)),
        upload_interval_s=float(u.get("interval_s", 60.0)),
        request_timeout_s=float(u.get("timeout_s", 15.0)),
        max_attempts=int(u.get("max_attempts", 8)),
    )
    if cfg.window_s < cfg.sample_interval_s:
        raise ConfigError("window_s must be at least sample_interval_s")
    if not 1 <= cfg.upload_batch_size <= 100:
        raise ConfigError("upload.batch_size must be between 1 and 100 (server limit)")
    return cfg
