# Memoria design register

This file records proposals before they become code or policy. Append; do not rewrite history.

## 2026-11-02 — foundation

Accepted for prototype:

- SQLite + FTS5, local filesystem captures, standard library only.
- Obsidian-native wikilinks become graph edges.
- Evidence packets are bounded and cited.
- Promotion into Hermes/Honcho is proposal-only.

Open questions:

1. Which note roots are authorized for capture?
2. What curation policy promotes a proposal into Hermes memory versus a Honcho conclusion?
3. When lexical/entity retrieval fails, should local embeddings be evaluated before any hosted model?
4. Should event ingestion be CLI-only, an authenticated local HTTP service, or a Hermes tool adapter?
5. What retention classes apply to incident evidence versus routine telemetry?

Rejected for now:

- Hosted vector databases.
- Automatic synchronization of raw conversations.
- Automatically updating Hermes or Honcho from a search result.
- Deployment before the information model and access boundary are reviewed.
