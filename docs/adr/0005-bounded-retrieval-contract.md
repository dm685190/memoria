# ADR 0005: Bound the complete serialized retrieval packet

Status: accepted

## Decision

Retrieval literalizes user terms, validates limits and timezone-aware date filters, uses FTS match-centered snippets, and emits contract-versioned compact JSON. `--max-chars` covers the entire serialized object: task, filters, citations, instructions, excerpts, and accounting fields.

## Consequences

Long metadata may leave no room for evidence and is rejected when the base envelope cannot fit. Retrieval returns snippets rather than full source bodies. Lexical/entity retrieval remains the first mechanism; embeddings are deferred until measured recall failures justify them.
