import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createSupabaseServiceClient, getSupabaseServerConfig } from '@/lib/memoryEvents';

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const result = {
    config: {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseServiceRoleKey: !!supabaseServiceRoleKey,
      supabaseUrlLength: supabaseUrl?.length || 0,
      serviceRoleKeyLength: supabaseServiceRoleKey?.length || 0,
    },
    tableTests: {} as Record<string, { success?: boolean; rowCount?: number; error?: string; hint?: string; code?: string }>,
    error: null as string | null,
  };

  try {
    getSupabaseServerConfig();
    const supabase = createSupabaseServiceClient();

    for (const tableName of ['memory_events', 'health_checks']) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      result.tableTests[tableName] = error
        ? { error: error.message, hint: error.hint, code: error.code }
        : { success: true, rowCount: data?.length || 0 };
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(result);
}
