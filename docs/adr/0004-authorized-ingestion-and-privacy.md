# ADR 0004: Authorize ingestion roots and reject secret-like content

Status: accepted

## Decision

Obsidian ingestion is permitted only from an exact root with a latest append-only `grant` authorization. Revocation is another event. Resolved note paths must remain beneath that root. All writing APIs share one conservative secret-like-content detector, and CLI output applies redaction again.

## Consequences

Choosing a `--vault` argument is no longer authorization. Operators must grant roots deliberately. The detector may reject harmless token-shaped prose and cannot recognize every credential; Memoria remains unsuitable for secrets.
