from __future__ import annotations

import hashlib
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS source_captures (
  id INTEGER PRIMARY KEY,
  uri TEXT NOT NULL,
  body TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(uri, sha256)
);
CREATE TABLE IF NOT EXISTS ledger_events (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_capture_id INTEGER REFERENCES source_captures(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_entities (
  event_id INTEGER NOT NULL REFERENCES ledger_events(id),
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  PRIMARY KEY(event_id, entity_id)
);
CREATE TABLE IF NOT EXISTS entity_edges (
  id INTEGER PRIMARY KEY,
  from_entity_id INTEGER NOT NULL REFERENCES entities(id),
  to_entity_id INTEGER NOT NULL REFERENCES entities(id),
  relation TEXT NOT NULL,
  source_capture_id INTEGER REFERENCES source_captures(id),
  observed_at TEXT NOT NULL,
  UNIQUE(from_entity_id, to_entity_id, relation, source_capture_id)
);
CREATE TABLE IF NOT EXISTS promotion_proposals (
  id INTEGER PRIMARY KEY,
  target TEXT NOT NULL CHECK(target IN ('hermes', 'honcho')),
  statement TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_event_id INTEGER REFERENCES ledger_events(id),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'approved', 'rejected')),
  created_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS event_search USING fts5(title, body, content='ledger_events', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS ledger_events_ai AFTER INSERT ON ledger_events BEGIN
  INSERT INTO event_search(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
"""


def now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class Store:
    def __init__(self, database: str | Path):
        self.path = Path(database)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")

    def close(self) -> None:
        self.connection.close()

    def init(self) -> None:
        self.connection.executescript(SCHEMA)
        self.connection.commit()

    def entity(self, name: str, kind: str = "unknown") -> int:
        clean = name.strip().lower()
        if not clean:
            raise ValueError("entity name is required")
        self.connection.execute(
            "INSERT OR IGNORE INTO entities(name, kind, created_at) VALUES (?, ?, ?)",
            (clean, kind, now()),
        )
        return int(self.connection.execute("SELECT id FROM entities WHERE name = ?", (clean,)).fetchone()[0])

    def capture(self, uri: str, body: str) -> int:
        digest = hashlib.sha256(body.encode()).hexdigest()
        self.connection.execute(
            "INSERT OR IGNORE INTO source_captures(uri, body, sha256, captured_at) VALUES (?, ?, ?, ?)",
            (uri, body, digest, now()),
        )
        return int(self.connection.execute(
            "SELECT id FROM source_captures WHERE uri = ? AND sha256 = ?", (uri, digest)
        ).fetchone()[0])

    def record(self, kind: str, title: str, body: str, entities: list[str], source_capture_id: int | None = None) -> int:
        if not kind.strip() or not title.strip() or not body.strip():
            raise ValueError("kind, title, and body are required")
        timestamp = now()
        cursor = self.connection.execute(
            "INSERT INTO ledger_events(occurred_at, kind, title, body, source_capture_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (timestamp, kind.strip(), title.strip(), body.strip(), source_capture_id, timestamp),
        )
        if cursor.lastrowid is None:
            raise RuntimeError("ledger event insert did not yield an id")
        event_id = int(cursor.lastrowid)
        for entity_name in entities:
            entity_id = self.entity(entity_name)
            self.connection.execute("INSERT OR IGNORE INTO event_entities(event_id, entity_id) VALUES (?, ?)", (event_id, entity_id))
        self.connection.commit()
        return event_id

    def edge(self, source: str, target: str, relation: str, capture_id: int | None) -> None:
        source_id, target_id = self.entity(source), self.entity(target)
        self.connection.execute(
            "INSERT OR IGNORE INTO entity_edges(from_entity_id, to_entity_id, relation, source_capture_id, observed_at) VALUES (?, ?, ?, ?, ?)",
            (source_id, target_id, relation, capture_id, now()),
        )
        self.connection.commit()

    def propose(self, target: str, statement: str, rationale: str, event_id: int | None) -> int:
        if target not in {"hermes", "honcho"}:
            raise ValueError("target must be hermes or honcho")
        cursor = self.connection.execute(
            "INSERT INTO promotion_proposals(target, statement, rationale, evidence_event_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (target, statement, rationale, event_id, now()),
        )
        self.connection.commit()
        if cursor.lastrowid is None:
            raise RuntimeError("promotion proposal insert did not yield an id")
        return int(cursor.lastrowid)

    def search(self, query: str, entity: str | None = None, limit: int = 8) -> list[sqlite3.Row]:
        if not query.strip():
            raise ValueError("query is required")
        where = "event_search MATCH ?"
        params: list[object] = [query]
        if entity:
            where += " AND EXISTS (SELECT 1 FROM event_entities ee JOIN entities en ON en.id = ee.entity_id WHERE ee.event_id = le.id AND en.name = ?)"
            params.append(entity.strip().lower())
        params.append(limit)
        return self.connection.execute(
            f"""SELECT le.id, le.occurred_at, le.kind, le.title, le.body, sc.uri, sc.sha256, sc.captured_at,
                       bm25(event_search) AS rank
                FROM event_search JOIN ledger_events le ON le.id = event_search.rowid
                LEFT JOIN source_captures sc ON sc.id = le.source_capture_id
                WHERE {where}
                ORDER BY rank, le.occurred_at DESC LIMIT ?""",
            params,
        ).fetchall()

    def counts(self) -> dict[str, int]:
        tables = ("source_captures", "ledger_events", "entities", "entity_edges", "promotion_proposals")
        return {table: int(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]) for table in tables}
