import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/memoryEvents';
import { getEmbedding, getPineconeIndex, initPinecone } from '@/lib/pinecone';
import { requireAdmin } from '@/lib/adminAuth';

type MemoryEvent = {
  id: string;
  source: string;
  kind: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function POST(request: Request) {
  try {
    const auth = requireAdmin(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json().catch(() => ({}));
    const maxEvents = Math.min(Number(body.maxEvents ?? 250), 1000);
    const batchSize = Math.min(Number(body.batchSize ?? 25), 100);
    const cleanupTests = body.cleanupTests !== false;
    const backfill = body.backfill !== false;
    const purgeArchived = body.purgeArchived === true;
    const retentionDays = Math.max(90, Number(body.retentionDays ?? 90) || 90);
    const purgeBefore = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const supabase = createSupabaseServiceClient();
    await initPinecone();
    const index = await getPineconeIndex();

    const summary = {
      cleanup: {
        enabled: cleanupTests,
        supabaseDeleted: 0,
        pineconeDeleted: 0,
        errors: [] as string[],
      },
      backfill: {
        enabled: backfill,
        scanned: 0,
        upserted: 0,
        skipped: 0,
        errors: [] as Array<{ id?: string; error: string }>,
      },
      purgeArchived: {
        enabled: purgeArchived,
        retentionDays,
        purgeBefore,
        supabaseDeleted: 0,
        pineconeDeleted: 0,
        errors: [] as string[],
      },
    };

    if (cleanupTests) {
      const { data: testRows, error: testSelectError } = await supabase
        .from('memory_events')
        .select('id')
        .eq('source', 'test')
        .eq('kind', 'vector_search_test');

      if (testSelectError) {
        summary.cleanup.errors.push(testSelectError.message);
      } else {
        const ids = (testRows ?? []).map((row: { id: string }) => row.id);

        if (ids.length > 0) {
          for (const idChunk of chunk(ids, 100)) {
            try {
              await index.deleteMany({ ids: idChunk });
              summary.cleanup.pineconeDeleted += idChunk.length;
            } catch (error) {
              summary.cleanup.errors.push(error instanceof Error ? error.message : String(error));
            }
          }

          const { error: deleteError } = await supabase
            .from('memory_events')
            .delete()
            .in('id', ids);

          if (deleteError) {
            summary.cleanup.errors.push(deleteError.message);
          } else {
            summary.cleanup.supabaseDeleted = ids.length;
          }
        }
      }
    }

    if (purgeArchived) {
      const { data: archivedRows, error: archivedSelectError } = await supabase
        .from('memory_events')
        .select('id')
        .not('archived_at', 'is', null)
        .lt('archived_at', purgeBefore)
        .limit(maxEvents);

      if (archivedSelectError) {
        summary.purgeArchived.errors.push(archivedSelectError.message);
      } else {
        const ids = (archivedRows ?? []).map((row: { id: string }) => row.id);

        if (ids.length > 0) {
          for (const idChunk of chunk(ids, 100)) {
            try {
              await index.deleteMany({ ids: idChunk });
              summary.purgeArchived.pineconeDeleted += idChunk.length;
            } catch (error) {
              summary.purgeArchived.errors.push(error instanceof Error ? error.message : String(error));
            }
          }

          const { error: purgeError } = await supabase
            .from('memory_events')
            .delete()
            .in('id', ids);

          if (purgeError) {
            summary.purgeArchived.errors.push(purgeError.message);
          } else {
            summary.purgeArchived.supabaseDeleted = ids.length;
          }
        }
      }
    }


    if (backfill) {
      const { data: events, error: eventsError } = await supabase
        .from('memory_events')
        .select('id, source, kind, summary, metadata, created_at')
        .not('summary', 'is', null)
        .neq('summary', '')
        .neq('source', 'test')
        .neq('kind', 'vector_search_test')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(maxEvents);

      if (eventsError) {
        summary.backfill.errors.push({ error: eventsError.message });
      } else {
        const memoryEvents = (events ?? []) as MemoryEvent[];
        summary.backfill.scanned = memoryEvents.length;

        for (const eventBatch of chunk(memoryEvents, batchSize)) {
          const records = [];

          for (const event of eventBatch) {
            if (!event.summary) {
              summary.backfill.skipped += 1;
              continue;
            }

            try {
              const embedding = await getEmbedding(event.summary);
              records.push({
                id: event.id,
                values: embedding,
                metadata: {
                  source: event.source,
                  kind: event.kind,
                  summary: event.summary,
                  created_at: event.created_at,
                },
              });
            } catch (error) {
              summary.backfill.errors.push({
                id: event.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          if (records.length > 0) {
            try {
              await index.upsert({ records });
              summary.backfill.upserted += records.length;
            } catch (error) {
              summary.backfill.errors.push({
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }
    }


    if (cleanupTests) {
      const { data: remainingTestRows } = await supabase
        .from('memory_events')
        .select('id')
        .eq('source', 'test')
        .eq('kind', 'vector_search_test');

      const remainingIds = (remainingTestRows ?? []).map((row: { id: string }) => row.id);
      for (const idChunk of chunk(remainingIds, 100)) {
        try {
          await index.deleteMany({ ids: idChunk });
        } catch (error) {
          summary.cleanup.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
