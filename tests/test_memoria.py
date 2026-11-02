import json
import tempfile
import unittest
from pathlib import Path

from memoria.ingest import ingest_obsidian
from memoria.packet import evidence_packet
from memoria.store import Store


class MemoriaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "memoria.db")
        self.store.init()

    def tearDown(self):
        self.store.close(); self.temp.cleanup()

    def test_event_search_and_packet_are_cited_and_bounded(self):
        event_id = self.store.record("decision", "Local first", "Evidence remains on the local machine.", ["memoria"])
        results = self.store.search("local evidence", "memoria")
        self.assertEqual(results[0]["id"], event_id)
        packet = evidence_packet(self.store, "architecture review", "local evidence", "memoria", 500)
        self.assertEqual(packet["evidence"][0]["citation"]["event_id"], event_id)
        self.assertLessEqual(packet["used_chars"], 500)

    def test_obsidian_capture_creates_source_and_wikilink_edges(self):
        vault = self.root / "vault"; vault.mkdir()
        (vault / "memoria.md").write_text("Memoria complements [[Hermes]] and [[Honcho|context]].")
        result = ingest_obsidian(self.store, vault, "memoria.md")
        self.assertEqual(result["wikilinks"], ["Hermes", "Honcho"])
        self.assertEqual(self.store.counts()["entity_edges"], 2)
        self.assertEqual(self.store.search("complements")[0]["id"], result["event_id"])

    def test_secret_like_note_is_refused(self):
        vault = self.root / "vault"; vault.mkdir()
        (vault / "unsafe.md").write_text("API_KEY=do-not-store")
        with self.assertRaises(ValueError):
            ingest_obsidian(self.store, vault, "unsafe.md")

    def test_promotion_is_only_a_proposal(self):
        proposal = self.store.propose("hermes", "Memoria is local-first", "ADR 0001", None)
        status = self.store.connection.execute("SELECT status FROM promotion_proposals WHERE id = ?", (proposal,)).fetchone()[0]
        self.assertEqual(status, "proposed")


if __name__ == "__main__":
    unittest.main()
