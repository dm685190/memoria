# Admin Memory Recall API

Protected endpoint for agent-facing Robin Cloud recall.

## Route

`POST /api/admin/recall-memory`

Requires `ADMIN_TASK_TOKEN` via either:

- `Authorization: Bearer <token>`
- `x-admin-task-token: <token>`

## Body

```json
{
  "query": "Robin Cloud archive retention",
  "limit": 5,
  "filters": { "source": "openclaw", "kind": "deployment" },
  "minScore": 0,
  "includeArchived": false,
  "includeMetadata": false
}
```

## Response

Returns both structured memories and a compact prompt-ready `context` string.

```json
{
  "query": "Robin Cloud archive retention",
  "count": 2,
  "memories": [
    {
      "id": "...",
      "score": 0.42,
      "source": "openclaw",
      "kind": "deployment",
      "created_at": "2026-06-04T00:07:23.364+00:00",
      "archived": false,
      "summary": "..."
    }
  ],
  "context": "[1] (openclaw/deployment score=0.420 created=...) ..."
}
```

## Notes

- This route is admin-only and uses server-side Supabase/Pinecone credentials.
- It is intended for compact assistant context retrieval, not dashboard browsing.
- Archived memories are excluded by default.
- Results are capped at 12 memories and summaries are truncated to keep prompt context small.
