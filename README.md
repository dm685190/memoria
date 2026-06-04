# Robin Cloud

Private memory/search dashboard for Robin/OpenClaw.

Robin Cloud stores high-signal memory events, makes them searchable by meaning, keeps sensitive credentials server-side, and exposes a signed-in dashboard for inspection, capture, archive/restore, and recall workflows.

## Production

- Dashboard: <https://robin-cloud.vercel.app/>
- Source: <https://github.com/dm685190/robin-cloud>
- Deployment/observability: <https://vercel.com/>

The dashboard uses Clerk sign-in. Admin/debug/maintenance/recall APIs require `ADMIN_TASK_TOKEN`; do not expose server secrets in browser code.

## What you can do

- Search active memories semantically.
- Use Memory Lenses for one-click views: deployments, decisions, errors/fixes, milestones, handoffs.
- Inspect full memory details and metadata.
- Copy compact context for prompts or handoff notes.
- Archive memories instead of deleting them immediately.
- Restore archived memories.
- Ingest new dashboard memories when signed in.
- Use protected recall for assistant context retrieval.

## Key docs

- [Search guide](docs/search.md)
- [Observability guide](docs/observability.md)
- [Stack map](docs/stack.md)
- [Memory capture](docs/memory-capture.md)
- [Admin recall API](docs/recall-memory.md)

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Verification

```bash
npm run build
npm run lint
```

Build may print local warnings if production-only environment variables are not present locally. That is expected as long as compilation/typecheck succeeds.

## Security model

- `memory_events` is read/written server-side with Supabase service-role credentials.
- Public memory ingestion is disabled.
- Dashboard writes require Clerk auth.
- Admin maintenance/recall/debug routes require `ADMIN_TASK_TOKEN`.
- Pinecone, Supabase, Resend, Upstash, and admin tokens remain server-only.
