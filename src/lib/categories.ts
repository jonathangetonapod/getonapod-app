// Master list of podcast categories
// This is the single source of truth for all categories used across the app

export const PODCAST_CATEGORIES = [
  "Business",
  "Entrepreneurship",
  "Marketing",
  "Technology",
  "SaaS & Tech",
  "Finance",
  "Leadership",
  "Sales",
  "Productivity",
  "Health & Fitness",
  "Education",
  "Self-Improvement",
  "Entertainment",
  "News & Politics",
  "True Crime",
  "Sports",
  "Science",
  "Society & Culture",
] as const;

export type PodcastCategory = typeof PODCAST_CATEGORIES[number];

// Helper to check if a string is a valid category
export const isValidCategory = (category: string): category is PodcastCategory => {
  return PODCAST_CATEGORIES.includes(category as PodcastCategory);
};
