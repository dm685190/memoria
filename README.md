# Memoria

Memoria is a local-first, append-only evidence memory for AI-assisted operations and long-running projects.

It preserves the material that should outlive a chat session—dated decisions, incidents, source snapshots, linked notes, and review history—without silently turning any of it into current truth or personal identity.

Memoria is designed to complement two existing memory layers:

- **Hermes internal memory** remains the compact canonical ledger for stable facts, exact paths, identifiers, and hard operating boundaries.
- **Honcho** remains the human-context layer for preferences, collaboration patterns, conversational continuity, and curated conclusions.
- **Memoria** supplies the missing historical-evidence layer: what happened, when it happened, where the evidence came from, and how it changed.
- **Live checks** still determine what is true now.

Memoria does not replace Hermes or Honcho. It gives them less reason to become bloated, ambiguous, or contaminated with operational debris.

## Why Memoria exists

A useful agent needs several kinds of memory, but those kinds have different standards of truth.

A stable service path should be exact. A user preference may be inferred and corrected over time. An incident report should preserve chronology and provenance. A current service state should be observed live. Mixing all four into one memory store creates predictable decay:

- canonical facts compete with chat summaries;
- preferences become entangled with infrastructure state;
- old incidents are mistaken for current failures;
- raw notes are injected into every prompt;
- conclusions lose their sources;
- corrections overwrite the history that explains them.

Memoria separates historical evidence from canonical facts and human context. It stores evidence immutably, retrieves only what a task needs, and returns citations that an agent or operator can inspect.

The result is not a larger memory blob. It is a smaller, more disciplined memory stack.

## The memory stack

| Question | Authority | What belongs there | What does not |
|---|---|---|---|
| What must remain exactly true across sessions? | Hermes internal memory | Stable paths, identifiers, service map, provider quirks, privacy rules, hard operating boundaries | Incident timelines, raw logs, project diaries, inferred preferences |
| How does the person tend to work? | Honcho | Preferences, collaboration style, conversational continuity, curated conclusions | Credentials, alert payloads, deployment history, bulk note imports |
| What happened, when, and what proves it? | Memoria | Source snapshots, decisions, incidents, revisions, entity links, review history, citations | Credentials, automatic identity inference, unreviewed downstream writes |
| What is true right now? | Live system checks | Current process, service, filesystem, API, or network state | Historical assumptions |

### Resolution order

When the layers disagree, use this order:

1. **Live observation** determines current operational state.
2. **Hermes internal memory** supplies stable constraints and exact canonical facts.
3. **Memoria** supplies historical evidence, chronology, and provenance.
4. **Honcho** supplies human context, not system truth.

A Memoria packet is evidence, not authority to act. Every packet carries an instruction to verify actionable claims against live systems.

## How Memoria complements Hermes internal memory

Hermes internal memory is deliberately small and always available. That makes it valuable, but also makes every character expensive. It should answer questions such as:

- What is the canonical hostname?
- Which directory contains the service?
- What is the hard privacy boundary?
- Which provider behavior must always be remembered?

It should not become an archive of every outage, migration, decision, and note revision.

Memoria takes that historical load instead:

- Hermes can retain `Memoria DB: /var/lib/memoria/memoria.db` as a stable fact.
- Memoria can retain the installation decision, bootstrap evidence, backup drills, incident chronology, and the source note revisions that explain how the system arrived there.
- Hermes can query Memoria when a task needs history, rather than injecting that history into every session.

Memoria never edits Hermes memory. Promotion is a reviewed workflow, not an automatic write. If historical evidence reveals a new stable fact, an operator must inspect the target, approve an exact statement, apply it outside Memoria, read it back, and record the result.

## How Memoria complements Honcho

Honcho models the collaborator rather than the infrastructure. It is useful for questions such as:

- Does the user prefer concise or exhaustive reports?
- How do they want risky changes approved?
- What recurring working patterns matter in this conversation?
- What context from prior sessions improves collaboration?

Operational history does not belong in that identity layer. Alert payloads, job IDs, deployment logs, and stale routing states can distort a human profile and waste context.

Memoria gives those records a better home:

