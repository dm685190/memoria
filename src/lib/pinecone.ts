import { Pinecone } from '@pinecone-database/pinecone';

const indexName = process.env.PINECONE_INDEX_NAME || 'robin-memory-events-2048';
const embeddingModel = process.env.PINECONE_EMBEDDING_MODEL || 'llama-text-embed-v2';

let pinecone: Pinecone | null = null;
let index: ReturnType<Pinecone['Index']> | null = null;

function getPineconeClient() {
  if (pinecone) {
    return pinecone;
  }

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is not configured');
  }

  pinecone = new Pinecone({ apiKey });
  return pinecone;
}

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const client = getPineconeClient();
    const response = await client.inference.embed({
      model: embeddingModel,
      inputs: [text],
      parameters: {
        input_type: 'passage',
        truncate: 'END',
      },
    });

    const embedding = response.data[0];
    if (!embedding || embedding.vectorType !== 'dense' || !('values' in embedding)) {
      throw new Error(`Model ${embeddingModel} did not return a dense embedding`);
    }

    return embedding.values;
  } catch (error) {
    console.error('Error generating Pinecone embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

export const initPinecone = async () => {
  try {
    const client = getPineconeClient();
    const indexes = await client.listIndexes();
    const indexNames = indexes.indexes?.map((idx) => idx.name) ?? [];

    if (!indexNames.includes(indexName)) {
      console.warn(`Index ${indexName} does not exist. Please create it in Pinecone dashboard.`);
    }

    index = client.Index(indexName);
    console.log(`Connected to Pinecone index: ${indexName}`);
  } catch (error) {
    console.error('Error initializing Pinecone:', error);
    throw error;
  }
};

export const getPineconeIndex = async () => {
  if (!index) {
    await initPinecone();
  }

  if (!index) {
    throw new Error('Pinecone index failed to initialize');
  }

  return index;
};

export const checkPineconeHealth = async () => {
  try {
    const idx = await getPineconeIndex();
    const stats = await idx.describeIndexStats();
    return {
      connected: true,
      indexName,
      embeddingModel,
      totalVectorCount: stats.totalRecordCount ?? 0,
      dimension: stats.dimension,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export default { initPinecone, getPineconeIndex, getEmbedding, checkPineconeHealth };
