import { Pinecone } from '@pinecone-database/pinecone';

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

// Get or create index
const indexName = process.env.PINECONE_INDEX_NAME || 'robin-memory-events';

let index: any;

// Initialize index connection
export const initPinecone = async () => {
  try {
    // Check if index exists
    const indexes = await pinecone.listIndexes();
    
    if (!indexes.includes(indexName)) {
      console.warn(`Index ${indexName} does not exist. Please create it in Pinecone dashboard.`);
      // In a production app, you might want to create it here, but for safety we'll just warn
    }
    
    index = pinecone.Index(indexName);
    console.log(`Connected to Pinecone index: ${indexName}`);
  } catch (error) {
    console.error('Error initializing Pinecone:', error);
    throw error;
  }
};

// Get index instance (lazy initialization)
export const getPineconeIndex = async () => {
  if (!index) {
    await initPinecone();
  }
  return index;
};

// Health check for Pinecone
export const checkPineconeHealth = async () => {
  try {
    const idx = await getPineconeIndex();
    const stats = await idx.describeIndexStats();
    return { 
      connected: true, 
      indexName, 
      totalVectorCount: stats.totalVectorCount,
      dimension: stats.dimension 
    };
  } catch (error) {
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

export default { initPinecone, getPineconeIndex, checkPineconeHealth };