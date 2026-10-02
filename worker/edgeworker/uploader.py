from __future__ import annotations

import logging
from dataclasses import dataclass

import requests

from .outbox import ObservationQueue

log = logging.getLogger("edgeworker.upload")


class AuthError(Exception):
    """The server rejected the centre code / ingest key. Retrying cannot help."""


class RetryLater(Exception):
    """Network down or server error. Leave the queue alone and try again later."""


@dataclass
class FlushResult:
    sent: int = 0
    duplicates: int = 0
    failed: int = 0
    dropped: int = 0


class Uploader:
    def __init__(
        self,
        api_url: str,
        centre_code: str,
        ingest_key: str,
        timeout_s: float = 15.0,
        max_attempts: int = 8,
        session: requests.Session | None = None,
    ):
        self.api_url, self.centre_code = api_url, centre_code
        self.timeout_s, self.max_attempts = timeout_s, max_attempts
        self.session = session or requests.Session()
        self.session.headers.update({"x-ingest-key": ingest_key, "content-type": "application/json"})

    def _post(self, payloads: list[dict]) -> requests.Response:
        try:
            return self.session.post(
                self.api_url,
                json={"centre_code": self.centre_code, "observations": payloads},
                timeout=self.timeout_s,
            )
        except requests.RequestException as e:  # DNS, refused, timeout, reset ...
            raise RetryLater(str(e)) from e

    def flush(self, queue: ObservationQueue, batch_size: int = 50) -> FlushResult:
        """Send everything pending, oldest first, in batches. Safe to call anytime."""
        result = FlushResult()
        cursor = 0  # rows that stay queued after a failure must not be re-sent within this same call
        while True:
            batch = queue.peek(batch_size, after_id=cursor)
            if not batch:
                return result
            cursor = batch[-1][0]
            ids = [i for i, _ in batch]
            payloads = [p for _, p in batch]

            resp = self._post(payloads)

            if resp.status_code == 401:
                raise AuthError("server rejected the ingest key — rotate it in /admin/cameras and update INGEST_KEY")
            if resp.status_code == 400:
                # One malformed row poisons a whole batch. Isolate it by sending
                # rows individually so the good ones still go through.
                if len(batch) > 1:
                    for one_id, one_payload in batch:
                        self._send_single(queue, one_id, one_payload, result)
                    continue
                result.dropped += queue.bump(ids, 1)  # single row, server says invalid: drop it
                result.failed += 1
                log.error("dropping invalid observation: %s", _error_text(resp))
                continue
            if resp.status_code >= 500 or resp.status_code in (408, 429):
                raise RetryLater(f"server returned {resp.status_code}")
            if not resp.ok:
                raise RetryLater(f"unexpected status {resp.status_code}")

            self._apply(queue, ids, resp.json().get("results", []), result)

    def _send_single(self, queue: ObservationQueue, row_id: int, payload: dict, result: FlushResult) -> None:
        resp = self._post([payload])
        if resp.status_code == 401:
            raise AuthError("server rejected the ingest key")
        if resp.status_code == 400:
            result.dropped += queue.bump([row_id], 1)
            result.failed += 1
            log.error("dropping invalid observation: %s", _error_text(resp))
        elif resp.ok:
            self._apply(queue, [row_id], resp.json().get("results", []), result)
        else:
            raise RetryLater(f"server returned {resp.status_code}")

    def _apply(self, queue: ObservationQueue, ids: list[int], results: list[dict], result: FlushResult) -> None:
        done: list[int] = []
        retry: list[int] = []
        for row_id, r in zip(ids, results):
            status = r.get("status")
            if status == "stored":
                result.sent += 1
                done.append(row_id)
            elif status == "duplicate":  # server already has it (replay after a crash) — success
                result.duplicates += 1
                done.append(row_id)
            else:
                result.failed += 1
                retry.append(row_id)
                log.warning("server could not store an observation: %s", r.get("error"))
        # A short results list means the server stopped early; leave the rest queued.
        queue.ack(done)
        result.dropped += queue.bump(retry, self.max_attempts)


def _error_text(resp: requests.Response) -> str:
    try:
        return str(resp.json().get("error", resp.text))[:200]
    except ValueError:
        return resp.text[:200]
