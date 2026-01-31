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
 * Enhanced prospect profile for better matching
 */
export interface ProspectProfile {
  name: string;
  bio?: string;
  industry?: string;
  expertise?: string[];
  target_audience?: string;
  topics?: string[];
  company?: string;
  title?: string;
  content_themes?: string;
  value_proposition?: string;
}

/**
 * Create rich text representation of prospect for embedding
 * The more detailed the profile, the better the matching accuracy
 * @param profile - Prospect profile information
 * @returns Formatted text optimized for semantic search
 */
export function createProspectText(name: string, bio?: string, profile?: Partial<ProspectProfile>): string {
  const parts: string[] = [];

  // 1. Name - Critical for personal brand matching
  if (name) {
    parts.push(`Guest: ${name}`);
  }

  // 2. Title & Company - Professional context
  if (profile?.title || profile?.company) {
    const roleInfo = [profile.title, profile.company].filter(Boolean).join(' at ');
    if (roleInfo) parts.push(`Role: ${roleInfo}`);
  }

  // 3. Industry - Helps match to category-specific podcasts
  if (profile?.industry) {
    parts.push(`Industry: ${profile.industry}`);
  }

  // 4. Expertise - Core competencies for topical matching
  if (profile?.expertise && profile.expertise.length > 0) {
    parts.push(`Expertise: ${profile.expertise.join(', ')}`);
  }

  // 5. Topics - Specific subjects they can discuss
  if (profile?.topics && profile.topics.length > 0) {
    parts.push(`Topics: ${profile.topics.join(', ')}`);
  }

  // 6. Target Audience - Matches podcast listener demographics
  if (profile?.target_audience) {
    parts.push(`Audience: ${profile.target_audience}`);
  }

  // 7. Value Proposition - What unique insights they bring
  if (profile?.value_proposition) {
    parts.push(`Value: ${profile.value_proposition}`);
  }

  // 8. Content Themes - Overarching message themes
  if (profile?.content_themes) {
    parts.push(`Themes: ${profile.content_themes}`);
  }

  // 9. Bio - Comprehensive background (truncate if very long)
  if (bio && bio.trim().length > 0) {
    const truncatedBio = bio.trim().length > 500 ? bio.trim().substring(0, 500) + '...' : bio.trim();
    parts.push(`Background: ${truncatedBio}`);
  }

  return parts.join('\n');
}
