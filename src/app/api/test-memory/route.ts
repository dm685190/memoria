import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initPinecone, getPineconeIndex, getEmbedding } from '@/lib/pinecone';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(request: Request) {
  try {
    const auth = requireAdmin(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured on server' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Create a test memory event
    const testEvent = {
      source: 'test',
      kind: 'vector_search_test',
      summary: 'This is a test memory event for verifying Pinecone vector search functionality',
      metadata: {
        test: true,
        purpose: 'vector_search_verification'
      },
      created_at: new Date().toISOString(),
    };

    // Insert into Supabase
    const { data: insertedEvent, error: insertError } = await supabase
      .from('memory_events')
      .insert([testEvent])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Generate embedding for the summary
    let embedding: number[] = [];
    try {
      embedding = await getEmbedding(testEvent.summary);
    } catch (embedError) {
      console.warn('Failed to generate embedding for test event:', embedError);
      // Still return the event even if embedding fails
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
            }
          }
          ]
        });
      } catch (pineconeError) {
        console.error('Error upserting test event to Pinecone:', pineconeError);
        // Don't fail the request if Pinecone fails
        return NextResponse.json({ 
          event: insertedEvent,
          warning: 'Event saved to Supabase but failed to upsert to Pinecone',
          pineconeError: pineconeError instanceof Error ? pineconeError.message : String(pineconeError)
        });
      }
    }

    return NextResponse.json({ 
      event: insertedEvent,
      message: 'Test memory event created successfully',
      pineconeUpserted: embedding.length > 0
    });
  } catch (err) {
    console.error('Error in test-memory:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}