- Honcho retains durable human preferences and conversational continuity.
- Memoria retains incidents, decisions, source evidence, and project chronology.
- Hermes requests a small Memoria packet only when historical evidence is relevant.
- No bulk Obsidian import is sent to Honcho.
- No Memoria event automatically becomes a Honcho conclusion.

This boundary lets Honcho remain human-shaped while Memoria remains evidence-shaped.

## Core design

Memoria is a Python CLI backed by local SQLite with FTS5. It has no web server, network client, telemetry, hosted dependency, or automatic Hermes/Honcho writer.

Its lifecycle has six parts:

1. **Capture** — record an event or snapshot a Markdown note from an explicitly authorized root.
2. **Store** — preserve immutable content, source revisions, entity relations, and hash-linked ledger events in SQLite.
3. **Retrieve** — search with literalized FTS terms and optional entity or time filters.
4. **Packetize** — emit a compact, cited JSON packet bounded by its complete serialized character count.
5. **Curate** — append proposals, reviews, and application read-backs without directly changing another memory system.
6. **Operate** — verify integrity, create online backups, and restore through a verified candidate.

### Write path

Every content-bearing write passes the same secret-like-content refusal guard. Evidence writes serialize with `BEGIN IMMEDIATE`. Each ledger event binds to the previous event hash, creating a tamper-evident chain.

Obsidian ingestion separates content captures from chronological revisions:

- unchanged content is idempotent;
- changed content creates a new immutable revision;
- reverting to an older body creates a new chronological revision without duplicating the content blob;
- note identity is based on the authorized-root-relative path, so same-named files in different folders remain distinct;
- wikilinks become entity relationships without rewriting source history.

SQLite triggers reject updates and deletes against canonical evidence and review tables. `memoria verify` checks the database, foreign keys, source hashes, ledger chain, and derivative search index.

### Read path

A caller provides a task and search query, optionally narrowed by entity and time window. Memoria returns only task-relevant excerpts and complete citations.

A packet includes:

- `contract_version`;
- `read_only: true`;
- task, query, filters, and output budget;
- bounded evidence entries;
- event, source revision, source URI, timestamp, and SHA-256 provenance;
- exact `used_chars` for the compact JSON payload;
- a mandatory live-verification instruction.

The complete serialized packet—not merely the excerpts—must fit `--max-chars`. If a cited result cannot fit, Memoria reports `evidence_status: budget_exhausted` and the minimum required size instead of presenting an ambiguous empty success.

## Data integrity and history

Memoria preserves history rather than pretending that later edits erase earlier truth.

- Evidence and curation records are append-only at the SQLite layer.
- Source bodies carry SHA-256 digests.
- Ledger events form a SHA-256 chain.
- Root grants and revocations are themselves evidence.
- Promotion proposals, reviews, and application read-backs remain part of the audit trail.
- Backups are never automatically deleted.
- Corrections are new events, not destructive rewrites.

This is tamper-evident, not magically tamper-proof. A filesystem or SQLite administrator can rewrite the database after disabling controls. Verification detects many forms of corruption or manipulation, but Memoria is not a hardware root of trust or a signed transparency service.

## Privacy and security

Memoria treats operational history and note snapshots as private data.

Default controls include:

- database files created as mode `0600`;
- managed state and backup directories created as mode `0700`;
- a dedicated unprivileged `memoria` service account for the supported deployment;
- explicit authorized-root grants before note ingestion;
- refusal of common credentials, authorization headers, private keys, and token patterns;
- output redaction as defense in depth;
- fixed-path, read-only agent retrieval when the optional bridge is enabled;
- local-filesystem enforcement for SQLite state and backups;
- no network listener or outbound client.

The secret detector is a guardrail, not a complete DLP system. Store references to credentials, never credentials themselves. Source URIs can disclose local paths, so evidence packets should remain inside trusted local boundaries.

## Quick start for development

Requirements:

- Python 3.11 or newer;
- SQLite with FTS5 enabled;
- a local filesystem with correct SQLite locking semantics.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install .

memoria init --db ./state/memoria.db
memoria verify --db ./state/memoria.db
```

Record a small event:

```bash
memoria record \
  --db ./state/memoria.db \
  --kind decision \
  --title "Keep evidence separate" \
  --body "Memoria remains an append-only evidence layer." \
  --entity memoria
