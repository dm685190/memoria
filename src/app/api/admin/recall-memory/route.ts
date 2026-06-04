import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getEmbedding, getPineconeIndex, initPinecone } from '@/lib/pinecone';
import { createSupabaseServiceClient } from '@/lib/memoryEvents';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
};

type RecallBody = {
  query?: unknown;
  limit?: unknown;
  filters?: unknown;
  minScore?: unknown;
  includeArchived?: unknown;
  includeMetadata?: unknown;
};

const MAX_QUERY_LENGTH = 500;
const MAX_LIMIT = 12;

function cleanQuery(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing required field: query');
  }

  const query = value.trim();
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query exceeds ${MAX_QUERY_LENGTH} characters`);
  }

  return query;
}

function cleanLimit(value: unknown) {
  const requested = typeof value === 'number' ? value : Number(value) || 5;
  return Math.max(1, Math.min(Math.floor(requested), MAX_LIMIT));
}

function cleanFilters(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { source: '', kind: '' };
  }

  const filters = value as Record<string, unknown>;
  return {
    source: typeof filters.source === 'string' ? filters.source.trim() : '',
    kind: typeof filters.kind === 'string' ? filters.kind.trim() : '',
  };
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export async function POST(request: Request) {
  try {
    const auth = requireAdmin(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = (await request.json().catch(() => ({}))) as RecallBody;
    const query = cleanQuery(body.query);
    const limit = cleanLimit(body.limit);
    const filters = cleanFilters(body.filters);
    const minScore = typeof body.minScore === 'number' ? body.minScore : Number(body.minScore) || 0;
    const includeArchived = body.includeArchived === true;
    const includeMetadata = body.includeMetadata === true;

    const embedding = await getEmbedding(query, 'query');
    await initPinecone();
    const index = await getPineconeIndex();

    const searchResults = await index.query({
      vector: embedding,
      topK: Math.min(limit * 5, 60),
      includeMetadata: false,
    });

    const ids = searchResults.matches.map((match) => match.id).filter(Boolean);
    const matchById = new Map(searchResults.matches.map((match) => [match.id, match]));

    let events: MemoryEvent[] = [];
    if (ids.length > 0) {
      let eventQuery = createSupabaseServiceClient()
        .from('memory_events')
        .select('*')
        .in('id', ids);

      if (!includeArchived) {
        eventQuery = eventQuery.is('archived_at', null);
      }

      if (filters.source) eventQuery = eventQuery.eq('source', filters.source);
      if (filters.kind) eventQuery = eventQuery.eq('kind', filters.kind);

      const { data, error } = await eventQuery;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      events = (data ?? []) as MemoryEvent[];
    }

    const memories = events
      .map((event) => {
        const match = matchById.get(event.id);
        return {
          id: event.id,
          score: match?.score ?? 0,
          source: event.source,
          kind: event.kind,
          created_at: event.created_at,
          archived: Boolean(event.archived_at),
          summary: truncate(event.summary, 1200),
          ...(includeMetadata ? { metadata: event.metadata ?? {} } : {}),
        };
      })
      .filter((event) => event.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const context = memories.map((memory, index) => {
      const archived = memory.archived ? ' archived=true' : '';
      return `[${index + 1}] (${memory.source}/${memory.kind} score=${memory.score.toFixed(3)} created=${memory.created_at}${archived}) ${memory.summary}`;
    }).join('\n');

    return NextResponse.json({
      query,
      count: memories.length,
      memories,
      context,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith('Missing required field') || message.includes('exceeds') ? 400 : 500;
    console.error('Error in admin recall-memory:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
