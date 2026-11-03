import contextlib
import hashlib
import io
import json
import os
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from memoria.cli import main
from memoria.ingest import ingest_obsidian
from memoria.packet import evidence_packet, serialize_packet
from memoria.security import redact_text
from memoria.store import SCHEMA_VERSION, Store


class MemoriaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "state" / "memoria.db")
        self.store.init()

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def authorize(self, vault: Path) -> None:
        vault.mkdir(parents=True, exist_ok=True)
        self.store.authorize_root(vault, "test")

    def test_event_search_packet_is_cited_and_strictly_serialized(self):
        event_id = self.store.record(
            "decision", "Local first", "Evidence remains on the local machine. " * 20, ["memoria"]
        )
        packet = evidence_packet(self.store, "architecture review", "local evidence", "memoria", 500)
        encoded = serialize_packet(packet)
        self.assertLessEqual(len(encoded), 500)
        self.assertEqual(packet["used_chars"], len(encoded))
        self.assertEqual(packet["evidence"][0]["citation"]["event_id"], event_id)
        self.assertTrue(packet["read_only"])

    def test_packet_counts_metadata_and_rejects_impossible_budget(self):
        with self.assertRaises(ValueError):
            evidence_packet(self.store, "x" * 1000, "evidence", None, 400)
        with self.assertRaises(ValueError):
            evidence_packet(self.store, "task", "evidence", None, 399)

    def test_packet_accounting_is_exact_across_budget_digit_boundaries(self):
        self.store.record("decision", "Budget", "bounded evidence " * 100, [])
        for budget in (400, 499, 500, 999, 1000, 2400):
            packet = evidence_packet(self.store, "budget test", "bounded evidence", None, budget)
            encoded = serialize_packet(packet)
            self.assertLessEqual(len(encoded), budget)
            self.assertEqual(packet["used_chars"], len(encoded))

    def test_search_filters_dates_limits_and_literalizes_fts_syntax(self):
        early = self.store.record(
            "incident", "Parser death", "Malformed parser evidence survived.", [],
            occurred_at="2026-01-01T00:00:00+00:00",
        )
        self.store.record(
            "incident", "Parser recovery", "Malformed parser evidence returned.", [],
            occurred_at="2026-02-01T00:00:00+00:00",
        )
        results = self.store.search('malformed parser " OR *', limit=5, before="2026-01-15T00:00:00Z")
        self.assertEqual([row["id"] for row in results], [early])
        with self.assertRaises(ValueError):
            self.store.search("parser", limit=0)
        with self.assertRaises(ValueError):
            self.store.search("parser", limit=-1)
        with self.assertRaises(ValueError):
            self.store.search("***", limit=1)
        with self.assertRaises(ValueError):
            self.store.search(
                "parser", after="2026-03-01T00:00:00Z", before="2026-01-01T00:00:00Z"
            )

    def test_snippet_is_match_centered_not_body_prefix(self):
        body = "preface " * 100 + "needle lives here" + " ending" * 100
        self.store.record("observation", "Long body", body, [])
        excerpt = self.store.search("needle", limit=1)[0]["excerpt"]
        self.assertIn("[needle]", excerpt)
        self.assertLess(len(excerpt), len(body))

    def test_obsidian_requires_authorization_and_is_idempotent(self):
        vault = self.root / "vault"
        vault.mkdir()
        note = vault / "memoria.md"
        note.write_text("Memoria complements [[Hermes]] and [[Honcho|context]].")
        with self.assertRaises(ValueError):
            ingest_obsidian(self.store, vault, "memoria.md")
        self.store.authorize_root(vault, "test")
        first = ingest_obsidian(self.store, vault, "memoria.md")
        second = ingest_obsidian(self.store, vault, "memoria.md")
        self.assertTrue(first["changed"])
        self.assertFalse(second["changed"])
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertEqual(self.store.counts()["ledger_events"], 1)
        self.assertEqual(first["wikilinks"], ["obsidian:Hermes", "obsidian:Honcho"])

    def test_obsidian_same_stem_different_paths_remains_distinct(self):
        vault = self.root / "vault"
        self.authorize(vault)
        (vault / "one").mkdir()
        (vault / "two").mkdir()
        (vault / "one" / "status.md").write_text("alpha evidence")
        (vault / "two" / "status.md").write_text("beta evidence")
        one = ingest_obsidian(self.store, vault, "one/status.md")
        two = ingest_obsidian(self.store, vault, "two/status.md")
        self.assertNotEqual(one["note"], two["note"])
        self.assertEqual({one["note"], two["note"]}, {"obsidian:one/status", "obsidian:two/status"})

    def test_changed_and_reverted_note_creates_revision_chain(self):
        vault = self.root / "vault"
        self.authorize(vault)
        note = vault / "memory.md"
        note.write_text("first evidence [[Hermes]]")
        first = ingest_obsidian(self.store, vault, "memory.md")
        note.write_text("second evidence [[Hermes]]")
        second = ingest_obsidian(self.store, vault, "memory.md")
        note.write_text("first evidence [[Hermes]]")
        third = ingest_obsidian(self.store, vault, "memory.md")
        self.assertEqual(self.store.counts()["source_captures"], 2)
        self.assertEqual(self.store.counts()["source_revisions"], 3)
        self.assertEqual(self.store.counts()["ledger_events"], 3)
        self.assertEqual(self.store.counts()["entity_edges"], 3)
        self.assertNotEqual(first["revision_id"], second["revision_id"])
        self.assertNotEqual(first["revision_id"], third["revision_id"])

    def test_obsidian_rejects_escape_and_revoked_root(self):
        vault = self.root / "vault"
        self.authorize(vault)
        outside = self.root / "outside.md"
        outside.write_text("outside evidence")
        with self.assertRaises(ValueError):
            ingest_obsidian(self.store, vault, "../outside.md")
        self.store.authorize_root(vault, "test", "revoke")
        (vault / "inside.md").write_text("inside evidence")
        with self.assertRaises(ValueError):
            ingest_obsidian(self.store, vault, "inside.md")

    def test_secret_like_content_is_refused_on_all_write_paths(self):
        with self.assertRaises(ValueError):
            self.store.record("note", "unsafe", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz", [])
        with self.assertRaises(ValueError):
            self.store.record("note", "unsafe", "the password=hunter2 was exposed", [])
        with self.assertRaises(ValueError):
            self.store.record("note", "unsafe", '{"password":"hunter2"}', [])
        with self.assertRaises(ValueError):
            self.store.capture("file:///safe", "API_KEY=do-not-store")
        with self.assertRaises(ValueError):
            self.store.propose(
                "hermes", "default", "password=hunter2", "unsafe", None, "secret-test"
            )
        self.assertNotIn("ghp_abcdefghijklmnopqrstuvwxyz", redact_text("ghp_abcdefghijklmnopqrstuvwxyz"))
        self.assertNotIn("hunter2", redact_text("[password]=hunter2"))

    def test_database_and_created_parent_are_private(self):
        self.assertEqual(os.stat(self.store.path).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(self.store.path.parent).st_mode & 0o777, 0o700)

    def test_evidence_tables_reject_update_and_delete(self):
        event_id = self.store.record("decision", "Immutable", "Evidence stays fixed.", [])
        for statement in (
            "UPDATE ledger_events SET title = 'changed' WHERE id = ?",
            "DELETE FROM ledger_events WHERE id = ?",
        ):
            with self.assertRaises(sqlite3.IntegrityError):
                self.store.connection.execute(statement, (event_id,))
            self.store.connection.rollback()
        entity_id = self.store.entity("immutable-entity")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.connection.execute(
                "UPDATE entities SET name = 'rewritten' WHERE id = ?", (entity_id,)
            )
        self.store.connection.rollback()

    def test_verify_detects_tampering_after_trigger_removal(self):
        event_id = self.store.record("decision", "Hash chain", "Tampering must be visible.", [])
        self.assertTrue(self.store.verify()["ok"])
        self.store.connection.execute("DROP TRIGGER ledger_events_no_update")
        self.store.connection.execute("UPDATE ledger_events SET body = 'corrupted' WHERE id = ?", (event_id,))
        self.store.connection.commit()
        verification = self.store.verify()
        self.assertFalse(verification["ok"])
        self.assertIn("ledger chain mismatch", " ".join(verification["problems"]))

    def test_verify_detects_and_repairs_only_derivative_fts_tampering(self):
        self.store.record("decision", "Real title", "real searchable evidence", [])
        self.store.connection.execute(
            "INSERT INTO event_search(event_search,rowid,title,body) VALUES('delete',1,'Real title','real searchable evidence')"
        )
        self.store.connection.execute(
            "INSERT INTO event_search(rowid,title,body) VALUES(1,'Fake title','fake searchable evidence')"
        )
        self.store.connection.commit()
        self.assertFalse(self.store.verify()["ok"])
        self.assertTrue(self.store.rebuild_search_index()["ok"])
        self.assertEqual(self.store.search("real searchable")[0]["id"], 1)

    def test_concurrent_writers_preserve_hash_chain(self):
        database = self.store.path
        errors = []

        def write(index: int) -> None:
            other = Store(database)
            try:
                other.init()
                other.record("canary", f"writer {index}", f"concurrent evidence {index}", [])
            except Exception as error:  # pragma: no cover - failure is asserted below
                errors.append(error)
            finally:
                other.close()

        threads = [threading.Thread(target=write, args=(index,)) for index in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertTrue(self.store.verify()["ok"])
        self.assertEqual(self.store.counts()["ledger_events"], 6)

    def test_promotion_requires_review_and_records_verified_readback(self):
        proposal = self.store.propose(
            "hermes", "robin", "Memoria is local-first", "ADR 0001", None,
            "memoria.local-first", "current ledger has no conflicting fact",
        )
        duplicate = self.store.propose(
            "hermes", "robin", "Memoria is local-first", "ADR 0001", None,
            "memoria.local-first", "current ledger has no conflicting fact",
        )
        self.assertEqual(proposal, duplicate)
        with self.assertRaises(ValueError):
            self.store.propose(
                "hermes", "robin", "Memoria is hosted", "bad", None, "memoria.local-first"
            )
        with self.assertRaises(ValueError):
            self.store.record_application(proposal, "test", "Memoria is local-first")
        review = self.store.review_proposal(proposal, "approved", "dylan", "matches boundary contract")
        self.assertGreater(review, 0)
        applied = self.store.record_application(proposal, "robin", "Memoria is local-first")
        self.assertTrue(applied["verified"])
        mismatch = self.store.record_application(proposal, "robin", "different text")
        self.assertFalse(mismatch["verified"])
        self.assertEqual(self.store.proposal(proposal)["status"], "approved")

    def test_backup_restore_round_trip_and_refuses_overwrite_without_force(self):
        self.store.record("decision", "Backup", "Preserve the ledger.", [])
        backup = self.root / "backups" / "memoria.sqlite3"
        result = self.store.backup(backup)
        self.assertTrue(backup.is_file())
        self.assertEqual(len(result["sha256"]), 64)
        restored = self.root / "restored" / "memoria.db"
        outcome = Store.restore(backup, restored)
        self.assertTrue(outcome["verification"]["ok"])
        with self.assertRaises(ValueError):
            Store.restore(backup, restored)
        forced = Store.restore(backup, restored, force=True)
        self.assertIsNotNone(forced["preserved_previous"])

    def test_backup_refuses_a_tampered_source_even_when_called_directly(self):
        event_id = self.store.record("decision", "Backup refusal", "tamper evidence", [])
        self.store.connection.execute("DROP TRIGGER ledger_events_no_update")
        self.store.connection.execute(
            "UPDATE ledger_events SET body = 'changed' WHERE id = ?", (event_id,)
        )
        self.store.connection.commit()
        destination = self.root / "must-not-exist.sqlite3"
        with self.assertRaises(RuntimeError):
            self.store.backup(destination)
        self.assertFalse(destination.exists())

    def test_blank_authorization_and_review_actors_are_refused(self):
        vault = self.root / "vault"
        vault.mkdir()
        with self.assertRaises(ValueError):
            self.store.authorize_root(vault, "   ")
        proposal = self.store.propose(
            "honcho", "robin", "Dylan prefers concise reports", "explicit preference", None,
            "style.concise",
        )
        with self.assertRaises(ValueError):
            self.store.review_proposal(proposal, "approved", "", "valid rationale")

    def test_cli_packet_output_itself_honors_budget(self):
        self.store.record("decision", "CLI evidence", "A bounded adapter packet exists.", [])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = main([
                "packet", "--db", str(self.store.path), "--task", "adapter",
                "--query", "bounded adapter", "--max-chars", "500",
            ])
        encoded = output.getvalue().strip()
        self.assertEqual(code, 0)
        self.assertLessEqual(len(encoded), 500)
        self.assertEqual(json.loads(encoded)["used_chars"], len(encoded))

    def test_schema_version_is_recorded(self):
        row = self.store.connection.execute("SELECT version FROM schema_meta WHERE singleton = 1").fetchone()
        self.assertEqual(row[0], SCHEMA_VERSION)

    def test_legacy_prototype_database_migrates_without_losing_events(self):
        legacy_path = self.root / "legacy.db"
        legacy = sqlite3.connect(legacy_path)
        digest = hashlib.sha256(b"note body").hexdigest()
        legacy.executescript(
            f"""
            CREATE TABLE source_captures (
              id INTEGER PRIMARY KEY, uri TEXT NOT NULL, body TEXT NOT NULL,
              sha256 TEXT NOT NULL, captured_at TEXT NOT NULL, UNIQUE(uri, sha256)
            );
            CREATE TABLE ledger_events (
              id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL, kind TEXT NOT NULL,
              title TEXT NOT NULL, body TEXT NOT NULL,
              source_capture_id INTEGER REFERENCES source_captures(id), created_at TEXT NOT NULL
            );
            CREATE TABLE entities (
              id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
              kind TEXT NOT NULL DEFAULT 'unknown', created_at TEXT NOT NULL
            );
            CREATE TABLE event_entities (
              event_id INTEGER NOT NULL REFERENCES ledger_events(id),
              entity_id INTEGER NOT NULL REFERENCES entities(id), PRIMARY KEY(event_id, entity_id)
            );
            CREATE TABLE entity_edges (
              id INTEGER PRIMARY KEY, from_entity_id INTEGER NOT NULL REFERENCES entities(id),
              to_entity_id INTEGER NOT NULL REFERENCES entities(id), relation TEXT NOT NULL,
              source_capture_id INTEGER REFERENCES source_captures(id), observed_at TEXT NOT NULL,
              UNIQUE(from_entity_id, to_entity_id, relation, source_capture_id)
            );
            CREATE TABLE promotion_proposals (
              id INTEGER PRIMARY KEY, target TEXT NOT NULL, statement TEXT NOT NULL,
              rationale TEXT NOT NULL, evidence_event_id INTEGER REFERENCES ledger_events(id),
              status TEXT NOT NULL DEFAULT 'proposed', created_at TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE event_search USING fts5(title, body, content='ledger_events', content_rowid='id');
            CREATE TRIGGER ledger_events_ai AFTER INSERT ON ledger_events BEGIN
              INSERT INTO event_search(rowid, title, body) VALUES (new.id, new.title, new.body);
            END;
            INSERT INTO source_captures(id, uri, body, sha256, captured_at)
            VALUES (1, 'file:///vault/legacy.md', 'note body', '{digest}', '2026-01-01T00:00:00+00:00');
            INSERT INTO entities(id, name, kind, created_at) VALUES
              (1, 'obsidian:legacy', 'unknown', '2026-01-01T00:00:00+00:00'),
              (2, 'obsidian:hermes', 'unknown', '2026-01-01T00:00:00+00:00');
            INSERT INTO entity_edges(
              id, from_entity_id, to_entity_id, relation, source_capture_id, observed_at
            ) VALUES (1, 1, 2, 'wikilink', 1, '2026-01-01T00:00:00+00:00');
            INSERT INTO ledger_events(
              id, occurred_at, kind, title, body, source_capture_id, created_at
            ) VALUES (
              1, '2026-01-01T00:00:00+00:00', 'decision', 'Legacy',
              'legacy evidence', 1, '2026-01-01T00:00:00+00:00'
            );
            """
        )
        legacy.commit()
        legacy.close()
        migrated = Store(legacy_path)
        try:
            migrated.init()
            self.assertTrue(migrated.verify()["ok"])
            self.assertEqual(migrated.counts()["ledger_events"], 1)
            edge = migrated.connection.execute(
                "SELECT source_revision_id FROM entity_edges WHERE id = 1"
            ).fetchone()
            self.assertIsNotNone(edge[0])
            migrated.record("decision", "Current", "new evidence", [])
            self.assertTrue(migrated.verify()["ok"])
        finally:
            migrated.close()


if __name__ == "__main__":
    unittest.main()
