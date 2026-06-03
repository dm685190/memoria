import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { checkPineconeHealth } from '@/lib/pinecone';

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const health = await checkPineconeHealth();
    return NextResponse.json(health);
  } catch (error) {
    return NextResponse.json(
      { 
        connected: false, 
        error: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}