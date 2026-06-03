import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initPinecone, getPineconeIndex, getEmbedding } from '@/lib/pinecone';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, any>;
  created_at: string;
};

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured on server' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data, error } = await supabase
      .from('memory_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: (data as MemoryEvent[]) ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured on server' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Parse request body
    const body = await request.json();
    const { source, kind, summary, metadata } = body;

    if (!source || !kind || !summary) {
      return NextResponse.json(
        { error: 'Missing required fields: source, kind, summary' },
        { status: 400 }
      );
    }

    // Insert into Supabase
    const { data: insertedEvent, error: insertError } = await supabase
      .from('memory_events')
      .insert([
        {
          source,
          kind,
          summary,
          metadata: metadata || {},
          created_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Generate embedding for the summary
    let embedding: number[] = [];
    try {
      embedding = await getEmbedding(summary);
    } catch (embedError) {
      console.warn('Failed to generate embedding, continuing without Pinecone upsert:', embedError);
      // Continue anyway - we still saved to Supabase
    }

    // Upsert to Pinecone if we have an embedding
    if (embedding.length > 0) {
      try {
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
              // metadata_json: JSON.stringify(insertedEvent.metadata || {}),
            }
          }
          ]
        });
      } catch (pineconeError) {
        console.error('Error upserting to Pinecone:', pineconeError);
        // Don't fail the request if Pinecone fails
      }
    }

    return NextResponse.json({ event: insertedEvent });
  } catch (err) {
    console.error('Error in POST memory-events:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}