import { NextResponse } from 'next/server';
import { Configuration, OpenAIApi } from 'openai';
import { initPinecone, getPineconeIndex } from '@/lib/pinecone';
import { createClient } from '@supabase/supabase-js';

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

    // Parse request body
    const body = await request.json();
    const { query, limit = 10, filters } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    // Generate embedding for the query
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await getEmbedding(query);
    } catch (embedError) {
      return NextResponse.json(
        { error: 'Failed to generate query embedding' },
        { status: 500 }
      );
    }

    // Initialize Pinecone
    await initPinecone();
    const index = await getPineconeIndex();

    // Prepare Pinecone query with optional metadata filters
    const pineconeQuery: any = {
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
    };

    // Note: Pinecone metadata filtering is limited. We'll do post-filtering for now.
    // For more advanced filtering, we can use Pinecone's metadata filtering if needed.
    // For simplicity, we'll fetch more results and filter client-side if filters are provided.

    // Search Pinecone
    const searchResults = await index.query(pineconeQuery);

    // Extract IDs from Pinecone results
    const ids = searchResults.matches.map((match: any) => match.id);

    // Fetch full records from Supabase
    let events: MemoryEvent[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('memory_events')
        .select('*')
        .in('id', ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      events = data as MemoryEvent[];
    }

    // Apply client-side filtering if filters provided
    if (filters && typeof filters === 'object') {
      events = events.filter(event => {
        for (const [key, value] of Object.entries(filters)) {
          if (event[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    // Format results with scores
    const results = events.map(event => {
      // Find the corresponding score from Pinecone matches
      const match = searchResults.matches.find((m: any) => m.id === event.id);
      return {
        ...event,
        score: match ? match.score : 0,
      };
    });

    // Sort by score descending
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    return NextResponse.json({
      query,
      results,
      count: results.length,
    });
  } catch (err) {
    console.error('Error in search-memory:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}