import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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