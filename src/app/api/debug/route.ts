import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  return NextResponse.json({
    hasSupabaseUrl: !!supabaseUrl,
    hasSupabaseServiceRoleKey: !!supabaseServiceRoleKey,
    supabaseUrlLength: supabaseUrl?.length || 0,
    // Don't return the actual values for security
  });
}