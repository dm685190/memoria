import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const result: {
    hasSupabaseUrl: boolean;
    hasSupabaseServiceRoleKey: boolean;
    supabaseUrlLength: number;
    serviceRoleKeyLength: number;
    memoryEventsAccess: null | string;
    healthCheckAccess: null | string;
  } = {
    hasSupabaseUrl: !!supabaseUrl,
    hasSupabaseServiceRoleKey: !!supabaseServiceRoleKey,
    supabaseUrlLength: supabaseUrl?.length || 0,
    serviceRoleKeyLength: supabaseServiceRoleKey?.length || 0,
    memoryEventsAccess: null as null | string,
    healthCheckAccess: null as null | string,
  };

  if (supabaseUrl && supabaseServiceRoleKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      
      // Test memory_events table
      const { error: memError } = await supabase
        .from('memory_events')
        .select('count')
        .limit(1)
        .single();

      if (memError) {
        result.memoryEventsAccess = `error: ${memError.message}`;
      } else {
        result.memoryEventsAccess = `success: count retrieved`;
      }

      // Test health_checks table (for comparison)
      const { error: healthError } = await supabase
        .from('health_checks')
        .select('count')
        .limit(1)
        .single();

      if (healthError) {
        result.healthCheckAccess = `error: ${healthError.message}`;
      } else {
        result.healthCheckAccess = `success: count retrieved`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.memoryEventsAccess = `exception: ${message}`;
    }
  }

  return NextResponse.json(result);
}