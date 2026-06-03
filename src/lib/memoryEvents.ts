import { createClient } from '@supabase/supabase-js';
import { getPineconeIndex, initPinecone } from '@/lib/pinecone';

export type DeletedMemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  created_at: string;
};

export function getSupabaseServerConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase credentials not configured on server');
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

export function createSupabaseServiceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseServerConfig();
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export async function hardDeleteMemoryEvent(id: string) {
  const supabase = createSupabaseServiceClient();
  const { data: existingEvent, error: selectError } = await supabase
    .from('memory_events')
    .select('id, source, kind, summary, created_at')
    .eq('id', id)
    .single();

  if (selectError || !existingEvent) {
    return {
      found: false as const,
      status: 404,
      error: 'Memory event not found',
    };
  }

  let pineconeDeleted = false;
  let pineconeError: string | null = null;

  try {
    await initPinecone();
    const index = await getPineconeIndex();
    await index.deleteMany({ ids: [id] });
    pineconeDeleted = true;
  } catch (error) {
    pineconeError = error instanceof Error ? error.message : String(error);
    console.error('Pinecone delete failed for memory event:', error);
  }

  const { error: deleteError } = await supabase
    .from('memory_events')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return {
      found: true as const,
      status: 500,
      error: deleteError.message,
      event: existingEvent as DeletedMemoryEvent,
      pineconeDeleted,
      pineconeError,
    };
  }

  return {
    found: true as const,
    status: 200,
    event: existingEvent as DeletedMemoryEvent,
    pineconeDeleted,
    pineconeError,
  };
}
