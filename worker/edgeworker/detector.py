from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

COCO_NAMES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
    "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
    "scissors", "teddy bear", "hair drier", "toothbrush",
]


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 in ORIGINAL frame pixels


class Detector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...


def load_names(spec: str) -> list[str]:
    if spec == "coco":
        return COCO_NAMES
    names = [ln.strip() for ln in Path(spec).read_text(encoding="utf-8").splitlines() if ln.strip()]
    if not names:
        raise ValueError(f"no class names found in {spec}")
    return names


def letterbox(frame: np.ndarray, size: int) -> tuple[np.ndarray, float, tuple[float, float]]:
    """Resize keeping aspect ratio, pad to a square. Returns (image, ratio, (pad_x, pad_y))."""
    import cv2

    h, w = frame.shape[:2]
    r = min(size / h, size / w)
    new_w, new_h = round(w * r), round(h * r)
    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    pad_x, pad_y = (size - new_w) / 2, (size - new_h) / 2
    top, left = int(round(pad_y - 0.1)), int(round(pad_x - 0.1))
    canvas[top : top + new_h, left : left + new_w] = resized
    return canvas, r, (pad_x, pad_y)


def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
    """Plain greedy NMS on xyxy boxes. Returns kept indices, best score first."""
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        union = areas[i] + areas[rest] - inter
        iou = np.where(union > 0, inter / union, 0)
        order = rest[iou <= iou_threshold]
    return keep


def decode_yolo_output(
    output: np.ndarray,
    names: list[str],
    conf_threshold: float,
    iou_threshold: float,
    ratio: float,
    pad: tuple[float, float],
    orig_shape: tuple[int, int],
    wanted: set[str] | None = None,
) -> list[Detection]:
    """Decode a YOLOv8-style ONNX head: (1, 4+nc, N) or (1, N, 4+nc), rows [cx, cy, w, h, scores...].

    `wanted` drops every other class BEFORE NMS: the worker only ever needs
    people and the configured equipment, and filtering early is both faster and
    stops irrelevant classes from suppressing relevant ones.
    """
    pred = np.asarray(output)[0]
    channels = 4 + len(names)
    if pred.shape[0] == channels and pred.shape[1] != channels:  # (4+nc, N) -> (N, 4+nc)
        pred = pred.T
    elif pred.shape[1] != channels:
        raise ValueError(f"model output {pred.shape} does not match {len(names)} class names (expected {channels} channels)")

    scores_all = pred[:, 4:]
    class_ids = scores_all.argmax(axis=1)
    confs = scores_all.max(axis=1)

    mask = confs >= conf_threshold
    if wanted is not None:
        wanted_ids = np.array([i for i, n in enumerate(names) if n in wanted], dtype=int)
        mask &= np.isin(class_ids, wanted_ids)
    if not mask.any():
        return []

    pred, class_ids, confs = pred[mask], class_ids[mask], confs[mask]
    cx, cy, w, h = pred[:, 0], pred[:, 1], pred[:, 2], pred[:, 3]
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)

    # Undo letterbox, then clip to the original frame.
    boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad[0]) / ratio
    boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad[1]) / ratio
    oh, ow = orig_shape
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, ow)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, oh)

    # Class-aware NMS: offset each class so different classes never suppress each other.
    offset = class_ids[:, None].astype(np.float32) * 10_000
    keep = nms(boxes + offset, confs, iou_threshold)

    return [
        Detection(label=names[int(class_ids[i])], confidence=float(confs[i]), box=tuple(float(v) for v in boxes[i]))
        for i in keep
    ]


class OnnxYoloDetector:
    """YOLOv8-format ONNX model on CPU — what a rural centre's mini-PC can run."""

    def __init__(
        self,
        model_path: str,
        names: list[str],
        input_size: int = 640,
        conf: float = 0.35,
        iou: float = 0.5,
        wanted: set[str] | None = None,
        threads: int = 2,
    ):
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads  # leave CPU for the OS and the uploader
        self.session = ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.names, self.size, self.conf, self.iou, self.wanted = names, input_size, conf, iou, wanted

    def detect(self, frame: np.ndarray) -> list[Detection]:
        img, ratio, pad = letterbox(frame, self.size)
        blob = img[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255.0  # BGR->RGB, NCHW
        out = self.session.run(None, {self.input_name: np.ascontiguousarray(blob)})[0]
        return decode_yolo_output(out, self.names, self.conf, self.iou, ratio, pad, frame.shape[:2], self.wanted)
