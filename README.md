# Memoria

Memoria is a local-first, evidence-bearing memory layer for history that should survive a chat window without silently becoming canonical truth.

It complements:

- Hermes internal memory: compact canonical facts and hard operating boundaries.
- Honcho: human preferences, collaboration patterns, and conversational continuity.
- Live checks: current operational truth.

Memoria holds the missing layer: dated source snapshots, decisions, incidents, linked notes, append-only promotion reviews, and bounded cited evidence packets.

## Release state

`1.0.0rc1` is deployment-ready. It has no network client, telemetry, web server, hosted dependency, or automatic Hermes/Honcho writer. See `docs/readiness-audit.md` and `docs/deployment.md` before installation.

## Invariants

1. Evidence and curation history are append-only at the SQLite layer.
2. Source content is hashed; ledger events form a tamper-evident hash chain.
3. Every content write uses the same secret-like-content refusal guard.
4. Note capture requires an explicitly authorized root.
5. Retrieval is literalized, time/entity scoped, cited, and bounded by actual serialized characters.
6. Promotion requires proposal, explicit review, external application, and read-back evidence.
7. Live checks outrank historical evidence.

## Quick start

```bash
python -m venv .venv
. .venv/bin/activate
pip install .
memoria init --db ./state/memoria.db
memoria verify --db ./state/memoria.db
memoria record --db ./state/memoria.db \
  --kind decision --title "Use local evidence" \
  --body "Memoria remains a third layer." --entity memoria
memoria packet --db ./state/memoria.db \
  --task "Review the memory boundary" --query "local evidence" --max-chars 1200
```

## Authorized Obsidian capture

```bash
memoria authorize-root --db ./state/memoria.db --root /path/to/vault --actor dylan
memoria ingest-obsidian --db ./state/memoria.db \
  --vault /path/to/vault --path projects/memoria.md
```

Unchanged notes are idempotent. Changed or reverted content creates a new immutable revision. Note identity uses the vault-relative path, so two `status.md` files do not become one corpse.

## Operations

```bash
memoria verify --db ./state/memoria.db
memoria backup --db ./state/memoria.db --output-dir ./backups
memoria restore --backup ./backups/memoria-TIMESTAMP.sqlite3 --db ./restore-drill/memoria.db
```

The restore candidate is verified before the destination changes. Existing destinations require `--force` and are preserved beside the replacement.

## Documentation

- `docs/boundary-contract.md`: authority of Hermes, Honcho, Memoria, and live checks.
- `docs/integration-contract.md`: read-only packet and curated promotion contract.
- `docs/security-and-privacy.md`: controls, limits, and incident response.
- `docs/operations.md`: verify, backup, restore, concurrency, upgrades, retention.
- `docs/deployment.md`: staging, acceptance, and rollback.
- `docs/adr/`: permanent design decisions.
- `IDEAS.md`: append-only design register.
