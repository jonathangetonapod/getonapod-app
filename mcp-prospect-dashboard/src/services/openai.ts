import OpenAI from 'openai';
import { config } from '../config.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Generate embedding for prospect text
 * @param text - The text to generate an embedding for
 * @returns Array of 1536 numbers representing the embedding
 */
export async function generateProspectEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS
  });

  return response.data[0].embedding;
}

/**
 * Create text representation of prospect for embedding
 * @param name - Prospect's full name
 * @param bio - Prospect's bio/background (optional)
 * @returns Formatted text for embedding
 */
export function createProspectText(name: string, bio?: string): string {
  const parts: string[] = [];

  // Name is most important
  if (name) {
    parts.push(`Name: ${name}`);
  }

  // Bio provides context
  if (bio && bio.trim().length > 0) {
    parts.push(`Background: ${bio.trim()}`);
  }

  return parts.join('. ');
}
