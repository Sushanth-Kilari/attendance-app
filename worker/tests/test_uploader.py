import pytest
import requests

from edgeworker.outbox import ObservationQueue
from edgeworker.uploader import AuthError, RetryLater, Uploader


class Resp:
    def __init__(self, status, body=None):
        self.status_code, self._body, self.text = status, body or {}, str(body)

    @property
    def ok(self):
        return 200 <= self.status_code < 300

    def json(self):
        return self._body


class FakeSession:
    """Scripted server: `handler(observations) -> Resp | Exception`."""

    def __init__(self, handler):
        self.handler, self.headers, self.requests = handler, {}, []

    def post(self, url, json, timeout):
        self.requests.append(json["observations"])
        out = self.handler(json["observations"])
        if isinstance(out, Exception):
            raise out
        return out


def setup(tmp_path, handler, n=3):
    queue = ObservationQueue(str(tmp_path / "q.sqlite"))
    for i in range(n):
        queue.enqueue({"n": i})
    session = FakeSession(handler)
    return queue, Uploader("http://x", "TC-1", "key", session=session, max_attempts=3), session


def ok(obs):
    return Resp(200, {"results": [{"status": "stored"} for _ in obs]})


def test_sends_batches_and_empties_the_queue(tmp_path):
    queue, up, session = setup(tmp_path, ok, n=5)
    r = up.flush(queue, batch_size=2)
    assert (r.sent, queue.size()) == (5, 0)
    assert [len(b) for b in session.requests] == [2, 2, 1]


def test_header_carries_the_key_but_body_does_not(tmp_path):
    queue, up, session = setup(tmp_path, ok)
    up.flush(queue)
    assert session.headers["x-ingest-key"] == "key"
    assert "key" not in str(session.requests)


def test_duplicate_counts_as_success_so_replays_drain(tmp_path):
    queue, up, _ = setup(tmp_path, lambda obs: Resp(200, {"results": [{"status": "duplicate"}] * len(obs)}))
    r = up.flush(queue)
    assert (r.duplicates, queue.size()) == (3, 0)


def test_network_failure_keeps_everything_queued(tmp_path):
    queue, up, _ = setup(tmp_path, lambda obs: requests.ConnectionError("no route"))
    with pytest.raises(RetryLater):
        up.flush(queue)
    assert queue.size() == 3


@pytest.mark.parametrize("status", [500, 502, 503, 429, 408])
def test_server_trouble_keeps_everything_queued(tmp_path, status):
    queue, up, _ = setup(tmp_path, lambda obs: Resp(status))
    with pytest.raises(RetryLater):
        up.flush(queue)
    assert queue.size() == 3


def test_bad_key_raises_and_keeps_data(tmp_path):
    queue, up, _ = setup(tmp_path, lambda obs: Resp(401, {"error": "Invalid centre or ingest key."}))
    with pytest.raises(AuthError):
        up.flush(queue)
    assert queue.size() == 3  # nothing lost; resume after the key is fixed


def test_one_malformed_row_cannot_block_the_good_ones(tmp_path):
    def handler(obs):
        if len(obs) > 1 or obs[0]["n"] == 1:
            return Resp(400, {"error": "observations[1].person_count must be a whole number"})
        return Resp(200, {"results": [{"status": "stored"}]})

    queue, up, _ = setup(tmp_path, handler)
    r = up.flush(queue)
    assert (r.sent, r.failed, r.dropped, queue.size()) == (2, 1, 1, 0)


def test_per_row_server_error_is_retried_then_dropped_at_the_limit(tmp_path):
    queue, up, _ = setup(tmp_path, lambda obs: Resp(200, {"results": [{"status": "error", "error": "boom"}] * len(obs)}), n=1)
    for _ in range(2):
        up.flush(queue)
        assert queue.size() == 1
    up.flush(queue)  # third failure hits max_attempts=3
    assert queue.size() == 0
