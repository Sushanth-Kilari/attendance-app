import numpy as np

from edgeworker.detector import COCO_NAMES, decode_yolo_output, letterbox, nms

NC = len(COCO_NAMES)
PERSON, CHAIR, TV = COCO_NAMES.index("person"), COCO_NAMES.index("chair"), COCO_NAMES.index("tv")


def head(rows, channels_first=True):
    """Build a YOLOv8-style raw output from (cx, cy, w, h, class_id, score) rows."""
    arr = np.zeros((len(rows), 4 + NC), dtype=np.float32)
    for i, (cx, cy, w, h, cls, score) in enumerate(rows):
        arr[i, :4] = (cx, cy, w, h)
        arr[i, 4 + cls] = score
    return (arr.T if channels_first else arr)[None]


def decode(rows, **kw):
    args = dict(names=COCO_NAMES, conf_threshold=0.35, iou_threshold=0.5, ratio=1.0, pad=(0, 0), orig_shape=(640, 640))
    args.update(kw)
    return decode_yolo_output(head(rows), **args)


def test_nms_suppresses_overlap_keeps_distinct():
    boxes = np.array([[0, 0, 100, 100], [5, 5, 105, 105], [300, 300, 400, 400]], dtype=np.float32)
    scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)
    assert nms(boxes, scores, 0.5) == [0, 2]


def test_nms_empty():
    assert nms(np.zeros((0, 4)), np.zeros(0), 0.5) == []


def test_decode_counts_two_distinct_people_and_merges_duplicates():
    rows = [
        (100, 100, 40, 80, PERSON, 0.90),
        (102, 101, 40, 80, PERSON, 0.80),  # duplicate of the first
        (300, 200, 40, 80, PERSON, 0.70),
    ]
    dets = decode(rows)
    assert [d.label for d in dets] == ["person", "person"]
    assert dets[0].confidence > dets[1].confidence


def test_decode_drops_below_confidence_threshold():
    assert decode([(100, 100, 40, 80, PERSON, 0.20)]) == []


def test_decode_accepts_both_head_layouts():
    rows = [(100, 100, 40, 80, PERSON, 0.9)]
    a = decode_yolo_output(head(rows, True), COCO_NAMES, 0.35, 0.5, 1.0, (0, 0), (640, 640))
    b = decode_yolo_output(head(rows, False), COCO_NAMES, 0.35, 0.5, 1.0, (0, 0), (640, 640))
    assert len(a) == len(b) == 1
    assert a[0].box == b[0].box


def test_wanted_filter_drops_unrequested_classes_before_nms():
    rows = [(100, 100, 40, 80, PERSON, 0.9), (100, 100, 40, 80, CHAIR, 0.9), (300, 300, 30, 30, TV, 0.9)]
    labels = sorted(d.label for d in decode(rows, wanted={"person", "tv"}))
    assert labels == ["person", "tv"]


def test_different_classes_do_not_suppress_each_other():
    # A person sitting on a chair: same box, both must survive.
    rows = [(100, 100, 40, 80, PERSON, 0.9), (100, 100, 40, 80, CHAIR, 0.9)]
    assert sorted(d.label for d in decode(rows)) == ["chair", "person"]


def test_boxes_are_mapped_back_through_letterbox_and_clipped():
    # Original 1280x720 frame letterboxed into 640: ratio 0.5, vertical pad 140.
    # Box in letterboxed space: x 270..370, y 120..520 (tall enough to spill past both edges).
    rows = [(320, 320, 100, 400, PERSON, 0.9)]
    (d,) = decode(rows, ratio=0.5, pad=(0, 140), orig_shape=(720, 1280))
    x1, y1, x2, y2 = d.box
    assert (x1, x2) == (540.0, 740.0)  # (270-0)/0.5, (370-0)/0.5
    assert (y1, y2) == (0.0, 720.0)  # (120-140)/0.5=-40 and (520-140)/0.5=760, both clipped to the frame


def test_letterbox_preserves_aspect_and_pads():
    frame = np.full((720, 1280, 3), 200, dtype=np.uint8)
    img, ratio, (px, py) = letterbox(frame, 640)
    assert img.shape == (640, 640, 3)
    assert ratio == 0.5 and px == 0 and py == 140
    assert img[0, 0, 0] == 114  # padding colour
    assert img[320, 320, 0] == 200  # image content