```

Retrieve a bounded packet:

```bash
memoria packet \
  --db ./state/memoria.db \
  --task "Review the memory-layer decision" \
  --query "evidence separate" \
  --limit 3 \
  --max-chars 1400
```

## Authorized Obsidian ingestion

Memoria cannot ingest arbitrary note trees by default. An operator must explicitly authorize a real directory:

```bash
memoria authorize-root \
  --db ./state/memoria.db \
  --root /path/to/vault/Memoria \
  --actor operator
```

Then ingest a note inside that root:

```bash
memoria ingest-obsidian \
  --db ./state/memoria.db \
  --vault /path/to/vault/Memoria \
  --path /path/to/vault/Memoria/projects/example.md
```

Start with a harmless, non-secret note. Inspect the result, ingest it again to prove idempotence, then run `memoria verify`.

Authorization does not imply scheduled ingestion. The supported deployment installs no ingestion timer; capture remains an explicit act.

## Verification, backup, and restore

Verify the canonical database:

```bash
memoria verify --db ./state/memoria.db
```

A successful result reports `ok: true`, the schema version, SQLite quick-check status, row counts, and no problems.

Create a verified online backup:

```bash
memoria backup \
  --db ./state/memoria.db \
  --output-dir ./backups
```

The backup command:

- refuses an unhealthy source;
- uses SQLite's online backup API;
- verifies the copy;
- writes it privately;
- atomically renames it into place;
- prints its streaming SHA-256;
- never prunes older backups.

Restore to a new path first:

```bash
memoria restore \
  --backup ./backups/memoria-TIMESTAMP.sqlite3 \
  --db ./restore-drill/memoria.db

memoria verify --db ./restore-drill/memoria.db
```

Replacing an existing database requires `--force`. The existing destination and sidecars are preserved beside the replacement. Never overwrite the only copy of a damaged database; quarantine it and restore to a new path for inspection.

## Supported Linux deployment

The supported first-install path is `deploy/bootstrap`. It is local-only and dry-run-first.

From a reviewed checkout pinned to an immutable Git revision:

```bash
sudo ./deploy/bootstrap \
  --source "$PWD" \
  --revision "$(git rev-parse HEAD)"

sudo ./deploy/bootstrap --apply \
  --source "$PWD" \
  --revision "$(git rev-parse HEAD)"
```

The baseline apply run:

- creates the dedicated `memoria` account;
- creates private state and backup directories;
- installs a local virtual environment from the reviewed checkout;
- initializes and verifies the database;
- writes `/etc/memoria.env` as `root:root 0600`;
- installs and validates systemd units;
- creates a verified backup;
- restores that backup into an isolated drill database;
- verifies the drill and removes only the drill copy;
- leaves timers disabled until their acceptance output is reviewed;
- installs no ingestion root or agent bridge unless explicitly requested.

The fixed default layout is:

| Purpose | Path |
|---|---|
| Application environment | `/opt/memoria/.venv` |
| Database | `/var/lib/memoria/memoria.db` |
| Backups | `/var/backups/memoria` |
| Environment file | `/etc/memoria.env` |
| Verify schedule | daily at 03:15 UTC |
| Backup schedule | daily at 03:30 UTC |

Enable the reviewed timers explicitly:

```bash
sudo ./deploy/bootstrap --apply --adopt-existing --enable-timers \
  --source "$PWD" \
  --revision "$(git rev-parse HEAD)"
