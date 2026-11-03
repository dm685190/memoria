# Hermes and Honcho integration contract

## Read-only adapter

`memoria packet` is the sole agent-facing retrieval surface in this release. It emits one compact JSON object with:

- `contract_version: 1`
- `read_only: true`
- the task, query, entity and optional time window
- a complete serialized-character budget and measured `used_chars`
- bounded evidence entries with event, source, revision, SHA-256 and occurrence citations
- a mandatory instruction to verify actionable claims live

The exact stdout payload never exceeds `--max-chars`. Diagnostics go to stderr and return nonzero.

Example:

```bash
memoria packet \
  --db /var/lib/memoria/memoria.db \
  --task "Reconstruct the service outage" \
  --query "gateway outage" \
  --entity gateway \
  --after 2026-01-01T00:00:00Z \
  --max-chars 2400
```

Hermes may invoke this command only when task context warrants historical retrieval. It must not inject the entire database at session start. A live system check outranks packet contents.

## Promotion boundary

`propose`, `review`, and `record-application` are an evidence workflow, not a downstream writer. Memoria has no API that edits Hermes memory or creates a Honcho conclusion.

An external operator must:

1. Inspect evidence and the target's current value.
2. Record a scoped proposal and precondition.
3. Obtain an explicit review decision.
4. Apply the exact statement outside Memoria.
5. Read the target back and record the observed statement.

`record-application` marks verification true only when the observed statement hash exactly matches the approved statement.
