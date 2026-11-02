# SQLite schema

## Immutable evidence

`source_captures`: a source URI, body, SHA-256, and capture timestamp. A changed note creates a new row.

`ledger_events`: timestamped observations with kind, title, body, and source capture reference. They are never updated or deleted by the application.

## Graph

`entities`: normalized names for systems, projects, incidents, decisions, and people.

`event_entities`: joins evidence to entities.

`entity_edges`: a captured relation such as an Obsidian wikilink. Edges retain the capture that observed them.

## Derived work

`promotion_proposals`: candidate facts for Hermes/Honcho. Status starts as `proposed`; this software has no approved writer.

`event_search`: FTS5 index over event title/body. It is derivative and rebuildable from the ledger.

## Integrity

- `source_captures.sha256` identifies exact captured content.
- Event and edge rows reference their capture when applicable.
- Packet citations expose event id, source URI, SHA, and capture time.
