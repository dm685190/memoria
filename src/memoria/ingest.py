from __future__ import annotations

import re
from pathlib import Path

from .security import require_safe_text
from .store import Store

WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")


def _note_entity(relative: Path) -> str:
    return f"obsidian:{relative.with_suffix('').as_posix()}"


def _link_entity(link: str) -> str:
    normalized = link.strip().replace("\\", "/").removesuffix(".md")
    return f"obsidian:{normalized}"


def ingest_obsidian(
    store: Store,
    vault: str | Path,
    relative_path: str,
    observed_at: str | None = None,
) -> dict[str, object]:
    root = Path(vault).expanduser().resolve()
    if not store.root_is_authorized(root):
        raise ValueError("vault root is not authorized; grant it explicitly before ingestion")
    candidate = (root / relative_path).resolve()
    try:
        relative = candidate.relative_to(root)
    except ValueError as error:
        raise ValueError("path must be inside the authorized vault") from error
    if candidate.suffix.lower() != ".md" or not candidate.is_file():
        raise ValueError("path must be an existing markdown file inside the authorized vault")
    body = candidate.read_text(encoding="utf-8")
    require_safe_text(note=body)
    source_entity = _note_entity(relative)
    capture = store.capture(candidate.as_uri(), body, observed_at)
    if not capture.changed:
        existing_event = store.event_for_revision(capture.revision_id)
        if existing_event is None:
            existing_event = store.record(
                "note_capture",
                f"Captured note: {relative.as_posix()}",
                body,
                [source_entity],
                capture.capture_id,
                capture.revision_id,
                observed_at,
            )
        return {
            "event_id": existing_event,
            "capture_id": capture.capture_id,
            "revision_id": capture.revision_id,
            "note": source_entity,
            "wikilinks": [],
            "changed": False,
        }
    event_id = store.record(
        "note_capture",
        f"Captured note: {relative.as_posix()}",
        body,
        [source_entity],
        capture.capture_id,
        capture.revision_id,
        observed_at,
    )
    links = sorted({_link_entity(match) for match in WIKILINK.findall(body) if match.strip()})
    for link in links:
        store.edge(source_entity, link, "wikilink", capture.capture_id, capture.revision_id)
    return {
        "event_id": event_id,
        "capture_id": capture.capture_id,
        "revision_id": capture.revision_id,
        "note": source_entity,
        "wikilinks": links,
        "changed": True,
    }
