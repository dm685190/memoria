# Memory Capture

Use this repo-local wrapper after meaningful Robin Cloud work:

```bash
cat > /tmp/robin-memory-metadata.json <<'JSON'
{"verified":"npm run build"}
JSON
npm run memory:capture -- --kind deployment --summary "Search UI deployed and verified" --metadata-file /tmp/robin-memory-metadata.json
```

Capture only durable events:

- deployments and production verification
- decisions
- errors and fixes
- milestones
- handoffs

Do not capture routine heartbeat/check-in/debug sediment.

The wrapper adds `project=robin-cloud`, current git `commit`, and current `branch` automatically. Use `--metadata-file` for anything beyond very simple metadata; npm/shell quoting is a hungry little monster, then calls the workspace-level protected Robin Cloud ingestion helper.
