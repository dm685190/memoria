# SQLite schema

Schema version: 2.

## Source history

`source_captures` stores one exact body per URI/SHA-256 pair.

`source_revisions` records chronological observations and a `supersedes_revision_id`. Reusing earlier content creates a new revision while reusing the content blob. Current state is the latest revision for a URI; no old row is updated.

## Evidence ledger

`ledger_events` stores occurrence time, creation time, content, optional source/revision citations, previous hash, and event hash.

`event_search` is a derivative FTS5 index populated only by insert trigger. `verify` compares its row count with the ledger.

## Graph

`entities` uses normalized unique names. Obsidian source identity is `obsidian:<vault-relative-path-without-extension>`.

`event_entities` and `entity_edges` connect evidence and captured wikilinks. Edge uniqueness is revision-scoped, so a changed or reverted note records a new observation even when it reuses an older content capture.

## Promotion workflow

`promotion_proposals` names target layer/profile, exact statement/hash, conflict key, precondition, rationale, and evidence.

`promotion_reviews` records one append-only approved/rejected decision with reviewer and time.

`promotion_applications` records external actor/time, observed read-back text/hash, and exact-match verification. It does not perform the application.

## Access policy

`root_authorizations` is an append-only grant/revoke stream. The latest event for an exact resolved URI determines whether ingestion is allowed.

## Enforcement

UPDATE and DELETE triggers protect source, revision, ledger, graph-join, root-authorization, proposal, review, and application tables. Corrections are new rows. Schema migration installs the same controls after backfilling legacy prototype rows and event hashes.
