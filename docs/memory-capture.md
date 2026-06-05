# Memory Capture

Use this repo-local wrapper after meaningful Memoria work:

```bash
cat > /tmp/memoria-metadata.json <<'JSON'
{"verified":"npm run build"}
JSON
npm run memory:capture -- --kind deployment --summary "Search UI deployed and verified" --metadata-file /tmp/memoria-metadata.json
```

Capture only durable events:

- deployments and production verification
- decisions
- errors and fixes
- milestones
- handoffs

Do not capture routine heartbeat/check-in/debug sediment.

## Normalized kinds

Use these `--kind` values so dashboard filters and Memory Lenses stay useful:

- `deployment` — shipped code/config plus verification.
- `decision` — durable architecture/product/process choice and rationale.
- `error` — failure, regression, blocked workflow, or fix worth remembering.
- `milestone` — completed capability or project phase.
- `handoff` — current state, blockers, next step, verification notes.
- `system` — service/config/runtime state.
- `note` — useful context that does not fit the above.

Prefer one of these before inventing a new kind. The archive is patient, but taxonomy rot is forever. Fufufu.

The wrapper adds `project=memoria`, current git `commit`, and current `branch` automatically. Use `--metadata-file` for anything beyond very simple metadata; npm/shell quoting is a hungry little monster, then calls the workspace-level protected Memoria ingestion helper.