```

The bootstrap refuses nonlocal SQLite filesystems, symlinked managed paths, insufficient Python/FTS5 support, revision mismatches, and unreviewed adoption of an existing database.

See [docs/deployment.md](docs/deployment.md) for prerequisites, optional root authorization, packet-bridge activation, acceptance checks, and rollback boundaries.

## Hermes retrieval integration

The sole agent-facing retrieval surface in this release is `memoria packet`.

Hermes should call it only when a task requires historical evidence. Memoria should not be injected wholesale at session start. The caller should use the smallest useful query, entity, time window, result count, and character budget.

For a locally installed Hermes process that cannot directly read the private database, the repository includes an optional reviewed bridge:

- `deploy/helpers/memoria-packet`;
- `deploy/sudoers.memoria-packet`;
- bootstrap flags `--install-packet-bridge --packet-user USER`.

The bridge:

- fixes the executable and database paths;
- permits only packet retrieval flags;
- requires task and query values;
- limits results to 1–5 records;
- limits output to 822–2000 characters;
- drops execution to the unprivileged `memoria` account;
- rejects database overrides, environment overrides, write commands, unknown flags, duplicate flags, and empty values.

It is not part of the baseline install. Review it before enabling it, validate the sudoers policy, test it from a disposable session, and keep a separate rollback session available.

A gateway restart is not inherently required: Memoria is a local CLI, and a Hermes skill or tool wrapper can invoke it only when needed. The exact integration mechanism is deliberately deployment-specific.

## Curated promotion

Retrieval never promotes evidence automatically.

Memoria's `propose`, `review`, and `record-application` workflow records a controlled transition from historical evidence to another layer:

1. Inspect the evidence and the target layer's current value.
2. Record an exact proposed statement, target profile, conflict key, and precondition.
3. Obtain an explicit review decision.
4. Apply the approved statement outside Memoria.
5. Read the target back.
6. Record the observed result and evidence reference.

Verification succeeds only when the observed statement hash matches the approved statement. Memoria still does not perform the external write itself.

Examples of appropriate promotion:

- A repeatedly verified service path may be proposed for Hermes internal memory.
- A directly confirmed collaboration preference may be proposed as a curated Honcho conclusion.

Examples that should remain in Memoria:

- an outage timeline;
- a one-time deployment log;
- an alert payload;
- a project decision that is no longer an always-on constraint;
- a source note revision.

## Operational model

Memoria has no persistent application daemon. The supported systemd deployment uses short-lived oneshot services for verification and backup.

Concurrency rules:

- readers use SQLite WAL mode;
- writers serialize with `BEGIN IMMEDIATE`;
- the busy timeout is five seconds;
- scheduled backups should not overlap;
- state must remain on a local filesystem, not NFS, SMB, or SSHFS.

Retention is external policy. Memoria never deletes evidence or backups automatically. Capacity monitoring should precede any archival or pruning decision.

## What Memoria is not

Memoria is not:

- a replacement for Hermes internal memory;
- a replacement for Honcho's human model;
- a source of current operational truth;
- a credential vault;
- a vector database or automatic semantic profile builder;
- a chat transcript dump;
- a background crawler for an entire Obsidian vault;
- an automatic downstream memory writer;
- a signed or hardware-backed transparency log;
- a hosted service.

Those exclusions are part of the design, not missing features waiting to escape containment.

## Release state

The current package version is `1.0.0rc1` and is classified as beta. The repository includes:

- SQLite schema and migrations;
- append-only evidence and revision storage;
- FTS5 retrieval and bounded packet output;
- secret-like-content refusal;
- promotion review records;
- verification, backup, and restore commands;
- a dry-run-first Linux bootstrap;
- deterministic verification and backup timers;
- an optional read-only Hermes packet bridge;
- CI for supported Python versions.

Before production use, review the readiness audit, deployment contract, privacy model, and operations runbook for the target host.

## Documentation

- [Boundary contract](docs/boundary-contract.md) — authority of Hermes, Honcho, Memoria, and live checks.
- [Architecture](docs/architecture.md) — write path, read path, components, and failure model.
- [Integration contract](docs/integration-contract.md) — read-only packet and curated-promotion boundaries.
- [Security and privacy](docs/security-and-privacy.md) — controls, limits, and incident response.
- [Operations](docs/operations.md) — verify, backup, restore, concurrency, upgrades, and retention.
- [Deployment](docs/deployment.md) — dry-run-first bootstrap, acceptance, optional integration, and rollback.
- [Readiness audit](docs/readiness-audit.md) — deployment-readiness findings and closure evidence.
- [Schema](docs/schema.md) — stored records and relationships.
- [ADRs](docs/adr/) — permanent architectural decisions.
- [IDEAS.md](IDEAS.md) — append-only design register.
- [CONTRIBUTING.md](CONTRIBUTING.md) — development and review expectations.

## Development and testing

Run the test suite:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
```

Check patch hygiene:

```bash
git diff --check
```

Changes to the evidence model, retrieval contract, deployment boundary, or promotion workflow should include tests and an ADR update where the architectural decision changes.

## License

Memoria is released under the [MIT License](LICENSE).
