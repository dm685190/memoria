# Observability Guide

## Primary production observability

Go to Vercel: <https://vercel.com/>

Use Vercel for:

- production deployment status
- build logs
- runtime/function logs
- environment variable configuration
- domain/routing status
- failed requests and serverless errors

Look for the `memoria` project under the GitHub-connected Vercel account/team.

## Service dashboards

- Memoria dashboard: <https://memoria.vercel.app/>
- GitHub repository: <https://github.com/dm685190/memoria>
- Supabase: <https://supabase.com/dashboard>
- Pinecone: <https://app.pinecone.io/>
- Clerk: <https://dashboard.clerk.com/>
- Resend: <https://resend.com/emails> — outbound email delivery and email test logs
- Upstash: <https://console.upstash.com/>

## What to check when something breaks

### Dashboard page broken

1. Vercel deployment status and latest build logs.
2. Vercel function logs for `/`, `/api/memory-events`, `/api/search-memory`.
3. Clerk dashboard if sign-in/session behavior is broken.

### Search returns errors or empty results unexpectedly

1. Vercel logs for `/api/search-memory`.
2. Pinecone index health and vector count.
3. Supabase `memory_events` table contents.
4. Environment variables in Vercel:
   - `PINECONE_API_KEY`
   - `PINECONE_INDEX_NAME`
   - `PINECONE_EMBEDDING_MODEL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### Recall CLI/API broken

1. Production `/api/admin/recall-memory` logs in Vercel.
2. Confirm `ADMIN_TASK_TOKEN` exists in Vercel.
3. Confirm 1Password item `Memoria Vercel App Admin Token` in vault `your password manager vault` is readable locally.
4. Confirm current Hermes wrapper works:
   - `scripts/memoria-recall "query" --source hermes --limit 3`
5. Confirm legacy agent wrapper only if investigating pre-cutover records:
   - `~/agent-workspace/scripts/memoria-recall "query" --source agent --limit 3`
6. Confirm Pinecone and Supabase credentials are still valid.

### Dashboard ingestion/archive/restore broken

1. Clerk auth/session in browser.
2. Vercel logs for `/api/dashboard/memory-events`.
3. Supabase service-role grants for `memory_events`.
4. Pinecone upsert/delete errors.

### Email test/send broken

Resend is only responsible for outbound email delivery. It does not store memory, run search, or host the dashboard.

1. Vercel logs for `/api/send-email`.
2. Resend activity/errors at <https://resend.com/emails>.
3. Check whether Resend is in sandbox/verified-recipient mode.
4. `RESEND_API_KEY` in Vercel.

## Local verification commands

```bash
npm run build
npm run lint
```

Production smoke tests:

```bash
# Unauthenticated memory listing must stay sealed.
curl -sS -o /tmp/memoria-events-body -w '%{http_code}\n' \
  https://memoria.vercel.app/api/memory-events

# Unauthenticated memory search must stay sealed.
curl -sS -o /tmp/memoria-search-body -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  --data '{"query":"deployment verification","limit":3,"minScore":0}' \
  https://memoria.vercel.app/api/search-memory

# Admin-token recall should still work via the local wrapper.
scripts/memoria-recall \
  "deployment verification" --source hermes --limit 3
```

Do not paste or print admin tokens in logs. Use 1Password reads or local wrappers when possible.
