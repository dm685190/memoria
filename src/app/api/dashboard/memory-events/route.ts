import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmbedding, getPineconeIndex, initPinecone } from '@/lib/pinecone';

const MAX_SUMMARY_LENGTH = 8000;
const MAX_FIELD_LENGTH = 120;

type MemoryEventBody = {
  source?: unknown;
  kind?: unknown;
  summary?: unknown;
  metadata?: unknown;
};

function cleanString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }

  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }

  return cleaned;
}

function cleanMetadata(value: unknown) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('metadata must be an object');
  }

  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured on server' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as MemoryEventBody;
    const source = cleanString(body.source, 'source', MAX_FIELD_LENGTH);
    const kind = cleanString(body.kind, 'kind', MAX_FIELD_LENGTH);
    const summary = cleanString(body.summary, 'summary', MAX_SUMMARY_LENGTH);
    const metadata = {
      ...cleanMetadata(body.metadata),
      captured_by: 'dashboard',
      clerk_user_id: userId,
    };

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: insertedEvent, error: insertError } = await supabase
      .from('memory_events')
      .insert([
        {
          source,
          kind,
          summary,
          metadata,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    let pineconeUpserted = false;
    let pineconeError: string | null = null;

    try {
      const embedding = await getEmbedding(summary, 'passage');
      await initPinecone();
      const index = await getPineconeIndex();
      await index.upsert({
        records: [
          {
            id: insertedEvent.id,
            values: embedding,
            metadata: {
              source: insertedEvent.source,
              kind: insertedEvent.kind,
              summary: insertedEvent.summary,
              created_at: insertedEvent.created_at,
            },
          },
        ],
      });
      pineconeUpserted = true;
    } catch (error) {
      pineconeError = error instanceof Error ? error.message : String(error);
      console.error('Dashboard memory saved but Pinecone upsert failed:', error);
    }

    return NextResponse.json({
      event: insertedEvent,
      pineconeUpserted,
      ...(pineconeError ? { warning: 'Event saved to Supabase but Pinecone upsert failed', pineconeError } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith('Missing required field') || message.includes('exceeds') || message.includes('metadata') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
