# Security and privacy model

## Protected assets

Memoria stores operational history and note snapshots. Treat the database and backups as private data even when no credential is present.

## Controls

- New databases are mode 0600; state directories created by Memoria are mode 0700.
- SQLite foreign keys, full synchronization, WAL mode, and a five-second busy timeout are enabled.
- Evidence, revisions, entities, proposals, reviews, applications, root authorizations, and graph joins reject update/delete operations.
- Source bodies carry SHA-256 digests; ledger events form a SHA-256 chain checked by `memoria verify`.
- Every content-writing API uses the same secret-like-content guard.
- CLI output is redacted again as defense in depth.
- Obsidian roots require an explicit append-only grant. Revocation is another event; history is not erased.
- The package contains no network client, telemetry, web server, or downstream memory writer.

## Limits

The secret detector is a guardrail, not a data-loss-prevention product. It recognizes common assignments, authorization headers, private-key blocks, and several token families. It cannot prove arbitrary prose is harmless. Store vault references rather than credentials.

Filesystem owners and SQLite administrators can drop triggers or rewrite the file. The hash verifier detects many such changes but is not a hardware root of trust. Backups should live on a separately protected filesystem.

Source URIs expose local paths. Evidence packets should be passed only to trusted local agents.

## Incident response

1. Stop writes and preserve the database, WAL, and SHM files together.
2. Run `memoria verify --db PATH` against a copy.
3. Preserve the failing output and the last known-good backup.
4. Restore to a new path first; never overwrite the only copy.
5. If a secret entered the ledger, rotate the secret. Do not destroy evidence without explicit authorization.
