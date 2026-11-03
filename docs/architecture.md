# Architecture

## Four truth layers

| Question | Layer | Mutation model |
|---|---|---|
| What must be exactly true? | Hermes internal memory | deliberately curated |
| How does the collaborator tend to work? | Honcho | inferred; curated conclusions |
| What happened, when, and what proves it? | Memoria | append-only evidence and review history |
| What is true now? | live system check | observed at query time |

A live check outranks historical evidence. Memoria never promotes itself into either adjacent memory layer.

## Components

1. Capture: CLI records an event or an exact note snapshot from an authorized root.
2. Store: SQLite WAL stores source content, revision chains, event hashes, entities, edges, and promotion workflow evidence.
3. Retrieve: FTS5 literalizes terms, ranks matches, centers snippets, and applies optional entity/date filters.
4. Packet: contract-versioned JSON is shrunk until its complete compact serialization fits the caller's budget.
5. Curate: proposals, reviews, and application read-backs are appended; downstream application remains external.
6. Operate: verify, online backup, and preflighted atomic restore provide lifecycle controls.

## Write path

Every content-bearing write passes the shared secret-like-content guard. Evidence insertion serializes with `BEGIN IMMEDIATE`, binds the new event to the prior hash, and lets an FTS insert trigger index the immutable body. Obsidian content is split into deduplicated captures and chronological revisions, allowing unchanged idempotency and later reversion without losing chronology.

## Read path

1. Identify task, entity, and time window.
2. Search only task-relevant evidence.
3. Return excerpts and citations, not an archive dump.
4. Enforce the budget against the exact stdout JSON representation.
5. Verify any actionable operational claim live.

## Failure model

SQLite administrators can bypass triggers; `verify` detects hash, source, FK, index, and database-integrity failures but does not provide signed attestations. Backups are never automatically deleted. Restore verifies a temporary candidate before replacing an existing path.
