"""Exercises the REAL OnnxYoloDetector plumbing (session, input name, letterbox,
decode, coordinate mapping) without needing model weights: a tiny ONNX graph
emits a fixed YOLOv8-shaped tensor, so the pipeline's answer is known exactly."""

import numpy as np
import pytest

onnx = pytest.importorskip("onnx")
from onnx import TensorProto, helper, numpy_helper  # noqa: E402

from edgeworker.counting import count_frame  # noqa: E402
from edgeworker.detector import COCO_NAMES, OnnxYoloDetector  # noqa: E402
from edgeworker.config import CameraConfig  # noqa: E402

N = 8400
PERSON, CHAIR = COCO_NAMES.index("person"), COCO_NAMES.index("chair")


def fixed_head(rows):
    out = np.zeros((1, 4 + len(COCO_NAMES), N), dtype=np.float32)
    for i, (cx, cy, w, h, cls, score) in enumerate(rows):
        out[0, :4, i] = (cx, cy, w, h)
        out[0, 4 + cls, i] = score
    return out


def build_model(path, rows):
    const = numpy_helper.from_array(fixed_head(rows), name="head")
    graph = helper.make_graph(
        [helper.make_node("Identity", ["head"], ["output0"])],
        "fixed",
        [helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 640, 640])],
        [helper.make_tensor_value_info("output0", TensorProto.FLOAT, [1, 4 + len(COCO_NAMES), N])],
        initializer=[const],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    onnx.save(model, str(path))


def test_real_detector_counts_known_people_and_maps_boxes_back(tmp_path):
    # 1280x720 frame -> ratio 0.5, vertical pad 140. Two people + one chair in letterboxed space.
    rows = [
        (320, 320, 100, 200, PERSON, 0.90),  # -> x 540..740, y 160..560
        (160, 300, 80, 160, PERSON, 0.80),
        (500, 300, 60, 60, CHAIR, 0.90),
    ]
    model = tmp_path / "fixed.onnx"
    build_model(model, rows)

    detector = OnnxYoloDetector(str(model), COCO_NAMES, wanted={"person", "chair"})
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    dets = detector.detect(frame)

    people = [d for d in dets if d.label == "person"]
    assert len(people) == 2 and len([d for d in dets if d.label == "chair"]) == 1
    best = max(people, key=lambda d: d.confidence)
    assert [round(v) for v in best.box] == [540, 160, 740, 560]


def test_real_detector_feeds_the_counting_stage(tmp_path):
    model = tmp_path / "fixed.onnx"
    build_model(model, [(320, 320, 100, 200, PERSON, 0.9), (160, 300, 80, 160, PERSON, 0.8)])
    detector = OnnxYoloDetector(str(model), COCO_NAMES, wanted={"person"})
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    camera = CameraConfig(label="c", source="x")
    assert count_frame(detector.detect(frame), camera, frame, None).people == 2


def test_wrong_label_set_fails_loudly_instead_of_miscounting(tmp_path):
    model = tmp_path / "fixed.onnx"
    build_model(model, [(320, 320, 100, 200, PERSON, 0.9)])
    detector = OnnxYoloDetector(str(model), ["person", "bench"])  # 2 names vs an 80-class model
    with pytest.raises(ValueError, match="class names"):
        detector.detect(np.zeros((720, 1280, 3), dtype=np.uint8))
