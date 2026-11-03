from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .security import require_safe_text

SCHEMA_VERSION = 2
MAX_LIMIT = 100
APPEND_ONLY_TABLES = (
    "source_captures",
    "source_revisions",
    "ledger_events",
    "entities",
    "event_entities",
    "entity_edges",
    "promotion_proposals",
    "promotion_reviews",
    "promotion_applications",
    "root_authorizations",
)

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_meta (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  version INTEGER NOT NULL,
  migrated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_captures (
  id INTEGER PRIMARY KEY,
  uri TEXT NOT NULL,
  body TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(uri, sha256)
);
CREATE TABLE IF NOT EXISTS source_revisions (
  id INTEGER PRIMARY KEY,
  source_capture_id INTEGER NOT NULL REFERENCES source_captures(id),
  supersedes_revision_id INTEGER REFERENCES source_revisions(id),
  observed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_events (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_capture_id INTEGER REFERENCES source_captures(id),
  source_revision_id INTEGER REFERENCES source_revisions(id),
  created_at TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE
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
  source_revision_id INTEGER REFERENCES source_revisions(id),
  observed_at TEXT NOT NULL,
  UNIQUE(from_entity_id, to_entity_id, relation, source_revision_id)
);
CREATE TABLE IF NOT EXISTS promotion_proposals (
  id INTEGER PRIMARY KEY,
  target TEXT NOT NULL CHECK(target IN ('hermes', 'honcho')),
  target_profile TEXT NOT NULL,
  statement TEXT NOT NULL,
  statement_hash TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_event_id INTEGER REFERENCES ledger_events(id),
  conflict_key TEXT NOT NULL,
  precondition TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promotion_reviews (
  id INTEGER PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES promotion_proposals(id),
  decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected')),
  reviewer TEXT NOT NULL,
  rationale TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  UNIQUE(proposal_id)
);
CREATE TABLE IF NOT EXISTS promotion_applications (
  id INTEGER PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES promotion_proposals(id),
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  observed_statement TEXT NOT NULL,
  observed_hash TEXT NOT NULL,
  verified INTEGER NOT NULL CHECK(verified IN (0, 1))
);
CREATE TABLE IF NOT EXISTS root_authorizations (
  id INTEGER PRIMARY KEY,
  root_uri TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('grant', 'revoke')),
  actor TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS event_search USING fts5(title, body, content='ledger_events', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS ledger_events_ai AFTER INSERT ON ledger_events BEGIN
  INSERT INTO event_search(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
"""


def now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def normalize_timestamp(value: str | None) -> str:
    if value is None:
        return now()
    candidate = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as error:
        raise ValueError("timestamp must be ISO-8601") from error
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(UTC).replace(microsecond=0).isoformat()


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _insert_id(cursor: sqlite3.Cursor, operation: str) -> int:
    if cursor.lastrowid is None:
        raise RuntimeError(f"{operation} did not yield an id")
    return int(cursor.lastrowid)


def _event_hash(
    event_id: int,
    occurred_at: str,
    kind: str,
    title: str,
    body: str,
    source_capture_id: int | None,
    source_revision_id: int | None,
    created_at: str,
    previous_hash: str,
) -> str:
    payload = json.dumps(
        {
            "id": event_id,
            "occurred_at": occurred_at,
            "kind": kind,
            "title": title,
            "body": body,
            "source_capture_id": source_capture_id,
            "source_revision_id": source_revision_id,
            "created_at": created_at,
            "previous_hash": previous_hash,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return _hash_text(payload)


def _create_private_parents(path: Path) -> None:
    missing: list[Path] = []
    cursor = path
    while not cursor.exists():
        missing.append(cursor)
        if cursor.parent == cursor:
            break
        cursor = cursor.parent
    for directory in reversed(missing):
        directory.mkdir(mode=0o700)
        os.chmod(directory, 0o700)


@dataclass(frozen=True)
class CaptureResult:
    capture_id: int
    revision_id: int
    changed: bool


class Store:
    def __init__(self, database: str | Path):
        self.path = Path(database).expanduser().resolve()
        _create_private_parents(self.path.parent)
        existed = self.path.exists()
        self.connection = sqlite3.connect(self.path, timeout=5.0)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA busy_timeout = 5000")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.execute("PRAGMA synchronous = FULL")
        if not existed:
            os.chmod(self.path, 0o600)
        elif self.path.stat().st_mode & 0o077:
            os.chmod(self.path, 0o600)

    def close(self) -> None:
        self.connection.close()

    def _table_exists(self, name: str) -> bool:
        row = self.connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (name,)
        ).fetchone()
        return row is not None

    def _column_exists(self, table: str, column: str) -> bool:
        return any(row[1] == column for row in self.connection.execute(f"PRAGMA table_info({table})"))

    def init(self) -> None:
        if self._table_exists("ledger_events") and not self._table_exists("schema_meta"):
            self._migrate_legacy()
        else:
            self.connection.executescript(SCHEMA)
            row = self.connection.execute("SELECT version FROM schema_meta WHERE singleton = 1").fetchone()
            if row is None:
                self.connection.execute(
                    "INSERT INTO schema_meta(singleton, version, migrated_at) VALUES (1, ?, ?)",
                    (SCHEMA_VERSION, now()),
                )
            elif int(row[0]) != SCHEMA_VERSION:
                raise RuntimeError(f"unsupported schema version {row[0]}; expected {SCHEMA_VERSION}")
            self._install_append_only_triggers()
            self.connection.commit()
        os.chmod(self.path, 0o600)

    def _migrate_legacy(self) -> None:
        # executescript commits an existing transaction, so the BEGIN must live inside
        # the script. All DDL and backfill work then remains one SQLite transaction.
        self.connection.executescript("BEGIN IMMEDIATE;\n" + SCHEMA)
        try:
            rebuild_edges = not self._column_exists("entity_edges", "source_revision_id")
            if not self._column_exists("ledger_events", "source_revision_id"):
                self.connection.execute(
                    "ALTER TABLE ledger_events ADD COLUMN source_revision_id INTEGER REFERENCES source_revisions(id)"
                )
            if not self._column_exists("ledger_events", "previous_hash"):
                self.connection.execute("ALTER TABLE ledger_events ADD COLUMN previous_hash TEXT")
            if not self._column_exists("ledger_events", "event_hash"):
                self.connection.execute("ALTER TABLE ledger_events ADD COLUMN event_hash TEXT")
            for column, declaration in (
                ("target_profile", "TEXT NOT NULL DEFAULT 'default'"),
                ("statement_hash", "TEXT"),
                ("conflict_key", "TEXT"),
                ("precondition", "TEXT"),
            ):
                if not self._column_exists("promotion_proposals", column):
                    self.connection.execute(
                        f"ALTER TABLE promotion_proposals ADD COLUMN {column} {declaration}"
                    )

            previous_revision: dict[str, int] = {}
            for capture in self.connection.execute(
                "SELECT * FROM source_captures ORDER BY uri, id"
            ).fetchall():
                cursor = self.connection.execute(
                    "INSERT INTO source_revisions(source_capture_id, supersedes_revision_id, observed_at) VALUES (?, ?, ?)",
                    (capture["id"], previous_revision.get(capture["uri"]), capture["captured_at"]),
                )
                revision_id = _insert_id(cursor, "source revision migration")
                previous_revision[capture["uri"]] = revision_id
                self.connection.execute(
                    "UPDATE ledger_events SET source_revision_id = ? WHERE source_capture_id = ? AND source_revision_id IS NULL",
                    (revision_id, capture["id"]),
                )

            if rebuild_edges:
                self.connection.execute("ALTER TABLE entity_edges RENAME TO entity_edges_v1")
                self.connection.execute(
                    """CREATE TABLE entity_edges (
                         id INTEGER PRIMARY KEY,
                         from_entity_id INTEGER NOT NULL REFERENCES entities(id),
                         to_entity_id INTEGER NOT NULL REFERENCES entities(id),
                         relation TEXT NOT NULL,
                         source_capture_id INTEGER REFERENCES source_captures(id),
                         source_revision_id INTEGER REFERENCES source_revisions(id),
                         observed_at TEXT NOT NULL,
                         UNIQUE(from_entity_id, to_entity_id, relation, source_revision_id)
                       )"""
                )
                self.connection.execute(
                    """INSERT INTO entity_edges(
                           id, from_entity_id, to_entity_id, relation, source_capture_id,
                           source_revision_id, observed_at
                       )
                       SELECT old.id, old.from_entity_id, old.to_entity_id, old.relation,
                              old.source_capture_id,
                              (SELECT sr.id FROM source_revisions sr
                               WHERE sr.source_capture_id = old.source_capture_id
                               ORDER BY sr.id LIMIT 1),
                              old.observed_at
                       FROM entity_edges_v1 old"""
                )
                self.connection.execute("DROP TABLE entity_edges_v1")

            previous = "0" * 64
            for event in self.connection.execute("SELECT * FROM ledger_events ORDER BY id").fetchall():
                digest = _event_hash(
                    int(event["id"]), event["occurred_at"], event["kind"], event["title"], event["body"],
                    event["source_capture_id"], event["source_revision_id"], event["created_at"], previous,
                )
                self.connection.execute(
                    "UPDATE ledger_events SET previous_hash = ?, event_hash = ? WHERE id = ?",
                    (previous, digest, event["id"]),
                )
                previous = digest
            for proposal in self.connection.execute(
                "SELECT id, statement FROM promotion_proposals"
            ).fetchall():
                digest = _hash_text(proposal["statement"])
                self.connection.execute(
                    "UPDATE promotion_proposals SET statement_hash = COALESCE(statement_hash, ?), conflict_key = COALESCE(conflict_key, ?) WHERE id = ?",
                    (digest, f"legacy:{proposal['id']}", proposal["id"]),
                )
            self.connection.execute(
                "INSERT OR REPLACE INTO schema_meta(singleton, version, migrated_at) VALUES (1, ?, ?)",
                (SCHEMA_VERSION, now()),
            )
            self._install_append_only_triggers()
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def _install_append_only_triggers(self) -> None:
        for table in APPEND_ONLY_TABLES:
            self.connection.execute(
                f"CREATE TRIGGER IF NOT EXISTS {table}_no_update BEFORE UPDATE ON {table} "
                f"BEGIN SELECT RAISE(ABORT, '{table} is append-only'); END"
            )
            self.connection.execute(
                f"CREATE TRIGGER IF NOT EXISTS {table}_no_delete BEFORE DELETE ON {table} "
                f"BEGIN SELECT RAISE(ABORT, '{table} is append-only'); END"
            )

    def entity(self, name: str, kind: str = "unknown") -> int:
        clean = name.strip().lower()
        if not clean:
            raise ValueError("entity name is required")
        require_safe_text(entity=clean, kind=kind)
        self.connection.execute(
            "INSERT OR IGNORE INTO entities(name, kind, created_at) VALUES (?, ?, ?)",
            (clean, kind.strip() or "unknown", now()),
        )
        return int(self.connection.execute("SELECT id FROM entities WHERE name = ?", (clean,)).fetchone()[0])

    def capture(self, uri: str, body: str, observed_at: str | None = None) -> CaptureResult:
        require_safe_text(uri=uri, body=body)
        digest = _hash_text(body)
        observed = normalize_timestamp(observed_at)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            latest = self.connection.execute(
                """SELECT sr.id AS revision_id, sc.id AS capture_id, sc.sha256
                   FROM source_revisions sr JOIN source_captures sc ON sc.id = sr.source_capture_id
                   WHERE sc.uri = ? ORDER BY sr.id DESC LIMIT 1""",
                (uri,),
            ).fetchone()
            if latest is not None and latest["sha256"] == digest:
                self.connection.commit()
                return CaptureResult(int(latest["capture_id"]), int(latest["revision_id"]), False)
            self.connection.execute(
                "INSERT OR IGNORE INTO source_captures(uri, body, sha256, captured_at) VALUES (?, ?, ?, ?)",
                (uri, body, digest, observed),
            )
            capture_id = int(
                self.connection.execute(
                    "SELECT id FROM source_captures WHERE uri = ? AND sha256 = ?", (uri, digest)
                ).fetchone()[0]
            )
            cursor = self.connection.execute(
                "INSERT INTO source_revisions(source_capture_id, supersedes_revision_id, observed_at) VALUES (?, ?, ?)",
                (capture_id, int(latest["revision_id"]) if latest else None, observed),
            )
            revision_id = _insert_id(cursor, "source revision insert")
            self.connection.commit()
            return CaptureResult(capture_id, revision_id, True)
        except Exception:
            self.connection.rollback()
            raise

    def event_for_revision(self, revision_id: int) -> int | None:
        row = self.connection.execute(
            "SELECT id FROM ledger_events WHERE source_revision_id = ? ORDER BY id LIMIT 1", (revision_id,)
        ).fetchone()
        return int(row[0]) if row else None

    def record(
        self,
        kind: str,
        title: str,
        body: str,
        entities: list[str],
        source_capture_id: int | None = None,
        source_revision_id: int | None = None,
        occurred_at: str | None = None,
    ) -> int:
        kind, title, body = kind.strip(), title.strip(), body.strip()
        if not kind or not title or not body:
            raise ValueError("kind, title, and body are required")
        require_safe_text(kind=kind, title=title, body=body, entities="\n".join(entities))
        occurred = normalize_timestamp(occurred_at)
        created = now()
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            previous_row = self.connection.execute(
                "SELECT id, event_hash FROM ledger_events ORDER BY id DESC LIMIT 1"
            ).fetchone()
            event_id = (int(previous_row["id"]) + 1) if previous_row else 1
            previous = previous_row["event_hash"] if previous_row else "0" * 64
            digest = _event_hash(
                event_id, occurred, kind, title, body, source_capture_id, source_revision_id, created, previous
            )
            self.connection.execute(
                """INSERT INTO ledger_events(
                       id, occurred_at, kind, title, body, source_capture_id, source_revision_id,
                       created_at, previous_hash, event_hash
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (event_id, occurred, kind, title, body, source_capture_id, source_revision_id, created, previous, digest),
            )
            for entity_name in entities:
                entity_id = self.entity(entity_name)
                self.connection.execute(
                    "INSERT OR IGNORE INTO event_entities(event_id, entity_id) VALUES (?, ?)",
                    (event_id, entity_id),
                )
            self.connection.commit()
            return event_id
        except Exception:
            self.connection.rollback()
            raise

    def edge(
        self,
        source: str,
        target: str,
        relation: str,
        capture_id: int | None,
        revision_id: int | None,
    ) -> None:
        require_safe_text(source=source, target=target, relation=relation)
        if not relation.strip():
            raise ValueError("edge relation is required")
        source_id, target_id = self.entity(source), self.entity(target)
        self.connection.execute(
            """INSERT OR IGNORE INTO entity_edges(
                   from_entity_id, to_entity_id, relation, source_capture_id, source_revision_id, observed_at
               ) VALUES (?, ?, ?, ?, ?, ?)""",
            (source_id, target_id, relation.strip(), capture_id, revision_id, now()),
        )
        self.connection.commit()

    def authorize_root(self, root: str | Path, actor: str, action: str = "grant") -> int:
        if action not in {"grant", "revoke"}:
            raise ValueError("root authorization action must be grant or revoke")
        resolved = Path(root).expanduser().resolve()
        if action == "grant" and (not resolved.exists() or not resolved.is_dir()):
            raise ValueError("authorized root must be an existing directory")
        require_safe_text(root=str(resolved), actor=actor)
        if not actor.strip():
            raise ValueError("authorization actor is required")
        cursor = self.connection.execute(
            "INSERT INTO root_authorizations(root_uri, action, actor, recorded_at) VALUES (?, ?, ?, ?)",
            (resolved.as_uri(), action, actor.strip(), now()),
        )
        self.connection.commit()
        return _insert_id(cursor, "root authorization insert")

    def root_is_authorized(self, root: str | Path) -> bool:
        uri = Path(root).expanduser().resolve().as_uri()
        row = self.connection.execute(
            "SELECT action FROM root_authorizations WHERE root_uri = ? ORDER BY id DESC LIMIT 1", (uri,)
        ).fetchone()
        return row is not None and row["action"] == "grant"

    def propose(
        self,
        target: str,
        target_profile: str,
        statement: str,
        rationale: str,
        event_id: int | None,
        conflict_key: str,
        precondition: str | None = None,
    ) -> int:
        if target not in {"hermes", "honcho"}:
            raise ValueError("target must be hermes or honcho")
        values = {
            "target_profile": target_profile.strip(),
            "statement": statement.strip(),
            "rationale": rationale.strip(),
            "conflict_key": conflict_key.strip(),
            "precondition": precondition.strip() if precondition else None,
        }
        if not all(values[key] for key in ("target_profile", "statement", "rationale", "conflict_key")):
            raise ValueError("target profile, statement, rationale, and conflict key are required")
        require_safe_text(**values)
        active = self.connection.execute(
            """SELECT pp.id, pp.statement_hash FROM promotion_proposals pp
               WHERE pp.target = ? AND pp.target_profile = ? AND pp.conflict_key = ?
                 AND NOT EXISTS (SELECT 1 FROM promotion_reviews pr WHERE pr.proposal_id = pp.id)
               ORDER BY pp.id DESC LIMIT 1""",
            (target, values["target_profile"], values["conflict_key"]),
        ).fetchone()
        digest = _hash_text(values["statement"] or "")
        if active is not None:
            if active["statement_hash"] == digest:
                return int(active["id"])
            raise ValueError(f"unreviewed conflicting proposal exists: {active['id']}")
        cursor = self.connection.execute(
            """INSERT INTO promotion_proposals(
                   target, target_profile, statement, statement_hash, rationale, evidence_event_id,
                   conflict_key, precondition, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                target, values["target_profile"], values["statement"], digest, values["rationale"],
                event_id, values["conflict_key"], values["precondition"], now(),
            ),
        )
        self.connection.commit()
        return _insert_id(cursor, "promotion proposal insert")

    def review_proposal(self, proposal_id: int, decision: str, reviewer: str, rationale: str) -> int:
        if decision not in {"approved", "rejected"}:
            raise ValueError("decision must be approved or rejected")
        require_safe_text(reviewer=reviewer, rationale=rationale)
        if not reviewer.strip() or not rationale.strip():
            raise ValueError("reviewer and rationale are required")
        proposal = self.connection.execute("SELECT id FROM promotion_proposals WHERE id = ?", (proposal_id,)).fetchone()
        if proposal is None:
            raise ValueError("proposal does not exist")
        if self.connection.execute("SELECT 1 FROM promotion_reviews WHERE proposal_id = ?", (proposal_id,)).fetchone():
            raise ValueError("proposal already has a review decision")
        cursor = self.connection.execute(
            "INSERT INTO promotion_reviews(proposal_id, decision, reviewer, rationale, reviewed_at) VALUES (?, ?, ?, ?, ?)",
            (proposal_id, decision, reviewer.strip(), rationale.strip(), now()),
        )
        self.connection.commit()
        return _insert_id(cursor, "promotion review insert")

    def record_application(self, proposal_id: int, applied_by: str, observed_statement: str) -> dict[str, Any]:
        require_safe_text(applied_by=applied_by, observed_statement=observed_statement)
        if not applied_by.strip() or not observed_statement.strip():
            raise ValueError("applied_by and observed statement are required")
        row = self.connection.execute(
            """SELECT pp.statement, pp.statement_hash, pr.decision
               FROM promotion_proposals pp JOIN promotion_reviews pr ON pr.proposal_id = pp.id
               WHERE pp.id = ? ORDER BY pr.id DESC LIMIT 1""",
            (proposal_id,),
        ).fetchone()
        if row is None or row["decision"] != "approved":
            raise ValueError("proposal must be approved before application evidence is recorded")
        observed_hash = _hash_text(observed_statement.strip())
        verified = observed_hash == row["statement_hash"]
        cursor = self.connection.execute(
            """INSERT INTO promotion_applications(
                   proposal_id, applied_by, applied_at, observed_statement, observed_hash, verified
               ) VALUES (?, ?, ?, ?, ?, ?)""",
            (proposal_id, applied_by.strip(), now(), observed_statement.strip(), observed_hash, int(verified)),
        )
        self.connection.commit()
        return {
            "application_id": _insert_id(cursor, "promotion application insert"),
            "verified": verified,
        }

    @staticmethod
    def _fts_query(query: str) -> str:
        re_module = __import__("re")
        operators = {"and", "or", "not", "near"}
        tokens = [
            token
            for token in re_module.findall(r"[\w.-]+", query, flags=re_module.UNICODE)
            if token and token.lower() not in operators
        ]
        if not tokens:
            raise ValueError("query must contain searchable words")
        return " AND ".join('"' + token.replace('"', '""') + '"' for token in tokens)

    def search(
        self,
        query: str,
        entity: str | None = None,
        limit: int = 8,
        after: str | None = None,
        before: str | None = None,
    ) -> list[sqlite3.Row]:
        require_safe_text(query=query, entity=entity)
        if not 1 <= limit <= MAX_LIMIT:
            raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")
        normalized_after = normalize_timestamp(after) if after else None
        normalized_before = normalize_timestamp(before) if before else None
        if normalized_after and normalized_before and normalized_after > normalized_before:
            raise ValueError("after must not be later than before")
        where = "event_search MATCH ?"
        params: list[object] = [self._fts_query(query)]
        if entity:
            where += " AND EXISTS (SELECT 1 FROM event_entities ee JOIN entities en ON en.id = ee.entity_id WHERE ee.event_id = le.id AND en.name = ?)"
            params.append(entity.strip().lower())
        if normalized_after:
            where += " AND le.occurred_at >= ?"
            params.append(normalized_after)
        if normalized_before:
            where += " AND le.occurred_at <= ?"
            params.append(normalized_before)
        params.append(limit)
        try:
            return self.connection.execute(
                f"""SELECT le.id, le.occurred_at, le.kind, le.title,
                           snippet(event_search, 1, '[', ']', ' … ', 32) AS excerpt,
                           sc.uri, sc.sha256, sc.captured_at, le.source_revision_id,
                           sr.observed_at AS source_observed_at,
                           bm25(event_search) AS rank
                    FROM event_search JOIN ledger_events le ON le.id = event_search.rowid
                    LEFT JOIN source_captures sc ON sc.id = le.source_capture_id
                    LEFT JOIN source_revisions sr ON sr.id = le.source_revision_id
                    WHERE {where}
                    ORDER BY rank, le.occurred_at DESC LIMIT ?""",
                params,
            ).fetchall()
        except sqlite3.OperationalError as error:
            raise ValueError("query could not be parsed safely") from error

    def proposal(self, proposal_id: int) -> dict[str, Any]:
        row = self.connection.execute(
            """SELECT pp.*,
                      (SELECT decision FROM promotion_reviews WHERE proposal_id = pp.id ORDER BY id DESC LIMIT 1) AS status
               FROM promotion_proposals pp WHERE pp.id = ?""",
            (proposal_id,),
        ).fetchone()
        if row is None:
            raise ValueError("proposal does not exist")
        return dict(row)

    def counts(self) -> dict[str, int]:
        tables = (
            "source_captures", "source_revisions", "ledger_events", "entities", "entity_edges",
            "promotion_proposals", "promotion_reviews", "promotion_applications", "root_authorizations",
        )
        return {table: int(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]) for table in tables}

    def verify(self) -> dict[str, Any]:
        problems: list[str] = []
        quick = self.connection.execute("PRAGMA quick_check").fetchone()[0]
        if quick != "ok":
            problems.append(f"sqlite quick_check: {quick}")
        foreign = self.connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign:
            problems.append(f"foreign key violations: {len(foreign)}")
        version_row = self.connection.execute("SELECT version FROM schema_meta WHERE singleton = 1").fetchone()
        version = int(version_row[0]) if version_row else 0
        if version != SCHEMA_VERSION:
            problems.append(f"schema version is {version}, expected {SCHEMA_VERSION}")
        for capture in self.connection.execute("SELECT id, body, sha256 FROM source_captures ORDER BY id"):
            if _hash_text(capture["body"]) != capture["sha256"]:
                problems.append(f"source capture hash mismatch: {capture['id']}")
        previous = "0" * 64
        for event in self.connection.execute("SELECT * FROM ledger_events ORDER BY id"):
            expected = _event_hash(
                int(event["id"]), event["occurred_at"], event["kind"], event["title"], event["body"],
                event["source_capture_id"], event["source_revision_id"], event["created_at"], previous,
            )
            if event["previous_hash"] != previous or event["event_hash"] != expected:
                problems.append(f"ledger chain mismatch: {event['id']}")
            previous = event["event_hash"]
        ledger_count = int(self.connection.execute("SELECT COUNT(*) FROM ledger_events").fetchone()[0])
        fts_count = int(self.connection.execute("SELECT COUNT(*) FROM event_search").fetchone()[0])
        if ledger_count != fts_count:
            problems.append(f"FTS row count {fts_count} differs from ledger count {ledger_count}")
        try:
            self.connection.execute(
                "INSERT INTO event_search(event_search, rank) VALUES('integrity-check', 1)"
            )
            self.connection.commit()
        except sqlite3.DatabaseError:
            self.connection.rollback()
            problems.append("FTS content integrity check failed")
        return {
            "ok": not problems,
            "schema_version": version,
            "quick_check": quick,
            "problems": problems,
            "counts": self.counts(),
        }

    def rebuild_search_index(self) -> dict[str, Any]:
        verification = self.verify()
        non_fts = [problem for problem in verification["problems"] if not problem.startswith("FTS")]
        if non_fts:
            raise RuntimeError("refusing to rebuild FTS while canonical evidence fails verification")
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self.connection.execute("INSERT INTO event_search(event_search) VALUES('rebuild')")
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise
        result = self.verify()
        if not result["ok"]:
            raise RuntimeError("FTS rebuild completed but verification still fails")
        return result

    def backup(self, destination: str | Path) -> dict[str, Any]:
        source_verification = self.verify()
        if not source_verification["ok"]:
            raise RuntimeError("refusing to back up a database that fails verification")
        target = Path(destination).expanduser().resolve()
        _create_private_parents(target.parent)
        if target.exists():
            raise ValueError("backup destination already exists")
        fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
        os.close(fd)
        temporary = Path(temporary_name)
        try:
            backup_connection = sqlite3.connect(temporary)
            try:
                self.connection.backup(backup_connection)
                if backup_connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise RuntimeError("backup integrity check failed")
            finally:
                backup_connection.close()
            os.chmod(temporary, 0o600)
            candidate = Store(temporary)
            try:
                candidate.init()
                candidate_verification = candidate.verify()
            finally:
                candidate.close()
            if not candidate_verification["ok"]:
                raise RuntimeError("backup failed Memoria verification")
            os.replace(temporary, target)
            directory_fd = os.open(target.parent, os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            temporary.unlink(missing_ok=True)
        return {"backup": str(target), "sha256": _hash_file(target)}

    @classmethod
    def restore(cls, backup: str | Path, database: str | Path, force: bool = False) -> dict[str, Any]:
        source = Path(backup).expanduser().resolve()
        target = Path(database).expanduser().resolve()
        if not source.is_file():
            raise ValueError("backup file does not exist")
        check = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
        try:
            if check.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("backup failed SQLite integrity check")
        finally:
            check.close()
        _create_private_parents(target.parent)
        if target.exists() and not force:
            raise ValueError("database exists; pass --force to preserve and replace it")
        fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
        os.close(fd)
        temporary = Path(temporary_name)
        preserved: str | None = None
        try:
            shutil.copyfile(source, temporary)
            os.chmod(temporary, 0o600)
            candidate = cls(temporary)
            try:
                candidate.init()
                verification = candidate.verify()
            finally:
                candidate.close()
            if not verification["ok"]:
                raise RuntimeError("backup failed Memoria verification; destination was not changed")
            if target.exists():
                stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
                prior = target.with_name(f"{target.name}.pre-restore-{stamp}.sqlite3")
                counter = 1
                while prior.exists():
                    prior = target.with_name(
                        f"{target.name}.pre-restore-{stamp}-{counter}.sqlite3"
                    )
                    counter += 1
                source_connection = sqlite3.connect(target)
                prior_connection = sqlite3.connect(prior)
                try:
                    source_connection.backup(prior_connection)
                finally:
                    prior_connection.close()
                    source_connection.close()
                os.chmod(prior, 0o600)
                preserved = str(prior)
                for suffix in ("-wal", "-shm"):
                    sidecar = Path(str(target) + suffix)
                    if sidecar.exists():
                        os.replace(sidecar, prior.with_name(prior.name + suffix))
            os.replace(temporary, target)
            directory_fd = os.open(target.parent, os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            temporary.unlink(missing_ok=True)
        return {"database": str(target), "preserved_previous": preserved, "verification": verification}
