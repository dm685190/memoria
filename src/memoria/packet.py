from __future__ import annotations

import json
from typing import Any

from .security import redact_text, require_safe_text
from .store import Store

PACKET_CONTRACT_VERSION = 1
MIN_PACKET_CHARS = 400
MAX_PACKET_CHARS = 100_000


def serialize_packet(packet: dict[str, Any]) -> str:
    return json.dumps(packet, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _finalize_used(packet: dict[str, Any]) -> dict[str, Any]:
    packet = dict(packet)
    while True:
        used = len(serialize_packet(packet))
        if packet.get("used_chars") == used:
            return packet
        packet["used_chars"] = used


def evidence_packet(
    store: Store,
    task: str,
    query: str,
    entity: str | None,
    max_chars: int,
    limit: int = 8,
    after: str | None = None,
    before: str | None = None,
) -> dict[str, Any]:
    if not MIN_PACKET_CHARS <= max_chars <= MAX_PACKET_CHARS:
        raise ValueError(f"max_chars must be between {MIN_PACKET_CHARS} and {MAX_PACKET_CHARS}")
    require_safe_text(task=task, query=query, entity=entity)
    packet: dict[str, Any] = {
        "contract_version": PACKET_CONTRACT_VERSION,
        "read_only": True,
        "task": task,
        "query": query,
        "entity": entity,
        "after": after,
        "before": before,
        "budget_chars": max_chars,
        "used_chars": 0,
        "evidence": [],
        "instruction": "Historical evidence only. Verify actionable claims against live systems before acting.",
    }
    packet = _finalize_used(packet)
    if len(serialize_packet(packet)) > max_chars:
        raise ValueError("packet metadata exceeds max_chars; shorten task, query, or filters")

    for row in store.search(query, entity, limit, after, before):
        citation = {
            "event_id": row["id"],
            "occurred_at": row["occurred_at"],
            "kind": row["kind"],
            "source_uri": redact_text(row["uri"]) if row["uri"] else None,
            "source_sha256": row["sha256"],
            "captured_at": row["captured_at"],
            "source_revision_id": row["source_revision_id"],
            "source_observed_at": row["source_observed_at"],
        }
        citation = {key: value for key, value in citation.items() if value is not None}
        excerpt = redact_text(row["excerpt"] or "")
        item = {"title": redact_text(row["title"]), "excerpt": excerpt, "citation": citation}
        full = dict(packet)
        full["evidence"] = [*packet["evidence"], item]
        full = _finalize_used(full)
        if len(serialize_packet(full)) <= max_chars:
            packet = full
            continue

        low, high = 0, len(excerpt)
        best: dict[str, Any] | None = None
        while low <= high:
            middle = (low + high) // 2
            shortened = excerpt[:middle].rstrip()
            if middle < len(excerpt) and shortened:
                shortened += "…"
            candidate_item = {"title": row["title"], "excerpt": shortened, "citation": citation}
            candidate = dict(packet)
            candidate["evidence"] = [*packet["evidence"], candidate_item]
            candidate = _finalize_used(candidate)
            if len(serialize_packet(candidate)) <= max_chars:
                best = candidate
                low = middle + 1
            else:
                high = middle - 1
        if best is not None and best["evidence"][-1]["excerpt"]:
            packet = best
        elif not packet["evidence"]:
            minimum_item = {"title": row["title"], "excerpt": "", "citation": citation}
            minimum_packet = dict(packet)
            minimum_packet["evidence"] = [minimum_item]
            minimum_packet = _finalize_used(minimum_packet)

            exhausted = dict(packet)
            exhausted["evidence_status"] = "budget_exhausted"
            exhausted["minimum_evidence_chars"] = len(serialize_packet(minimum_packet))
            exhausted = _finalize_used(exhausted)
            if len(serialize_packet(exhausted)) > max_chars:
                raise ValueError(
                    "packet budget cannot report matching evidence; increase max_chars"
                )
            packet = exhausted
        break

    packet = _finalize_used(packet)
    if len(serialize_packet(packet)) > max_chars:
        raise RuntimeError("packet budget invariant failed")
    return packet
