import { NextResponse } from 'next/server';
import { checkPineconeHealth } from '@/lib/pinecone';

export async function GET() {
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