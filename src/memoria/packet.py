from __future__ import annotations

from typing import Any

from .store import Store


def evidence_packet(store: Store, task: str, query: str, entity: str | None, max_chars: int, limit: int = 8) -> dict[str, Any]:
    if max_chars < 400:
        raise ValueError("max_chars must be at least 400")
    remaining = max_chars
    evidence: list[dict[str, Any]] = []
    for row in store.search(query, entity, limit):
        citation = {
            "event_id": row["id"], "occurred_at": row["occurred_at"], "kind": row["kind"],
            "source_uri": row["uri"], "source_sha256": row["sha256"], "captured_at": row["captured_at"],
        }
        body = row["body"]
        fixed = len(row["title"]) + 180
        allowed = max(0, remaining - fixed)
        if allowed < 80:
            break
        excerpt = body[:allowed].rstrip()
        if len(excerpt) < len(body):
            excerpt += "…"
        evidence.append({"title": row["title"], "excerpt": excerpt, "citation": citation})
        remaining -= fixed + len(excerpt)
    return {
        "task": task,
        "query": query,
        "entity": entity,
        "budget_chars": max_chars,
        "used_chars": max_chars - remaining,
        "evidence": evidence,
        "instruction": "Treat this as historical evidence. Verify operational claims live before acting.",
    }
