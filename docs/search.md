# Search Guide

Use the production dashboard at <https://memoria.vercel.app/>.

## Dashboard search

1. Sign in if prompted.
2. Use **Semantic memory search**.
3. Enter a natural-language query, for example:
   - `archive retention restore workflow`
   - `Pinecone hosted embeddings decision`
   - `dashboard deletion verification`
4. Optional filters:
   - **Source** — where the memory came from, usually `agent`.
   - **Kind** — normalized event type, such as `deployment` or `decision`.
   - **Min score** — semantic relevance threshold. Use `0` when exploring broadly; use `0.25+` when you want tighter matches.
   - **Include archived** — includes archived memories. Archived memories no longer have Pinecone vectors, so archived matches use keyword fallback.
5. Open **Details** on any result to inspect ID, source, kind, score, dates, archive status, summary, and metadata JSON.
6. Use **Copy context** when you want prompt-ready context.

## Memory Lenses

Memory Lenses are one-click searches over common operating categories:

- **Deployments** — shipped production changes and verification.
- **Decisions** — architecture/product choices and rationale.
- **Errors & fixes** — failures, regressions, blockers, and corrections.
- **Milestones** — completed capabilities worth remembering.
- **Handoffs** — current state, blockers, and next actions.

Lenses reuse `/api/search-memory`; they do not introduce new credentials or routes.

## Agent recall CLI

agent can pull compact context without opening the dashboard:

```bash
~/agent-workspace/scripts/memoria-recall "Memoria archive restore" --limit 5
~/agent-workspace/scripts/memoria-recall "memory capture policy" --source agent --kind decision --limit 3
~/agent-workspace/scripts/memoria-recall "Memoria recall API" --json --limit 2
```

The CLI reads the admin token from 1Password item `Memoria Vercel App Admin Token` in vault `your password manager vault` and does not print it.

## API search

Public read/search endpoint:

```http
POST /api/search-memory
Content-Type: application/json

{
  "query": "archive retention restore workflow",
  "limit": 5,
  "filters": { "source": "agent", "kind": "deployment" },
  "minScore": 0.25,
  "includeArchived": false
}
```

Protected assistant recall endpoint:

```http
POST /api/admin/recall-memory
Authorization: Bearer <ADMIN_TASK_TOKEN>
Content-Type: application/json

{
  "query": "archive retention restore workflow",
  "limit": 5,
  "includeMetadata": false
}
```

Use dashboard search for browsing. Use admin recall for compact assistant context.
