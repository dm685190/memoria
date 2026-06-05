# AGENTS.md - Memoria AI Agent Guide

This file instructs AI agents (including yourself) on how to work with the Memoria stack safely and effectively.

## 1. Stack Overview

Memoria is a private memory/dashboard built with:

- **Next.js 13 (App Router)** – React framework for UI and API routes.
- **Clerk** – Authentication for dashboard users.
- **Supabase** – Source-of-truth Postgres database (`memory_events` table).
- **Pinecone** – Vector store for semantic search of active memory summaries.
- **Resend** – Transactional email (optional, not core to memory).
- **Upstash Redis** – Lightweight server-side cache/state.
- **OpenAI** – Optional LLM helpers (not source of truth).
- **Vercel** – Hosting, serverless API runtime, CI/CD.
- **1Password** – Stores admin token locally for agent/local wrappers wrappers.

All secrets (Supabase service role, Pinecone key, Resend key, Upstash token, OpenAI key, admin token) **must remain server‑only**. Never expose them to the browser.

## 2. Local Development

### Prerequisites

- Node.js (≥18) and npm.
- A `.env.local` file (not committed) with the required variables.
  - You can copy the example from `/.env.example` if present, or retrieve secrets from 1Password (`your password manager vault`).

### Setup

```bash
npm install
```

### Environment Variables

Create `.env.local` (gitignored) with:

```
# Next.js
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase (server‑only)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Pinecone (server‑only)
PINECONE_API_KEY=
PINECONE_INDEX_NAME=memoria-events-1024
PINECONE_EMBEDDING_MODEL=llama-text-embed-v2

# Resend (server‑only)
RESEND_API_KEY=

# Upstash (server‑only)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# OpenAI (server‑only, optional)
OPENAI_API_KEY=

# Admin token for protected routes (server‑only)
ADMIN_TASK_TOKEN=
```

### Run Dev Server

```bash
npm run dev
```

Open <http://localhost:3000>.

### Lint & Typecheck

```bash
npm run lint
npm run build   # production build; will warn if only NEXT_PUBLIC_* are missing locally
```

## 3. Working with the Database

- The canonical table is `public.memory_events` in Supabase.
- Row Level Security (RLS) is **enabled**; anonymous/public reads are blocked.
- Server‑side code (API routes) uses the service role key to bypass RLS.
- Never write SQL that disables RLS or attempts to write from the client.

## 4. API Routes

All API routes live under `/src/app/api/`.

### Public / Dashboard‑Safe (require Clerk auth)

- `GET /api/memory-events` – recent events for signed‑in users.
- `POST /api/search-memory` – semantic search (signed‑in).

### Admin / Protected (require `ADMIN_TASK_TOKEN`)

These are used by agent/local wrappers wrappers:

- `POST /api/admin/memory-events` – ingest a memory event.
- `DELETE /api/admin/memory-events` – archive or hard‑delete.
- `PATCH /api/admin/memory-events` – restore.
- `POST /api/admin/recall-memory` – compact recall for agents.
- `POST /api/admin/memory-maintenance` – retention/cleanup.

## 5. Adding a New Memory Kind

1. Edit `docs/stack.md` → “Normalized memory kinds” table.
2. (Optional) Update the Memory Lenses UI if you want a one‑click filter.
3. Ensure any new kind is reflected in the dashboard filters (`src/app/(dashboard)/_components/MemoryLenses.tsx` or similar).
4. Update `docs/search.md` if the kind affects search examples.

## 6. Capturing Memories (for AI agents)

Use the provided wrapper to record durable events:

```bash
# Example from memory-capture.md
cat > /tmp/memoria-metadata.json <<'JSON'
{"verified":"npm run build"}
JSON
npm run memory:capture -- --kind deployment --summary "Search UI deployed and verified" --metadata-file /tmp/memoria-metadata.json
```

The wrapper automatically adds:
- `project=memoria`
- current git `commit`
- current git `branch`

Call it only for high‑signal events: deployments, decisions, errors/fixes, milestones, handoffs, system state. Do **not** capture routine heartbeats or debug noise.

## 7. Avoiding Token Bloat & Leaks

- Never log full request bodies or environment variables.
- When debugging, log only non‑secret identifiers (e.g., event ID, kind).
- In API routes, validate incoming data before using it.
- Keep server‑only keys out of any client‑side bundle (Next.js will automatically strip `NEXT_PUBLIC_*` from the client build; everything else stays in the server bundle).

## 8. Testing Protected Routes Locally

You can test admin routes with `curl`:

```bash
ADMIN_TOKEN=$(op item get "Memoria Vercel App Admin Token" --fields credential --vault="your password manager vault")
curl -s -X POST http://localhost:3000/api/admin/memory-events \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"test","kind":"decision","summary":"Test decision from AI agent"}'
```

## 9. Updating Documentation

- Keep `docs/stack.md` current: it is the single source of truth for the stack map.
- When you add a new service or change a responsibility, update the section.
- If you change environment variable names, update `.env.example` (if exists) and the Local Development section.
- After UI changes, consider adding a screenshot to `docs/` (optional).

## 10. Safety Rules for AI Agents

- **Do not** attempt to read or log secrets.
- **Do not** write directly to Supabase from the browser; always go through an API route.
- **Do not** disable RLS in Supabase.
- **Do not** commit `.env*` files.
- **Do not** push changes that break the lint or build.
- **Do not** create a new memory kind without updating the docs and UI filters.
- **Do not** store long‑form notes in Memoria; use Obsidian for that.

## 11. Where Obsidian Fits

Obsidian (`~/Obsidian/YourVault`) is the human‑readable vault for long‑form notes, plans, runbooks, and research. It is **not** queried by Memoria APIs. Use it to store context that is too large, too structured, or too narrative for a single memory event. When an Obsidian note becomes a durable decision, handoff, etc., summarize it into Memoria via the memory‑capture wrapper.

## 12. Getting Help

- Check the Vercel deployment logs: <https://vercel.com/dm685190/memoria/deploys>
- Look at the admin token in 1Password (`your password manager vault → Memoria Vercel App Admin Token`).
- For Supabase/Pinecone/Resend/Upstash, consult their respective dashboards (access via 1Password or shared vault).

Remember: the stack is designed so that the agent can interact with it **without ever seeing a secret**. Use the provided wrappers and admin token for machine‑to‑machine calls.

---
*This file is treated as authoritative context for AI agents working on this repository.*