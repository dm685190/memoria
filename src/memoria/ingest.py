from __future__ import annotations

import re
from pathlib import Path

from .store import Store

WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
# Guardrails against common accidental credential capture. This is intentionally conservative.
SECRET = re.compile(r"(?im)^(?:\s*(?:api[_-]?key|password|secret|token)\s*[:=]|-----BEGIN [A-Z ]+PRIVATE KEY-----)")


def ingest_obsidian(store: Store, vault: str | Path, relative_path: str) -> dict[str, object]:
    root = Path(vault).resolve()
    candidate = (root / relative_path).resolve()
    if root not in candidate.parents or candidate.suffix.lower() != ".md":
        raise ValueError("path must be a markdown file inside the selected vault")
    body = candidate.read_text(encoding="utf-8")
    if SECRET.search(body):
        raise ValueError("capture refused: content resembles a secret; record a reference, not the secret")
    source_name = candidate.stem
    capture_id = store.capture(candidate.as_uri(), body)
    event_id = store.record("note_capture", f"Captured note: {source_name}", body, [source_name], capture_id)
    links = sorted({match.strip() for match in WIKILINK.findall(body) if match.strip()})
    for link in links:
        store.edge(source_name, link, "wikilink", capture_id)
    return {"event_id": event_id, "capture_id": capture_id, "note": source_name, "wikilinks": links}
