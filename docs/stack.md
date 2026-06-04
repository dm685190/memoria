# Stack Map

Robin Cloud is a private memory and observability-adjacent dashboard for OpenClaw/Robin work.

## Sites and services

### Robin Cloud

- Site: <https://robin-cloud.vercel.app/>
- Role: signed-in dashboard for memory search, ingestion, inspection, archive/restore, and operational status.
- Code: Next.js app-router project in this repository.

### GitHub

- Site: <https://github.com/dm685190/robin-cloud>
- Role: source control, change history, reviewable docs, deploy trigger for Vercel.
- Watch for: commits, diffs, README/docs, CI/deploy hooks.

### Vercel

- Site: <https://vercel.com/>
- Role: hosting, deployments, serverless API runtime, environment variables, build/runtime logs.
- Watch for: deployment failures, runtime exceptions, missing env vars, domain issues.

### Clerk

- Site: <https://dashboard.clerk.com/>
- Role: dashboard authentication and signed-in user sessions.
- Used by: dashboard ingestion, archive, restore routes.
- Watch for: sign-in/session failures, allowed users, auth middleware behavior.

### Supabase

- Site: <https://supabase.com/dashboard>
- Role: source-of-truth database.
- Key table: `memory_events`.
- Stores: source, kind, summary, metadata, created time, archive fields.
- Security: accessed by server-side service role from API routes; do not expose service role to browser code.

### Pinecone

- Site: <https://app.pinecone.io/>
- Role: hosted embeddings and vector search.
- Index: `robin-memory-events-1024`.
- Model: `llama-text-embed-v2`.
- Dimension: `1024`.
- Stores: active memory vectors and compact metadata.
- Note: archived memories have vectors removed immediately; archived dashboard search uses Supabase keyword fallback until restored.

### Resend

- Site: <https://resend.com/emails>
- Role: transactional email delivery.
- Plain English: Resend is the service Robin Cloud calls when it needs to send an email. It is like Stripe for email delivery: the app sends Resend an API request, and Resend handles the actual outbound email, delivery status, and provider errors.
- Used by: `/api/send-email` and the signed-in email test surface.
- Current importance: useful for testing/notifications; not part of memory storage or semantic search.
- Watch for: delivery failures, sandbox/verified-recipient limits, API key validity, sender/domain issues.

### Upstash Redis

- Site: <https://console.upstash.com/>
- Role: lightweight Redis state/cache for app/runtime features.
- Watch for: REST token validity, rate limits, missing env vars.

### 1Password

- Role: local secret retrieval for OpenClaw/Hermes tooling.
- Important item: `Robin Cloud Vercel App Admin Token` in vault `Robin Vault`.
- Used by: local recall/capture tooling to call protected admin routes without printing tokens.

### Hermes workspace

- Path: `/home/caretaker/.hermes`
- Role: current local operator environment, helper scripts, memory notes, recall/capture wrappers.
- Useful scripts:
  - `/home/caretaker/.hermes/scripts/robin-memory-recall`
  - `/home/caretaker/.hermes/scripts/robin-memory-capture`
- Default capture source: `hermes`.

### OpenClaw workspace

- Path: `/home/caretaker/.openclaw/workspace`
- Role: legacy/cutover operator environment, original helper scripts, memory notes, recall/capture wrappers.
- Useful legacy scripts:
  - `/home/caretaker/.openclaw/workspace/scripts/robin-memory-recall`
  - `/home/caretaker/.openclaw/workspace/scripts/robin-memory-capture`
- Default legacy capture source: `openclaw`.

## Route map

### Public/dashboard-safe reads

- `GET /api/memory-events` — protected recent memory events and taxonomy for signed-in dashboard users or admin-token callers.
- `POST /api/search-memory` — protected semantic active search plus archived keyword fallback for signed-in dashboard users or admin-token callers.

### Public write status

- `POST /api/memory-events` — intentionally disabled; returns `410`.

### Signed-in dashboard routes

- `POST /api/dashboard/memory-events` — create memory from dashboard.
- `DELETE /api/dashboard/memory-events` — archive memory.
- `PATCH /api/dashboard/memory-events` — restore memory.

### Admin-token routes

- `POST /api/admin/memory-events` — protected ingestion.
- `DELETE /api/admin/memory-events` — protected archive/hard-delete behavior.
- `PATCH /api/admin/memory-events` — protected restore.
- `POST /api/admin/memory-maintenance` — retention/cleanup.
- `POST /api/admin/recall-memory` — protected compact recall for agents.

## Data lifecycle

1. A memory is created by dashboard or protected admin ingestion.
2. Summary text is embedded with Pinecone hosted embeddings.
3. Supabase stores the full event.
4. Pinecone stores the active vector.
5. Search queries embed the query and search Pinecone.
6. Full rows are fetched from Supabase for display.
7. Archive removes the Pinecone vector and marks archive fields in Supabase.
8. Restore clears archive fields and rebuilds the Pinecone vector.
9. Maintenance can hard-delete archived rows after retention.

## Normalized memory kinds

Use these `kind` values for clean filters and Memory Lenses:

- `deployment` — shipped code/config plus verification.
- `decision` — durable architecture/product/process choice and rationale.
- `error` — failure, regression, blocked workflow, or fix worth remembering.
- `milestone` — completed capability or project phase.
- `handoff` — current state, blockers, next step, verification notes.
- `system` — service/config/runtime state.
- `note` — useful context that does not fit the above.

Prefer one of these before inventing a new kind. The dashboard lenses depend on this taxonomy staying clean.
