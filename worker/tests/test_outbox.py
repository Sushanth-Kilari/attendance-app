from edgeworker.outbox import ObservationQueue


def q(tmp_path, max_rows=50_000):
    return ObservationQueue(str(tmp_path / "q.sqlite"), max_rows)


def test_fifo_and_ack(tmp_path):
    queue = q(tmp_path)
    for i in range(3):
        queue.enqueue({"n": i})
    batch = queue.peek(2)
    assert [p["n"] for _, p in batch] == [0, 1]
    queue.ack([i for i, _ in batch])
    assert [p["n"] for _, p in queue.peek(10)] == [2]


def test_survives_reopen(tmp_path):
    q(tmp_path).enqueue({"n": 1})
    assert q(tmp_path).size() == 1  # a power cut loses nothing already queued


def test_oldest_rows_dropped_when_over_capacity(tmp_path):
    queue = q(tmp_path, max_rows=3)
    for i in range(5):
        queue.enqueue({"n": i})
    assert [p["n"] for _, p in queue.peek(10)] == [2, 3, 4]


def test_bump_drops_a_row_at_the_attempt_limit_without_touching_others(tmp_path):
    queue = q(tmp_path)
    queue.enqueue({"n": "bad"})
    queue.enqueue({"n": "good"})
    (bad_id, _), _ = queue.peek(2)
    assert queue.bump([bad_id], max_attempts=2) == 0
    assert queue.bump([bad_id], max_attempts=2) == 1
    assert [p["n"] for _, p in queue.peek(10)] == ["good"]
