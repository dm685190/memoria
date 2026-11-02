# ADR 0001: Start with local SQLite and FTS5

Status: accepted, prototype.

Memoria will use SQLite and FTS5 before vector search or remote storage.

Reasons:

- Evidence, indexing, and query execution remain local.
- SQLite is inspectable, portable, and transactional.
- Entity filters, timestamps, and exact text search are explainable.
- The smallest useful design avoids an embedding model, remote API, and deployment surface.

Consequences:

- Semantic recall is intentionally deferred.
- Retrieval quality must be measured before adding embeddings.
- Database backups and retention policy remain a design question, not an implied deployment.
