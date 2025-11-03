import type { Document, DocumentVector } from '../data/types';
import { DataStore } from '../data/db';
import { generateEmbedding, cosineSimilarity } from './embeddings';

export interface SearchResult {
  document: Document;
  chunk: DocumentVector;
  score: number;
  snippet: string;
}

/**
 * Perform semantic search across documents using vector embeddings
 */
export async function semanticSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Get all document vectors
    const allVectors = await DataStore.getAll('documentVectors');

    // Calculate similarity scores
    const scoredResults = allVectors.map((vector) => {
      if (!vector.embedding || vector.embedding.length === 0) {
        return null;
      }

      const similarity = cosineSimilarity(queryEmbedding, vector.embedding);
      
      // Generate snippet from chunk text
      const snippet = generateSnippet(vector.chunkText, query);
      
      return {
        vector,
        similarity,
        snippet,
      };
    }).filter((result): result is NonNullable<typeof result> => result !== null);

    // Sort by similarity and get top results
    scoredResults.sort((a, b) => b.similarity - a.similarity);
    const topResults = scoredResults.slice(0, limit);

    // Fetch corresponding documents
    const results: SearchResult[] = [];
    for (const result of topResults) {
      const document = await DataStore.get('documents', result.vector.documentId);
      if (document) {
        results.push({
          document,
          chunk: result.vector,
          score: result.similarity,
          snippet: result.snippet,
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error performing semantic search:', error);
    return [];
  }
}

/**
 * Perform keyword search across documents
 */
export async function keywordSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 2);

  const allDocuments = await DataStore.getAll('documents');
  
  const matches: Array<{ document: Document; score: number; matchedText: string }> = [];

  for (const document of allDocuments) {
    let score = 0;
    let matchedText = '';

    // Check document name
    if (document.name.toLowerCase().includes(queryLower)) {
      score += 10;
      matchedText = document.name;
    }

    // Check content
    if (document.content) {
      const contentLower = document.content.toLowerCase();
      let contentMatches = 0;
      
      for (const word of queryWords) {
        const wordCount = (contentLower.match(new RegExp(word, 'g')) || []).length;
        contentMatches += wordCount;
      }
      
      if (contentMatches > 0) {
        score += contentMatches * 2;
        // Get a snippet
        const snippetStart = Math.max(0, contentLower.indexOf(queryWords[0]) - 50);
        matchedText = document.content.substring(snippetStart, snippetStart + 200).trim();
      }
    }

    // Check description
    if (document.description?.toLowerCase().includes(queryLower)) {
      score += 5;
    }

    // Check tags
    if (document.tags) {
      for (const tag of document.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          score += 3;
        }
      }
    }

    if (score > 0) {
      matches.push({ document, score, matchedText });
    }
  }

  // Sort by score and limit results
  matches.sort((a, b) => b.score - a.score);
  
  return matches.slice(0, limit).map((match) => ({
    document: match.document,
    chunk: {
      id: '',
      documentId: match.document.id,
      chunkIndex: 0,
      chunkText: match.matchedText,
    } as DocumentVector,
    score: match.score / 100, // Normalize to 0-1 range
    snippet: generateSnippet(match.matchedText, query),
  }));
}

/**
 * Perform hybrid search (semantic + keyword)
 */
export async function hybridSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
  // Get results from both methods
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, limit * 2),
    keywordSearch(query, limit * 2),
  ]);

  // Combine and deduplicate results
  const resultMap = new Map<string, SearchResult>();

  // Add semantic results with weight
  for (const result of semanticResults) {
    const existing = resultMap.get(result.document.id);
    if (!existing || result.score > existing.score) {
      resultMap.set(result.document.id, {
        ...result,
        score: result.score * 0.7, // Semantic weight
      });
    }
  }

  // Add keyword results with weight
  for (const result of keywordResults) {
    const existing = resultMap.get(result.document.id);
    if (existing) {
      // Boost score if found in both
      existing.score = Math.max(existing.score, result.score * 0.5);
    } else {
      resultMap.set(result.document.id, {
        ...result,
        score: result.score * 0.5, // Keyword weight
      });
    }
  }

  // Sort by combined score and return top results
  const combinedResults = Array.from(resultMap.values());
  combinedResults.sort((a, b) => b.score - a.score);
  
  return combinedResults.slice(0, limit);
}

/**
 * Generate a snippet from text highlighting the query
 */
function generateSnippet(text: string, query: string, maxLength: number = 200): string {
  if (!text || text.length === 0) return '';
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Find the first occurrence of the query
  const index = textLower.indexOf(queryLower);
  
  if (index === -1) {
    // If query not found, return beginning of text
    return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
  }
  
  // Try to center the snippet around the query
  const start = Math.max(0, index - maxLength / 2);
  const end = Math.min(text.length, start + maxLength);
  
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  
  return snippet;
}

