import { NextResponse } from 'next/server';
import { initPinecone, getPineconeIndex, getEmbedding } from '@/lib/pinecone';
import { createClient } from '@supabase/supabase-js';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, any>;
  created_at: string;
};

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
    const { query, limit = 10, filters, minScore = 0 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    // Generate embedding for the query
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await getEmbedding(query, 'query');
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
      topK: filters && typeof filters === 'object' ? Math.min(Number(limit) * 4 || 40, 100) : Number(limit) || 10,
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

    const matchById = new Map(searchResults.matches.map((match: any) => [match.id, match]));

    // Apply filtering if filters provided. Only allow safe top-level fields.
    if (filters && typeof filters === 'object') {
      events = events.filter(event => {
        const source = typeof filters.source === 'string' ? filters.source : '';
        const kind = typeof filters.kind === 'string' ? filters.kind : '';
        return (!source || event.source === source) && (!kind || event.kind === kind);
      });
    }

    const minimumScore = typeof minScore === 'number' ? minScore : Number(minScore) || 0;

    // Format results with scores
    const results = events.map(event => {
      // Find the corresponding score from Pinecone matches
      const match = matchById.get(event.id) as any;
      return {
        ...event,
        score: match ? match.score : 0,
      };
    }).filter(event => (event.score || 0) >= minimumScore);

    // Sort by score descending and return requested result count after filtering.
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    const limitedResults = results.slice(0, Number(limit) || 10);

    return NextResponse.json({
      query,
      results: limitedResults,
      count: limitedResults.length,
    });
  } catch (err) {
    console.error('Error in search-memory:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}