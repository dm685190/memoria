# INSTRUCTIONS.md - For AI Agents Implementing the Robin Cloud Stack

This document gives concise, actionable steps for any AI agent (including future versions of yourself) to set up, develop, and deploy the Robin Cloud stack safely.

## ✅ Prerequisites
- Access to the GitHub repo: `git@github.com:dm685190/robin-cloud.git`
- Ability to read secrets from 1Password vault `Robin Vault` (look for items prefixed with "Robin Cloud").
- Node.js ≥18 and npm installed locally.

## 🛠️ Local Setup
1. Clone the repo (if not already):
   ```bash
   git clone git@github.com:dm685190/robin-cloud.git
   cd robin-cloud
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file (gitignored) with the following variables (values from 1Password):
   ```
   # Next.js public (safe for client)
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=

   # Supabase (server‑only)
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=

   # Pinecone (server‑only)
   PINECONE_API_KEY=
   PINECONE_INDEX_NAME=robin-memory-events-1024   # or as configured
   PINECONE_EMBEDDING_MODEL=llama-text-embed-v2

   # Resend (server‑only, optional)
   RESEND_API_KEY=

   # Upstash Redis (server‑only)
   UPSTASH_REDIS_REST_URL=
   UPSTASH_REDIS_REST_TOKEN=

   # OpenAI (server‑only, optional)
   OPENAI_API_KEY=

   # Admin token for protected routes (server‑only)
   ADMIN_TASK_TOKEN=
   ```
   > **Never** commit `.env.local`. Never log these values.

## 🧪 Development Workflow
- Start the dev server: `npm run dev`
- Visit <http://localhost:3000> to see the dashboard.
- Lint: `npm run lint`
- Build for production: `npm run build` (will warn if only `NEXT_PUBLIC_*` are set locally – that’s expected).

## 📦 API Routes Overview
All routes are under `/src/app/api/`.

### Public / Dashboard‑Safe (require Clerk auth)
- `GET /api/memory-events` → recent events
- `POST /api/search-memory` → semantic search

### Admin / Protected (require `ADMIN_TASK_TOKEN`)
Used by Hermes/OpenClaw wrappers:
- `POST /api/admin/memory-events` → ingest a memory event
- `DELETE /api/admin/memory-events` → archive or hard‑delete
- `PATCH /api/admin/memory-events` → restore
- `POST /api/admin/recall-memory` → compact recall for agents
- `POST /api/admin/memory-maintenance` → retention/cleanup

## 💾 Capturing Durable Events (AI Agents)
To record a high‑signal memory (deployment, decision, error/fix, milestone, handoff, system state):

```bash
# Create metadata JSON if needed
cat > /tmp/robin-memory-metadata.json <<'JSON'
{"verified":"npm run build"}
JSON
# Run the capture wrapper
npm run memory:capture -- --kind <deployment|decision|error|milestone|handoff|system|note> \
  --summary "Short human‑readable summary" \
  --metadata-file /tmp/robin-memory-metadata.json
```
The wrapper automatically adds:
- `project=robin-cloud`
- current git `commit`
- current git `branch`

Only call this for durable events. Do **not** capture routine heartbeats or debug noise.

## 🔐 Security Rules (Non‑Negotiable)
1. **Never** expose server‑only keys to the browser.
   - Only variables prefixed with `NEXT_PUBLIC_` may reach the client.
   - Supabase service role, Pinecone key, Resend key, Upstash token, OpenAI key, and `ADMIN_TASK_TOKEN` must stay in server‑only code or environment.
2. **Never** disable Row Level Security (RLS) on Supabase.
3. **Never** write raw SQL that bypasses the API layer.
4. **Never** commit `.env*` files or any file containing secrets.
5. **Never** log full request bodies, headers, or environment variables.
6. **Never** push code that fails `npm run lint` or `npm run build`.

## 📓 Where Obsidian Fits
- Path: `/home/caretaker/Obsidian/RobinVault`
- Role: human‑readable vault for long‑form notes, plans, runbooks, research, and narrative context.
- **Not** queried by Robin Cloud APIs.
- Use Obsidian for context too large, too structured, or too narrative for a single memory event.
- When an Obsidian note becomes a durable decision, handoff, etc., summarize it into Robin Cloud via the capture wrapper above.

## 🚀 Deployment
The repo is hooked to Vercel. Pushes to `main` trigger a preview/deployment.
- To deploy manually: `vercel --prod` (requires Vercel CLI linked to the repo).
- Check build and runtime logs at <https://vercel.com/dm685190/robin-cloud/deploys>.
- If a deploy fails, inspect the logs for missing env vars or runtime exceptions.

## 📚 Documentation
- Keep `docs/stack.md` up to date – it is the canonical stack map.
- When adding a new service or changing a responsibility, update that file.
- If you add a new memory kind, update the “Normalized memory kinds” table in `docs/stack.md` and consider adding a UI lens.

## ❓ Getting Help
- Check the admin token in 1Password: `Robin Vault → Robin Cloud Vercel App Admin Token`.
- Verify Supabase/Pinecone/Resend/Upstash dashboards via shared access or 1Password.
- For Vercel-specific issues, consult the Vercel dashboard linked above.

---
*Treat this file as a starting point. When in doubt, refer to the existing code, `AGENTS.md`, and the stack documentation.*