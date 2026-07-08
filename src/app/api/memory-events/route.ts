import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '@/lib/adminAuth';
import { createSupabaseServiceClient } from '@/lib/memoryEvents';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    const supabase = createSupabaseServiceClient();
    let eventsQuery = supabase
      .from('memory_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!includeArchived) {
      eventsQuery = eventsQuery.is('archived_at', null);
    }

    const { data, error } = await eventsQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let taxonomyQuery = supabase
      .from('memory_events')
      .select('source, kind');

    if (!includeArchived) {
      taxonomyQuery = taxonomyQuery.is('archived_at', null);
    }

    const { data: taxonomyData, error: taxonomyError } = await taxonomyQuery;

    if (taxonomyError) {
      return NextResponse.json({ error: taxonomyError.message }, { status: 500 });
    }

    const sources = Array.from(
      new Set((taxonomyData ?? []).map((event) => event.source).filter(Boolean))
    ).sort();
    const kinds = Array.from(
      new Set((taxonomyData ?? []).map((event) => event.kind).filter(Boolean))
    ).sort();

    return NextResponse.json({
      events: (data as MemoryEvent[]) ?? [],
      taxonomy: { sources, kinds },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Memory ingestion moved to /api/admin/memory-events' },
    { status: 410 }
  );
}
