import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const result: any = {
    config: {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseServiceRoleKey: !!supabaseServiceRoleKey,
      supabaseUrlLength: supabaseUrl?.length || 0,
      serviceRoleKeyLength: supabaseServiceRoleKey?.length || 0,
    },
    connectionTest: null as null | string,
    schemaTest: null as null | string,
    tableTests: {} as Record<string, any>,
  };

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    result.error = 'Missing Supabase credentials';
    return NextResponse.json(result);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    // Test 1: Try to query a simple system table or use rpc if available
    // Let's try a simple query that should work if we have access
    const { data: testData, error: testError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .limit(1);
      
    result.connectionTest = testError ? 
      `System query failed: ${testError?.message}` : 
      `System query succeeded`;
      
    // Test 2: Check if we can access the public schema specifically
    const { data: schemaData, error: schemaError } = await supabase
      .from('information_schema.tables')
      .select('table_schema, table_name')
      .eq('table_schema', 'public')
      .limit(5);
      
    result.schemaTest = schemaError ? 
      `Schema query failed: ${schemaError?.message}` : 
      `Schema query succeeded: found ${schemaData?.length || 0} tables in public schema`;
      
    if (schemaData) {
      result.schemaTestDetails = schemaData.map((t: any) => ({
        schema: t.table_schema,
        name: t.table_name
      }));
    }
    
    // Test 3: Check specific tables we care about
    const tablesToCheck = ['memory_events', 'health_checks'];
    for (const tableName of tablesToCheck) {
      try {
        // First check if table exists by trying to select one row
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
          
        result.tableTests[tableName] = error ?
          { error: error?.message, hint: error?.hint, code: error?.code } :
          { success: true, rowCount: data?.length || 0 };
      } catch (err: any) {
        result.tableTests[tableName] = { 
          exception: err?.message || 'Unknown error' 
        };
      }
    }
    
  } catch (err: any) {
    result.error = err?.message || 'Unknown error creating client';
    result.stack = err?.stack;
  }

  return NextResponse.json(result);
}