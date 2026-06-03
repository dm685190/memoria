import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Configuration, OpenAIApi } from 'openai';
import { initPinecone, getPineconeIndex } from '@/lib/pinecone';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, any>;
  created_at: string;
};

// Initialize OpenAI
const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY || '',
});
const openai = new OpenAIApi(openaiConfig);

// Generate embedding for text
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.createEmbedding({
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text,
    });
    return response.data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
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
        await index.upsert([
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
        ]);
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