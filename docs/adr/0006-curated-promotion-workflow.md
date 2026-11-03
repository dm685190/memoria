# ADR 0006: Keep promotion curated and externally applied

Status: accepted

## Decision

A promotion candidate names its Hermes or Honcho target, target profile, conflict key, precondition, rationale, and optional evidence event. One append-only review approves or rejects it. Memoria never applies it. After an external operator applies and reads back the target, Memoria records the observed statement and exact-hash verification result.

## Consequences

Memoria cannot silently mutate canonical memory or inferred identity. Conflicting unreviewed proposals are refused. Application records can show failure without erasing it. Integration remains deliberately slower than corruption.
