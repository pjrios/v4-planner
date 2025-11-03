import { pipeline } from '@xenova/transformers';
import type { Document } from '../data/types';
import { chunkText } from './documentParser';

// Use a small, efficient model for M1 Air with 8GB RAM
// all-MiniLM-L6-v2: 22.7MB, 384 dimensions, fast inference
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

let embeddingPipeline: any = null;
let isLoadingModel = false;
let loadingPromise: Promise<any> | null = null;

/**
 * Initialize the embedding pipeline (lazy loading)
 */
async function getEmbeddingPipeline(): Promise<any> {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  isLoadingModel = true;
  loadingPromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
    quantized: true,
    device: 'wasm',
  }).then((pipeline) => {
    embeddingPipeline = pipeline;
    isLoadingModel = false;
    loadingPromise = null;
    return pipeline;
  });

  return loadingPromise;
}

/**
 * Generate embeddings for text chunks
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const pipeline = await getEmbeddingPipeline();
    const results = await pipeline(texts, { pooling: 'mean', normalize: true });
    
    // Convert tensor to array
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const embedding = await results[i].array();
      embeddings.push(Array.from(embedding as number[]));
    }
    
    return embeddings;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}

/**
 * Generate embeddings for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

/**
 * Check if the model is currently loading
 */
export function isModelLoading(): boolean {
  return isLoadingModel;
}

/**
 * Process a document to generate embeddings and store chunks
 */
export async function processDocumentForEmbeddings(document: Document): Promise<void> {
  if (!document.content || document.content.trim().length === 0) {
    console.warn(`Document ${document.id} has no content to embed`);
    return;
  }

  // Check if embeddings already exist
  const { DataStore } = await import('../data/db');
  const existingVectors = await DataStore.getAll('documentVectors');
  const hasExistingVectors = existingVectors.some((v) => v.documentId === document.id);
  
  if (hasExistingVectors) {
    console.log(`Document ${document.id} already has embeddings`);
    return;
  }

  // Chunk the text
  const chunks = chunkText(document.content, 500, 100); // Smaller chunks for better semantic search
  
  if (chunks.length === 0) {
    console.warn(`No chunks generated for document ${document.id}`);
    return;
  }

  console.log(`Generating embeddings for ${chunks.length} chunks of document ${document.id}`);

  try {
    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(chunks);

    // Store chunks and embeddings
    const vectors = chunks.map((chunk, index) => ({
      id: crypto.randomUUID(),
      documentId: document.id,
      chunkIndex: index,
      chunkText: chunk,
      embedding: embeddings[index],
      metadata: {
        totalChunks: chunks.length,
        chunkSize: chunk.length,
      },
    }));

    // Save vectors in batches to avoid overwhelming IndexedDB
    const batchSize = 50;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await Promise.all(batch.map((vector) => DataStore.save('documentVectors', vector)));
    }

    console.log(`Successfully processed ${vectors.length} chunks for document ${document.id}`);
  } catch (error) {
    console.error(`Failed to process document ${document.id}:`, error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

