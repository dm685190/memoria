# Memoria

Memoria is a local-first, evidence-bearing memory layer for work that should survive a chat window without silently becoming a new source of truth.

It complements, rather than replaces:

- Hermes internal memory: compact canonical facts and operating constraints.
- Honcho: evolving user and collaboration context.
- Live checks: current system truth.

Memoria keeps the missing layer: dated source material, durable decisions, incidents, linked Obsidian notes, and bounded evidence packets for a specific task.

## Status

`0.1.0` is an implementation foundation, deliberately not a deployment. It has no hosted dependencies, telemetry, network client, web server, or automatic writes to Hermes/Honcho.

## Design invariants

1. Source captures and ledger events are append-only.
2. Derived records cite their source capture.
3. Retrieval is explicit, scoped, and budgeted.
4. Promotion is a proposal; a human or policy must curate it into Hermes or Honcho.
5. Secrets are rejected by the default ingest guard and never printed in retrieval packets.

## Quick start

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e .
memoria init --db ./memoria.db
memoria record --db ./memoria.db --kind decision --title "Use a local-first evidence layer" --body "Do not deploy before design review." --entity memoria
memoria query --db ./memoria.db --query "local evidence" --entity memoria
```

## Obsidian capture

```bash
memoria ingest-obsidian --db ./memoria.db --vault /path/to/notes --path projects/memoria.md
```

The note is captured with its SHA-256, parsed for `[[wikilinks]]`, and recorded as an immutable source observation. The original vault is never modified.

## Evidence packet

```bash
memoria packet --db ./memoria.db --task "Decide Memoria retrieval model" --query "retrieval evidence" --entity memoria --max-chars 2400
```

Output is machine-readable JSON with a strict character budget and citations. Feed it to an agent only when relevant; do not inject the whole archive into every prompt. The dead deserve quiet.

## Repository map

- `src/memoria/`: standard-library implementation and CLI.
- `tests/`: executable behavior tests.
- `docs/`: architecture, schema, safety model, and decision records.
- `examples/`: a small Obsidian note for safe manual experimentation.
- `IDEAS.md`: an append-only design register for iteration.

## Non-goals

Memoria does not store credentials, execute infrastructure changes, replace SQLite with a hosted vector database, or deploy itself. Semantic retrieval may be added later only after lexical/entity retrieval is measured as insufficient.
