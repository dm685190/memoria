# Architecture

## Four truth layers

| Question | Layer | Mutation model |
|---|---|---|
| What must be exactly true? | Hermes internal memory | deliberately curated |
| How does the collaborator tend to work? | Honcho | inferred, curated conclusions |
| What happened, when, and what proves it? | Memoria | append-only evidence captures |
| What is true now? | live system check | observed at query time |

Memoria never outranks a live check or explicit canonical memory.

## Components

1. Capture: CLI captures a ledger event or Obsidian note snapshot.
2. Store: SQLite stores immutable observations, entities, graph edges, and curation proposals.
3. Retrieve: FTS5 ranks source-backed observations with optional entity and date filters.
4. Packet: a bounded, cited JSON packet is constructed for one task.
5. Promote: a proposal is recorded for human/policy review; no downstream memory is changed.

## Retrieval sequence

1. Read the task and identify entities/time window.
2. Search Memoria only for task-relevant evidence.
3. Apply the explicit packet character budget.
4. Verify actionable claims against live systems where applicable.
5. Curate only durable conclusions into Hermes/Honcho.

## Privacy boundary

The implementation has no network code. Note capture rejects common secret patterns. This is a guardrail, not a credential vault: secrets belong in 1Password or environment-backed secret stores.
