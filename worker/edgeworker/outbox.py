from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class ObservationQueue:
    """Durable outbox (SQLite). Observations are tiny JSON counts, so days of
    offline operation fit in kilobytes; a power cut or a dead link loses nothing.

    A connection is opened per call: the sampler threads and the uploader thread
    share the file, and SQLite's own locking (with a busy timeout) is enough at
    one write a minute per camera.
    """

    def __init__(self, path: str, max_rows: int = 50_000):
        self.path = path
        self.max_rows = max_rows
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute(
                """create table if not exists pending (
                     id integer primary key autoincrement,
                     payload text not null,
                     attempts integer not null default 0,
                     created_at text not null default (datetime('now'))
                   )"""
            )

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=30)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def enqueue(self, payload: dict) -> None:
        with self._conn() as c:
            c.execute("insert into pending (payload) values (?)", (json.dumps(payload, separators=(",", ":")),))
            # Bounded storage on a tiny disk: if the link has been dead for weeks,
            # drop the OLDEST rows rather than fill the disk and crash the worker.
            c.execute(
                "delete from pending where id in (select id from pending order by id desc limit -1 offset ?)",
                (self.max_rows,),
            )

    def peek(self, n: int, after_id: int = 0) -> list[tuple[int, dict]]:
        with self._conn() as c:
            rows = c.execute(
                "select id, payload from pending where id > ? order by id limit ?", (after_id, n)
            ).fetchall()
        return [(i, json.loads(p)) for i, p in rows]

    def ack(self, ids: list[int]) -> None:
        if not ids:
            return
        with self._conn() as c:
            c.executemany("delete from pending where id = ?", [(i,) for i in ids])

    def bump(self, ids: list[int], max_attempts: int) -> int:
        """Record a failed attempt. Rows that hit the limit are dropped so one
        permanently-bad row can never block everything queued behind it.
        Returns how many were dropped."""
        if not ids:
            return 0
        with self._conn() as c:
            c.executemany("update pending set attempts = attempts + 1 where id = ?", [(i,) for i in ids])
            dropped = c.executemany("delete from pending where id = ? and attempts >= ?", [(i, max_attempts) for i in ids])
            return dropped.rowcount if dropped.rowcount is not None else 0

    def size(self) -> int:
        with self._conn() as c:
            return c.execute("select count(*) from pending").fetchone()[0]
