# ADR 0002: No automatic promotion into Hermes or Honcho

Status: accepted, prototype.

Memoria may store a cited promotion proposal, but it must not write into Hermes internal memory or Honcho conclusions.

Reasons:

- A search result is evidence, not a durable fact.
- Hermes has a small canonical-memory budget.
- Honcho is inferential context, unsuitable for unreviewed operational claims.
- Explicit curation keeps provenance and intent visible.

A later integration must document authorization, target selection, conflict handling, and a read-back verification step.
