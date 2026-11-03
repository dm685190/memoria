# ADR 0003: Enforce append-only, tamper-evident evidence

Status: accepted

## Decision

SQLite triggers reject UPDATE and DELETE on evidence, revision, relation, authorization, and promotion-workflow tables. Ledger events form an ordered SHA-256 chain over their canonical fields and previous event hash. Source bodies retain independent SHA-256 digests. `memoria verify` checks SQLite integrity, foreign keys, schema version, source digests, the event chain, and FTS row parity.

## Consequences

Normal corrections are new events. Database administrators can still destroy or rewrite the file, but doing so requires bypassing controls and should be detectable unless they reconstruct every digest. Backups remain necessary; hashes are not signatures.
