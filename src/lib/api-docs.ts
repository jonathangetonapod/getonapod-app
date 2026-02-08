export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiEndpoint {
  id: string;
  name: string;
  method: "POST" | "GET" | "DELETE" | "PUT" | "PATCH";
  path: string;
  description: string;
  auth: "API Key" | "Webhook Signature" | "Session Token" | "None";
  params: ApiParam[];
  responseExample: string;
  category: string;
  aiModel?: string;
  notes?: string;
}

export interface ApiCategory {
  id: string;
  name: string;
  description: string;
  endpoints: ApiEndpoint[];
}

const BASE_PATH = "/functions/v1";

export const API_CATEGORIES: ApiCategory[] = [
  {
    id: "prospect-dashboards",
    name: "Prospect Dashboards",
    description: "Create and manage public-facing prospect dashboards with curated podcast lists, Google Sheet backends, and AI-powered podcast analysis.",
    endpoints: [
      {
        id: "create-prospect-sheet",
        name: "Create Prospect Sheet",
        method: "POST",
        path: `${BASE_PATH}/create-prospect-sheet`,
        description: "Creates a new prospect dashboard by copying a Google Sheet template, exporting podcast data, generating a public shareable link with an 8-character slug, and saving all podcasts to the central cache for cross-prospect reuse.",
        auth: "API Key",
        notes: "Also creates a record in prospect_dashboards table and upserts all podcasts to the central podcasts cache (shared globally). The Google Sheet is set to public read-only access.",
        params: [
          { name: "prospectName", type: "string", required: true, description: "Display name for the prospect" },
          { name: "prospectBio", type: "string", required: false, description: "Bio text for AI matching context" },
          { name: "prospectImageUrl", type: "string", required: false, description: "Profile image URL" },
          { name: "podcasts", type: "PodcastExportData[]", required: true, description: "Array of podcast objects. Each requires podcast_name. Optional: publisher_name, podcast_description, audience_size, episode_count, itunes_rating, podcast_url, podscan_podcast_id, podcast_image_url, podcast_email, rss_feed, language, region, podcast_categories" },
        ],
        responseExample: JSON.stringify({
          success: true,
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1abc...",
          spreadsheetId: "1abc...",
          sheetTitle: "Podcast Opportunities - John Doe - Jan 15, 2025",
          rowsAdded: 15,
          updatedRange: "Sheet1",
          message: "Created prospect sheet with 15 podcasts",
          dashboardUrl: "https://getonapod.com/prospect/a1b2c3d4",
          dashboardSlug: "a1b2c3d4",
          cacheSaved: 12,
          cacheSkipped: 2,
          cacheErrors: 1
        }, null, 2),
        category: "prospect-dashboards",
      },
      {
        id: "append-prospect-sheet",
        name: "Append Prospect Sheet",
        method: "POST",
        path: `${BASE_PATH}/append-prospect-sheet`,
        description: "Appends additional podcasts to an existing prospect dashboard's Google Sheet. Looks up the dashboard by UUID, reuses the existing spreadsheet, and upserts all podcasts to the central cache.",
        auth: "API Key",
        notes: "Does not create a new sheet or change permissions. Identical caching behavior to create-prospect-sheet.",
        params: [
          { name: "dashboardId", type: "string", required: true, description: "UUID from prospect_dashboards table" },
          { name: "podcasts", type: "PodcastExportData[]", required: true, description: "Array of podcast objects to append (same schema as create-prospect-sheet)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1abc...",
          rowsAdded: 5,
          updatedRange: "Sheet1!A16:E20",
          message: "Added 5 podcasts to \"John Doe\"'s sheet",
          cacheSaved: 4,
          cacheSkipped: 1,
          cacheErrors: 0
        }, null, 2),
        category: "prospect-dashboards",
      },
      {
        id: "get-prospect-podcasts",
        name: "Get Prospect Podcasts",
        method: "POST",
        path: `${BASE_PATH}/get-prospect-podcasts`,
        description: "Retrieves podcasts from a prospect's Google Sheet with central caching, Podscan API enrichment, and AI fit analysis via Claude Sonnet. Supports 4 operating modes: standard fetch, cacheOnly, aiAnalysisOnly, and checkStatusOnly. Has a 50-second runtime limit with early stopping.",
        auth: "API Key",
        aiModel: "claude-sonnet-4-5-20250929 (for AI fit analysis)",
        notes: "Dual-layer caching: central podcasts table (shared, 7-day TTL) + prospect_podcast_analyses table (prospect-specific AI results). Reads podcast IDs from column E of the Google Sheet. Concurrent batch processing: 15 for Podscan, 30 for AI analysis. Stops early at 50 seconds to avoid function timeout.",
        params: [
          { name: "spreadsheetId", type: "string", required: true, description: "Google Sheet ID to read podcast IDs from" },
          { name: "prospectDashboardId", type: "string", required: false, description: "UUID for linking AI analyses to this prospect" },
          { name: "prospectName", type: "string", required: false, description: "Required for AI analysis - prospect's name" },
          { name: "prospectBio", type: "string", required: false, description: "Required for AI analysis - prospect's bio" },
          { name: "cacheOnly", type: "boolean", required: false, description: "Skip Podscan API, return only cached data. Default: false" },
          { name: "skipAiAnalysis", type: "boolean", required: false, description: "Fetch podcasts but don't run AI analysis. Default: false" },
          { name: "aiAnalysisOnly", type: "boolean", required: false, description: "Only run AI analysis on already-cached podcasts. Default: false" },
          { name: "checkStatusOnly", type: "boolean", required: false, description: "Return stats without fetching. Default: false" },
        ],
        responseExample: JSON.stringify({
          success: true,
          podcasts: [
            {
              podcast_id: "pod_abc123",
              podcast_name: "The SaaS Podcast",
              podcast_description: "Interviews with B2B founders...",
              podcast_image_url: "https://...",
              podcast_url: "https://...",
              publisher_name: "Sarah Lee",
              itunes_rating: 4.8,
              episode_count: 450,
              audience_size: 50000,
              podcast_categories: [{ category_id: 1, category_name: "Business" }],
              ai_clean_description: "A weekly podcast featuring in-depth interviews with B2B SaaS founders...",
              ai_fit_reasons: [
                "Strong alignment with B2B SaaS expertise",
                "Audience of 50K+ business decision-makers",
                "Host regularly features growth strategy topics"
              ],
              ai_pitch_angles: [
                { title: "Scaling from $1M to $10M ARR", description: "Share your proven framework for breaking through the $10M ARR ceiling..." },
                { title: "Building Remote-First B2B Teams", description: "Discuss how remote team structures can accelerate SaaS growth..." }
              ],
              ai_analyzed_at: "2025-01-15T10:30:00Z"
            }
          ],
          total: 15,
          cached: 12,
          fetched: 3,
          stoppedEarly: false,
          remaining: 0,
          cachePerformance: {
            cacheHitRate: 80,
            apiCallsSaved: 24,
            costSavings: 0.24
          },
          stats: {
            fromSheet: 15,
            fromCache: 12,
            podscanFetched: 3,
            aiAnalysesGenerated: 3,
            demographicsFetched: 3,
            cachedWithAi: 12,
            cachedWithDemographics: 10
          }
        }, null, 2),
        category: "prospect-dashboards",
      },
      {
        id: "delete-podcast-from-sheet",
        name: "Delete Podcast from Sheet",
        method: "POST",
        path: `${BASE_PATH}/delete-podcast-from-sheet`,
        description: "Removes a podcast row from a Google Sheet by finding the matching Podscan ID in column E and deleting the entire row. Sheet-only deletion - does not remove from the database. Stale cleanup happens on the next get-prospect-podcasts call.",
        auth: "API Key",
        notes: "Searches column E for the podcast ID. Deletion is permanent and cannot be undone. Does NOT delete from the podcasts table or prospect_podcast_analyses.",
        params: [
          { name: "spreadsheetId", type: "string", required: true, description: "Google Sheet ID" },
          { name: "podcastId", type: "string", required: true, description: "Podscan podcast ID to find and delete (matched in column E)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          message: "Deleted podcast from row 5",
          deletedPodcastId: "pod_abc123"
        }, null, 2),
        category: "prospect-dashboards",
      },
    ],
  },
  {
    id: "ai-content",
    name: "AI Content Generation",
    description: "Generate AI-powered content using Claude models - taglines, bios, podcast summaries, Podscan search queries, guest resources, and blog posts.",
    endpoints: [
      {
        id: "generate-tagline",
        name: "Generate Tagline",
        method: "POST",
        path: `${BASE_PATH}/generate-tagline`,
        description: "Generates a personalized tagline for a prospect dashboard using Claude Sonnet. Output starts with 'We've curated X podcasts perfect for...' and is 10-20 words. Optionally saves to prospect_dashboards table.",
        auth: "API Key",
        aiModel: "claude-sonnet-4-5-20250929 (max_tokens: 100)",
        notes: "Post-processes output to strip surrounding quotes. If dashboardId provided, saves tagline to prospect_dashboards.personalized_tagline (silent failure on DB error).",
        params: [
          { name: "prospectName", type: "string", required: true, description: "Prospect's name" },
          { name: "prospectBio", type: "string", required: true, description: "Prospect's bio for context" },
          { name: "podcastCount", type: "number", required: true, description: "Number of curated podcasts (used in tagline)" },
          { name: "dashboardId", type: "string", required: false, description: "If provided, saves tagline to prospect_dashboards table" },
        ],
        responseExample: JSON.stringify({
          success: true,
          tagline: "We've curated 15 podcasts perfect for sharing your SaaS scaling expertise with engaged B2B audiences"
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-client-bio",
        name: "Generate Client Bio",
        method: "POST",
        path: `${BASE_PATH}/generate-client-bio`,
        description: "Generates a 3-4 paragraph professional bio optimized for podcast guest pitches using comprehensive onboarding data and Claude Sonnet. Returns bio only (no shortBio or talkingPoints).",
        auth: "API Key",
        aiModel: "claude-sonnet-4-5-20250929 (max_tokens: 1000, temperature: 0.7)",
        params: [
          { name: "name", type: "string", required: true, description: "Client's full name" },
          { name: "company", type: "string", required: true, description: "Company name" },
          { name: "bio", type: "string", required: true, description: "Existing bio or background" },
          { name: "compellingStory", type: "string", required: true, description: "Client's compelling story or origin" },
          { name: "uniqueJourney", type: "string", required: true, description: "What makes their journey unique" },
          { name: "passions", type: "string", required: true, description: "Professional passions" },
          { name: "audienceValue", type: "string", required: true, description: "Value they bring to podcast audiences" },
          { name: "idealAudience", type: "string", required: true, description: "Their ideal listener audience" },
          { name: "expertise", type: "string[]", required: true, description: "Areas of expertise" },
          { name: "topicsConfident", type: "string[]", required: true, description: "Topics they're confident speaking on" },
          { name: "goals", type: "string[]", required: true, description: "Podcast guesting goals" },
          { name: "title", type: "string", required: false, description: "Job title" },
          { name: "personalStories", type: "string", required: false, description: "Personal anecdotes for relatability" },
          { name: "hobbies", type: "string", required: false, description: "Hobbies and interests" },
          { name: "futureVision", type: "string", required: false, description: "Vision for the future" },
          { name: "specificAngles", type: "string", required: false, description: "Specific pitch angles" },
          { name: "socialFollowers", type: "string", required: false, description: "Social media following" },
          { name: "previousPodcasts", type: "string", required: false, description: "Previous podcast appearances" },
        ],
        responseExample: JSON.stringify({
          success: true,
          bio: "John Doe is the founder and CEO of Acme Corp, where he's helped over 200 SaaS companies scale past $10M ARR. His journey from bootstrapped startup to leading a team of 50 began when he discovered that most founders were making the same three mistakes when it came to growth strategy..."
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-podcast-summary",
        name: "Generate Podcast Summary",
        method: "POST",
        path: `${BASE_PATH}/generate-podcast-summary`,
        description: "Generates a compelling 2-3 sentence 'Why This Show' description for a podcast using Claude Sonnet 4.5, focusing on the value proposition for potential guests.",
        auth: "API Key",
        aiModel: "claude-sonnet-4-5-20250929 (max_tokens: 200)",
        params: [
          { name: "podcast_name", type: "string", required: true, description: "Name of the podcast" },
          { name: "audience_size", type: "string", required: false, description: "Estimated audience size" },
          { name: "episode_count", type: "number", required: false, description: "Number of published episodes" },
          { name: "rating", type: "number", required: false, description: "Podcast rating (1-5)" },
          { name: "reach_score", type: "number", required: false, description: "Computed reach score (0-100)" },
          { name: "description", type: "string", required: false, description: "Podcast description" },
          { name: "categories", type: "string[]", required: false, description: "Podcast categories" },
          { name: "publisher_name", type: "string", required: false, description: "Host or publisher name" },
        ],
        responseExample: JSON.stringify({
          summary: "The Growth Show reaches an engaged audience of 50K+ business leaders looking for actionable growth strategies. With 450 episodes and a 4.8 rating, it's a top-tier platform for B2B thought leaders."
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-podcast-queries",
        name: "Generate Podcast Queries",
        method: "POST",
        path: `${BASE_PATH}/generate-podcast-queries`,
        description: "Generates optimized Podscan search queries using Claude Opus. Two modes: (A) Generate 5 strategic queries from a bio, or (B) Regenerate a single query if oldQuery is provided. Queries use advanced syntax: single quotes for exact phrases, wildcards (*), and boolean operators (AND, OR, NOT).",
        auth: "API Key",
        aiModel: "claude-opus-4-5-20251101 (5 queries: max_tokens 500, temp 0.8 | 1 query: max_tokens 100, temp 0.9)",
        notes: "Dual-mode operation. Mode A returns { queries: [5 strings] }. Mode B returns { query: string }. Uses advanced Podscan search syntax: single quotes only, wildcards, boolean operators. At least 2 queries must use wildcards and 2 must use OR. Expected coverage: 100-300 podcasts per query. Has dual-stage JSON parsing with regex fallback.",
        params: [
          { name: "clientName", type: "string", required: false, description: "Client's name (required if no prospectName)" },
          { name: "clientBio", type: "string", required: false, description: "Client's bio (required if no prospectBio)" },
          { name: "clientEmail", type: "string", required: false, description: "Client's email" },
          { name: "oldQuery", type: "string", required: false, description: "Previous query to regenerate (triggers single-query mode)" },
          { name: "prospectName", type: "string", required: false, description: "Prospect name (switches to prospect mode)" },
          { name: "prospectBio", type: "string", required: false, description: "Prospect bio (switches to prospect mode)" },
        ],
        responseExample: JSON.stringify({
          queries: [
            "'B2B SaaS' AND ('founder interview' OR 'CEO podcast')",
            "'startup * growth' AND 'scaling' OR 'revenue'",
            "'business leadership' AND 'podcast guest' NOT 'music'",
            "'entrepreneur * story' OR 'founder journey' AND 'tech'",
            "'SaaS growth' AND ('strategy podcast' OR 'business interview')"
          ]
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-guest-resource",
        name: "Generate Guest Resource",
        method: "POST",
        path: `${BASE_PATH}/generate-guest-resource`,
        description: "Generates 800-1200 word HTML guest resources (guides, checklists, templates) using Claude Haiku. Output is semantic HTML with checkboxes and pro-tip blockquotes. Includes extensive UTF-8/Unicode character normalization (15+ regex replacements).",
        auth: "API Key",
        aiModel: "claude-haiku-4-5-20251001 (max_tokens: 4000, temperature: 0.7)",
        notes: "Output is HTML with semantic tags (<h2>, <h3>, <p>, <ul>, <ol>, <blockquote>). ASCII-only constraint: no smart quotes, em-dashes, or special characters. Performs 15+ character replacement operations for UTF-8 fixing. Category must be one of: preparation, technical_setup, best_practices, promotion, examples, templates.",
        params: [
          { name: "topic", type: "string", required: true, description: "Topic for the resource" },
          { name: "category", type: "string", required: false, description: "One of: preparation, technical_setup, best_practices, promotion, examples, templates" },
          { name: "resourceType", type: "string", required: false, description: "Type: 'guide', 'checklist', or 'template'. Defaults to 'guide'" },
        ],
        responseExample: JSON.stringify({
          success: true,
          data: {
            content: "<h2>Podcast Interview Preparation Checklist</h2><p>Getting ready for a podcast interview...</p><ul><li>Research the host and recent episodes</li></ul><blockquote><strong>Pro Tip:</strong> Listen to at least 3 episodes before your recording.</blockquote>",
            wordCount: 950,
            readTimeMinutes: 5
          }
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-blog-content",
        name: "Generate Blog Content",
        method: "POST",
        path: `${BASE_PATH}/generate-blog-content`,
        description: "Generates a full SEO-optimized blog post using two Claude Sonnet API calls: one for the main HTML content (8000 tokens) and a second for the meta description (200 tokens). Includes a CTA linking to Premium Podcast Placements.",
        auth: "API Key",
        aiModel: "claude-sonnet-4-5-20250929 (Call 1: max_tokens 8000 | Call 2: max_tokens 200, both temp 0.7)",
        notes: "Makes TWO separate Claude API calls. Structure: intro (150-200w), body (3-5 sections, 300-400w each with H2/H3), conclusion (150-200w). Always includes 'Get On A Pod' mention and CTA to Premium Placements. Meta description is 150-160 chars generated from first 500 chars of content.",
        params: [
          { name: "topic", type: "string", required: true, description: "Blog post topic" },
          { name: "category", type: "string", required: false, description: "Blog category" },
          { name: "keywords", type: "string[]", required: false, description: "Target SEO keywords (naturally incorporated)" },
          { name: "tone", type: "string", required: false, description: "Writing tone. Defaults to 'professional'" },
          { name: "wordCount", type: "number", required: false, description: "Target word count. Defaults to 1500" },
        ],
        responseExample: JSON.stringify({
          success: true,
          data: {
            content: "<h2>Introduction</h2><p>Podcast guesting is one of the most effective ways to build authority...</p><h2>Why Podcast Guesting Works</h2>...",
            metaDescription: "Learn how to get booked on top podcasts in 2025 with proven strategies for pitching hosts and building authority.",
            wordCount: 1650,
            readTimeMinutes: 9
          }
        }, null, 2),
        category: "ai-content",
      },
    ],
  },
  {
    id: "podcast-discovery",
    name: "Podcast Discovery & Analysis",
    description: "Find, score, and analyze podcasts for compatibility with client/prospect profiles. Includes central caching with 7-day TTL, Podscan API integration, and AI-powered scoring.",
    endpoints: [
      {
        id: "score-podcast-compatibility",
        name: "Score Podcast Compatibility",
        method: "POST",
        path: `${BASE_PATH}/score-podcast-compatibility`,
        description: "Scores a batch of podcasts against a client/prospect bio using Claude Haiku for fast parallel processing. Each podcast scored independently on a 1-10 scale with reasoning. Supports both client and prospect modes (prospectBio takes precedence). Includes multi-stage JSON parsing with regex fallback.",
        auth: "API Key",
        aiModel: "claude-haiku-4-5-20251001 (max_tokens: 200, temperature: 0)",
        notes: "All podcasts scored simultaneously via Promise.all(). If JSON parsing fails, attempts regex extraction of score number (loses reasoning). Score null on complete failure. Tracks successCount, errorCount, avgScore, highScores (>=7).",
        params: [
          { name: "clientBio", type: "string", required: false, description: "Client's bio for matching (required if no prospectBio)" },
          { name: "prospectBio", type: "string", required: false, description: "Prospect's bio - takes precedence over clientBio" },
          { name: "podcasts", type: "object[]", required: true, description: "Array of podcasts. Each needs: podcast_id, podcast_name. Optional: podcast_description, publisher_name, podcast_categories (array of {category_name}), audience_size, episode_count" },
        ],
        responseExample: JSON.stringify({
          scores: [
            {
              podcast_id: "pod_abc123",
              score: 9,
              reasoning: "Strong alignment with B2B SaaS focus. Host regularly features growth experts and audience of 50K+ business leaders is ideal for this guest's expertise."
            },
            {
              podcast_id: "pod_def456",
              score: 4,
              reasoning: "Primarily focuses on consumer marketing which doesn't align well with B2B SaaS expertise."
            }
          ]
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "analyze-podcast-fit",
        name: "Analyze Podcast Fit",
        method: "POST",
        path: `${BASE_PATH}/analyze-podcast-fit`,
        description: "Deep AI analysis of podcast-client fit using Claude Sonnet, returning a cleaned description, fit reasons, and pitch angles. Results cached in podcast_fit_analyses table with composite key (podcast_id, client_id) and 7-day TTL. Includes multi-stage JSON parsing with 4 fallback attempts.",
        auth: "API Key",
        aiModel: "claude-sonnet-4-5-20250929 (max_tokens: 2000)",
        notes: "Cache key: (podcast_id, client_id). TTL: 7 days. If clientBio empty, uses fallback: 'Business professional and thought leader seeking to share expertise with podcast audiences.' JSON parsing has 4 fallback stages: code block extraction, raw JSON search, cleanup, manual field extraction. Can return partial data on parsing failure.",
        params: [
          { name: "podcastName", type: "string", required: true, description: "Name of the podcast" },
          { name: "podcastId", type: "string", required: false, description: "Podcast ID (falls back to podcastName if not provided)" },
          { name: "podcastDescription", type: "string", required: false, description: "Podcast description (may contain HTML)" },
          { name: "podcastUrl", type: "string", required: false, description: "Podcast website URL" },
          { name: "publisherName", type: "string", required: false, description: "Host/publisher name" },
          { name: "hostName", type: "string", required: false, description: "Alias for publisherName" },
          { name: "itunesRating", type: "number", required: false, description: "iTunes rating (1-5)" },
          { name: "episodeCount", type: "number", required: false, description: "Number of episodes" },
          { name: "audienceSize", type: "number", required: false, description: "Estimated audience size" },
          { name: "clientId", type: "string", required: false, description: "Client ID for cache key. Defaults to 'legacy'" },
          { name: "clientName", type: "string", required: false, description: "Client's name for analysis context" },
          { name: "clientBio", type: "string", required: false, description: "Client's bio (uses generic fallback if empty)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          cached: false,
          analysis: {
            clean_description: "A weekly podcast featuring in-depth interviews with B2B SaaS founders sharing their growth strategies and lessons learned.",
            fit_reasons: [
              "Host regularly features founders who've scaled past $10M ARR, aligning perfectly with your experience",
              "Audience of 50K+ business decision-makers matches your ideal listener profile",
              "Recent episodes on remote team building and growth strategy directly relate to your expertise",
              "The interview style allows deep-dives into tactical advice, which showcases your strength"
            ],
            pitch_angles: [
              { title: "Scaling B2B SaaS Past the $10M Ceiling", description: "Share your proven framework for breaking through revenue plateaus, including the three organizational changes that unlocked your next growth phase." },
              { title: "Building Remote-First Teams That Outperform", description: "Discuss how your distributed team model has become a competitive advantage, with specific hiring and culture practices." },
              { title: "From Bootstrapped to Category Leader", description: "Tell the story of building Acme Corp without outside funding and the unconventional growth strategies that got you there." }
            ]
          }
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "fetch-podscan-email",
        name: "Fetch Podscan Email",
        method: "POST",
        path: `${BASE_PATH}/fetch-podscan-email`,
        description: "Fetches the contact email for a podcast from the Podscan API. Results cached indefinitely in the podcast_emails table (no TTL). Returns null if the podcast has no email on file.",
        auth: "API Key",
        notes: "Indefinite cache (no expiry - once cached, always returned). Fire-and-forget database insert (DB error doesn't fail the request). Extracts email from Podscan response at podcast.reach.email path.",
        params: [
          { name: "podcast_id", type: "string", required: true, description: "Podscan podcast ID" },
        ],
        responseExample: JSON.stringify({
          success: true,
          email: "host@podcast.com",
          podcast_id: "pod_abc123",
          cached: false
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "read-outreach-list",
        name: "Read Outreach List",
        method: "POST",
        path: `${BASE_PATH}/read-outreach-list`,
        description: "Reads podcast IDs from column E of a client's Google Sheet, checks the central cache (7-day TTL), fetches missing podcasts from Podscan API in batches of 5, and returns full podcast data with cost tracking metrics.",
        auth: "API Key",
        notes: "Google Sheet range: E2:E1000 (up to 1000 rows). Uses batch upsert for efficient caching. Cost model: $0.01 per Podscan API call (2 calls per podcast). Returns empty array if no sheet found.",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client (used to look up google_sheet_url)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          podcasts: [
            {
              podcast_id: "pod_abc123",
              podcast_name: "The Marketing Hour",
              podcast_description: "Weekly marketing insights...",
              podcast_image_url: "https://...",
              podcast_url: "https://...",
              publisher_name: "Sarah Lee",
              itunes_rating: 4.5,
              episode_count: 200,
              audience_size: 25000,
              podscan_email: "host@example.com"
            }
          ],
          total: 25,
          cached: 20,
          fetched: 5,
          cachePerformance: {
            cacheHitRate: 80,
            apiCallsSaved: 40,
            apiCallsMade: 10,
            costSavings: 0.40,
            costSpent: 0.10
          }
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "get-client-outreach-podcasts",
        name: "Get Client Outreach Podcasts",
        method: "POST",
        path: `${BASE_PATH}/get-client-outreach-podcasts`,
        description: "Returns podcast IDs from a client's Google Sheet column E. Does NOT call the Podscan API (due to DNS limitations in Supabase Edge Functions). Use get-outreach-podcasts-v2 instead for full data.",
        auth: "API Key",
        notes: "Legacy endpoint - prefer get-outreach-podcasts-v2. Returns podcast IDs only, not full details. Frontend is responsible for fetching podcast data. Returns debug info if no podcasts found.",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({
          success: true,
          podcastIds: ["pod_abc123", "pod_def456", "pod_ghi789"],
          total: 3
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "get-outreach-podcasts-v2",
        name: "Get Outreach Podcasts V2",
        method: "POST",
        path: `${BASE_PATH}/get-outreach-podcasts-v2`,
        description: "Enhanced version that actually fetches full podcast data from Podscan API (solves DNS issue from v1). Reads Google Sheet column E, checks central cache with 7-day staleness, fetches missing/stale podcasts in batches of 5, and includes podscan_email in response.",
        auth: "API Key",
        notes: "Replaces get-client-outreach-podcasts. Uses individual upserts per podcast (not batch). Includes podscan_email field. Multiple fallback paths for Podscan data fields.",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({
          success: true,
          podcasts: [
            {
              podcast_id: "pod_abc123",
              podcast_name: "Growth Hacking Today",
              podcast_description: "Tactical growth strategies...",
              podcast_image_url: "https://...",
              podcast_url: "https://...",
              publisher_name: "Mike Chen",
              itunes_rating: 4.7,
              episode_count: 300,
              audience_size: 100000,
              podscan_email: "mike@growthhacking.com"
            }
          ],
          total: 25
        }, null, 2),
        category: "podcast-discovery",
      },
    ],
  },
  {
    id: "client-management",
    name: "Client Management",
    description: "Create and manage client accounts, Google Sheets, bookings, and podcast data.",
    endpoints: [
      {
        id: "create-client-account",
        name: "Create Client Account",
        method: "POST",
        path: `${BASE_PATH}/create-client-account`,
        description: "Creates a new client account with optional portal access, Google Sheet creation, and invitation email.",
        auth: "API Key",
        params: [
          { name: "name", type: "string", required: true, description: "Client's full name" },
          { name: "email", type: "string", required: true, description: "Client's email address" },
          { name: "bio", type: "string", required: false, description: "Client's bio text" },
          { name: "linkedin_url", type: "string", required: false, description: "LinkedIn profile URL" },
          { name: "website", type: "string", required: false, description: "Website URL" },
          { name: "calendar_link", type: "string", required: false, description: "Scheduling link" },
          { name: "contact_person", type: "string", required: false, description: "Contact person name" },
          { name: "enable_portal_access", type: "boolean", required: false, description: "Enable client portal. Defaults to true" },
          { name: "password", type: "string", required: false, description: "Portal password" },
          { name: "create_google_sheet", type: "boolean", required: false, description: "Create tracking sheet. Defaults to false" },
        ],
        responseExample: JSON.stringify({
          success: true,
          message: "Client account created successfully",
          client: { client_id: "uuid", name: "John Doe", email: "john@example.com", status: "active", portal_access_enabled: true, dashboard_slug: "abc123", dashboard_url: "https://getonapod.com/client/abc123" }
        }, null, 2),
        category: "client-management",
      },
      {
        id: "create-client-google-sheet",
        name: "Create Client Google Sheet",
        method: "POST",
        path: `${BASE_PATH}/create-client-google-sheet`,
        description: "Creates a formatted Google Sheet for tracking a client's podcast outreach by copying a template.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "clientName", type: "string", required: true, description: "Client's display name for the sheet title" },
          { name: "ownerEmail", type: "string", required: false, description: "Email to share the sheet with" },
        ],
        responseExample: JSON.stringify({
          success: true,
          spreadsheetId: "1abc...",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/..."
        }, null, 2),
        category: "client-management",
      },
      {
        id: "get-client-bookings",
        name: "Get Client Bookings",
        method: "POST",
        path: `${BASE_PATH}/get-client-bookings`,
        description: "Retrieves all podcast bookings and outreach messages for a client with optional session validation.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "sessionToken", type: "string", required: false, description: "Optional session token for portal auth" },
        ],
        responseExample: JSON.stringify({
          bookings: [{ id: "uuid", podcast_name: "The Growth Show", status: "confirmed", recording_date: "2025-03-15" }],
          outreachMessages: [{ id: "uuid", podcast_name: "Startup Stories", status: "sent" }]
        }, null, 2),
        category: "client-management",
      },
      {
        id: "get-client-podcasts",
        name: "Get Client Podcasts",
        method: "POST",
        path: `${BASE_PATH}/get-client-podcasts`,
        description: "Fetches podcast data for a client from their Google Sheet with central cache, Podscan enrichment, and AI analysis. Same architecture as get-prospect-podcasts.",
        auth: "API Key",
        params: [
          { name: "spreadsheetId", type: "string", required: true, description: "Google Sheet ID" },
          { name: "clientId", type: "string", required: false, description: "UUID of the client" },
          { name: "clientName", type: "string", required: false, description: "Client name for AI analysis" },
          { name: "clientBio", type: "string", required: false, description: "Client bio for AI analysis" },
          { name: "cacheOnly", type: "boolean", required: false, description: "Skip Podscan, cache only" },
          { name: "skipAiAnalysis", type: "boolean", required: false, description: "Don't run AI analysis" },
        ],
        responseExample: JSON.stringify({
          success: true,
          podcasts: [{ podcast_id: "pod_abc123", podcast_name: "Startup Stories", publisher_name: "Jane Smith", itunes_rating: 4.8, audience_size: 50000 }],
          total: 15,
          cached: 12,
          fetched: 3,
          cachePerformance: { cacheHitRate: 80, apiCallsSaved: 24, costSavings: 0.24 }
        }, null, 2),
        category: "client-management",
      },
    ],
  },
  {
    id: "auth-portal",
    name: "Authentication & Portal",
    description: "Handle client portal authentication (not prospects). Clients log in via password or magic link to access their portal dashboard, bookings, and outreach data. Sessions are stored in client_portal_sessions.",
    endpoints: [
      {
        id: "login-with-password",
        name: "Login with Password",
        method: "POST",
        path: `${BASE_PATH}/login-with-password`,
        description: "Authenticates a client (from the clients table) with email and password. Checks portal_access_enabled, creates a client_portal_session token (24-hour expiry), and logs attempts to client_portal_activity_log with rate limiting.",
        auth: "None",
        params: [
          { name: "email", type: "string", required: true, description: "Client's email address (matched against clients table)" },
          { name: "password", type: "string", required: true, description: "Client's portal password (checked against clients.portal_password)" },
        ],
        responseExample: JSON.stringify({
          session_token: "session-token-here",
          client: { id: "uuid", name: "John Doe", email: "john@example.com" },
          expires_at: "2025-02-15T00:00:00Z"
        }, null, 2),
        category: "auth-portal",
      },
      {
        id: "send-portal-magic-link",
        name: "Send Portal Magic Link",
        method: "POST",
        path: `${BASE_PATH}/send-portal-magic-link`,
        description: "Sends a passwordless magic link email to a client (looked up in clients table) via Resend. Creates a client_portal_token (15-minute expiry) with rate limiting and suppression checks. Not for prospects.",
        auth: "None",
        params: [
          { name: "email", type: "string", required: true, description: "Client's email address (must exist in clients table with portal_access_enabled)" },
        ],
        responseExample: JSON.stringify({ success: true, message: "Magic link sent" }, null, 2),
        category: "auth-portal",
      },
      {
        id: "verify-portal-token",
        name: "Verify Portal Token",
        method: "POST",
        path: `${BASE_PATH}/verify-portal-token`,
        description: "Validates a client's magic link token from client_portal_tokens, marks it as used, and creates a new client_portal_session (24-hour expiry). Returns the authenticated client record.",
        auth: "None",
        params: [
          { name: "token", type: "string", required: true, description: "Magic link token from email" },
        ],
        responseExample: JSON.stringify({
          success: true,
          session: { session_token: "token", expires_at: "2025-02-15T00:00:00Z", client_id: "uuid" },
          client: { id: "uuid", name: "John Doe", email: "john@example.com" }
        }, null, 2),
        category: "auth-portal",
      },
      {
        id: "validate-portal-session",
        name: "Validate Portal Session",
        method: "POST",
        path: `${BASE_PATH}/validate-portal-session`,
        description: "Validates an existing client_portal_session token, checks expiry, updates last_active_at, and returns the associated client record.",
        auth: "Session Token",
        params: [
          { name: "sessionToken", type: "string", required: true, description: "Active session token" },
        ],
        responseExample: JSON.stringify({ success: true, client: { id: "uuid", name: "John Doe", email: "john@example.com" } }, null, 2),
        category: "auth-portal",
      },
      {
        id: "logout-portal-session",
        name: "Logout Portal Session",
        method: "POST",
        path: `${BASE_PATH}/logout-portal-session`,
        description: "Deletes a client_portal_session and logs the logout to client_portal_activity_log.",
        auth: "Session Token",
        params: [
          { name: "sessionToken", type: "string", required: true, description: "Session token to invalidate" },
        ],
        responseExample: JSON.stringify({ success: true }, null, 2),
        category: "auth-portal",
      },
    ],
  },
  {
    id: "outreach-email",
    name: "Outreach & Email",
    description: "Create outreach messages, trigger email campaigns, manage Bison leads, and fetch email threads.",
    endpoints: [
      {
        id: "create-outreach-message",
        name: "Create Outreach Message",
        method: "POST",
        path: `${BASE_PATH}/create-outreach-message`,
        description: "Creates an outreach message from Clay data with podcast and host information for email campaigns.",
        auth: "API Key",
        params: [
          { name: "client_id", type: "string", required: true, description: "UUID of the client" },
          { name: "final_host_email", type: "string", required: true, description: "Host's email address" },
          { name: "email_1", type: "string", required: true, description: "Email body content" },
          { name: "subject_line", type: "string", required: true, description: "Email subject line" },
          { name: "host_name", type: "string", required: false, description: "Host's name" },
          { name: "podcast_name", type: "string", required: false, description: "Podcast name" },
          { name: "podcast_id", type: "string", required: false, description: "Podcast ID" },
        ],
        responseExample: JSON.stringify({ success: true, message: "Outreach message created", data: { id: "uuid", client_id: "uuid", podcast_name: "The Growth Show", status: "pending" } }, null, 2),
        category: "outreach-email",
      },
      {
        id: "send-outreach-webhook",
        name: "Send Outreach Webhook",
        method: "POST",
        path: `${BASE_PATH}/send-outreach-webhook`,
        description: "Sends a podcast outreach event to a configured client webhook URL.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcastId", type: "string", required: true, description: "ID of the podcast" },
        ],
        responseExample: JSON.stringify({ success: true, message: "Webhook sent", webhookStatus: 200 }, null, 2),
        category: "outreach-email",
      },
      {
        id: "create-bison-lead",
        name: "Create Bison Lead",
        method: "POST",
        path: `${BASE_PATH}/create-bison-lead`,
        description: "Creates or updates a lead in Bison CRM from an outreach message, optionally attaching to a campaign.",
        auth: "API Key",
        params: [
          { name: "message_id", type: "string", required: true, description: "Outreach message ID to convert" },
        ],
        responseExample: JSON.stringify({ success: true, lead_id: 12345, lead_already_existed: false, campaign_attached: true, campaign_id: 678 }, null, 2),
        category: "outreach-email",
      },
      {
        id: "send-reply",
        name: "Send Reply",
        method: "POST",
        path: `${BASE_PATH}/send-reply`,
        description: "Sends a reply to an email via the Bison email API.",
        auth: "API Key",
        params: [
          { name: "bisonReplyId", type: "string", required: true, description: "Bison reply ID" },
          { name: "message", type: "string", required: true, description: "Reply message body" },
          { name: "subject", type: "string", required: false, description: "Email subject" },
        ],
        responseExample: JSON.stringify({ success: true, message: "Reply sent" }, null, 2),
        category: "outreach-email",
      },
      {
        id: "fetch-email-thread",
        name: "Fetch Email Thread",
        method: "POST",
        path: `${BASE_PATH}/fetch-email-thread`,
        description: "Fetches a full email conversation thread from Bison by reply ID.",
        auth: "API Key",
        params: [
          { name: "replyId", type: "string", required: true, description: "Bison reply ID" },
        ],
        responseExample: JSON.stringify({ success: true, data: { messages: [{ from: "you@company.com", to: "host@podcast.com", subject: "Guest Pitch", body: "Hi..." }] } }, null, 2),
        category: "outreach-email",
      },
    ],
  },
  {
    id: "webhooks",
    name: "Webhooks",
    description: "Receive and process incoming webhooks from Stripe, Resend, and Bison.",
    endpoints: [
      {
        id: "stripe-webhook",
        name: "Stripe Webhook",
        method: "POST",
        path: `${BASE_PATH}/stripe-webhook`,
        description: "Processes Stripe events: checkout.session.completed, payment_intent.payment_failed, charge.refunded.",
        auth: "Webhook Signature",
        params: [{ name: "(Stripe Event)", type: "object", required: true, description: "Stripe webhook event payload" }],
        responseExample: JSON.stringify({ received: true }, null, 2),
        category: "webhooks",
      },
      {
        id: "resend-webhook",
        name: "Resend Webhook",
        method: "POST",
        path: `${BASE_PATH}/resend-webhook`,
        description: "Processes Resend email events: sent, delivered, delayed, bounced, complained, opened, clicked.",
        auth: "Webhook Signature",
        params: [{ name: "(Resend Event)", type: "object", required: true, description: "Resend webhook event payload" }],
        responseExample: JSON.stringify({ received: true, event_type: "email.delivered" }, null, 2),
        category: "webhooks",
      },
      {
        id: "campaign-reply-webhook",
        name: "Campaign Reply Webhook",
        method: "POST",
        path: `${BASE_PATH}/campaign-reply-webhook`,
        description: "Processes Bison campaign reply events with duplicate detection.",
        auth: "Webhook Signature",
        params: [{ name: "(Bison Event)", type: "object", required: true, description: "Bison campaign reply payload" }],
        responseExample: JSON.stringify({ success: true, message: "Reply processed", reply_id: "uuid" }, null, 2),
        category: "webhooks",
      },
    ],
  },
  {
    id: "sales-analytics",
    name: "Sales Analytics",
    description: "Analyze and classify sales calls, sync Fathom recordings, and process email replies.",
    endpoints: [
      {
        id: "analyze-sales-call",
        name: "Analyze Sales Call",
        method: "POST",
        path: `${BASE_PATH}/analyze-sales-call`,
        description: "Analyzes a sales call transcript against the Corey Jackson Sales Framework using Claude AI.",
        auth: "API Key",
        params: [
          { name: "sales_call_id", type: "string", required: true, description: "UUID of the sales call" },
          { name: "recording_id", type: "string", required: false, description: "Fathom recording ID" },
        ],
        responseExample: JSON.stringify({ success: true, data: { overall_score: 78, framework_adherence_score: 82, strengths: ["Strong discovery"], recommendations: ["Improve close"] } }, null, 2),
        category: "sales-analytics",
      },
      {
        id: "classify-sales-call",
        name: "Classify Sales Call",
        method: "POST",
        path: `${BASE_PATH}/classify-sales-call`,
        description: "Classifies a call as 'sales' or 'non-sales' using Claude Haiku.",
        auth: "API Key",
        params: [{ name: "sales_call_id", type: "string", required: true, description: "UUID of the sales call" }],
        responseExample: JSON.stringify({ success: true, data: { call_type: "sales" } }, null, 2),
        category: "sales-analytics",
      },
      {
        id: "sync-fathom-calls",
        name: "Sync Fathom Calls",
        method: "POST",
        path: `${BASE_PATH}/sync-fathom-calls`,
        description: "Syncs recent call recordings from Fathom API into the database.",
        auth: "API Key",
        params: [{ name: "daysBack", type: "number", required: false, description: "Days to look back. Defaults to 30" }],
        responseExample: JSON.stringify({ success: true, data: { total_meetings: 12, new_calls: 3, updated_calls: 9 } }, null, 2),
        category: "sales-analytics",
      },
      {
        id: "sync-replies",
        name: "Sync Replies",
        method: "POST",
        path: `${BASE_PATH}/sync-replies`,
        description: "Syncs email replies from Bison with smart sync and duplicate detection.",
        auth: "API Key",
        params: [
          { name: "syncType", type: "string", required: false, description: "'manual' or 'auto'. Defaults to 'manual'" },
          { name: "unreadOnly", type: "boolean", required: false, description: "Only sync unread. Defaults to false" },
          { name: "daysBack", type: "number", required: false, description: "Days to look back. Defaults to 7" },
        ],
        responseExample: JSON.stringify({ success: true, data: { total_processed: 8, new_replies: 2, updated_replies: 4, skipped_replies: 2 } }, null, 2),
        category: "sales-analytics",
      },
    ],
  },
  {
    id: "payments",
    name: "Payments",
    description: "Handle Stripe checkout sessions and manage outreach podcast deletions.",
    endpoints: [
      {
        id: "create-checkout-session",
        name: "Create Checkout Session",
        method: "POST",
        path: `${BASE_PATH}/create-checkout-session`,
        description: "Creates a Stripe Checkout session for premium placement purchases.",
        auth: "None",
        params: [
          { name: "cartItems", type: "object[]", required: true, description: "Array of items with podcastId, podcastName, price, priceDisplay" },
          { name: "customerEmail", type: "string", required: true, description: "Customer's email" },
          { name: "customerName", type: "string", required: true, description: "Customer's name" },
        ],
        responseExample: JSON.stringify({ sessionId: "cs_live_...", url: "https://checkout.stripe.com/..." }, null, 2),
        category: "payments",
      },
      {
        id: "create-addon-checkout",
        name: "Create Add-on Checkout",
        method: "POST",
        path: `${BASE_PATH}/create-addon-checkout`,
        description: "Creates a Stripe Checkout session for add-on services linked to a client.",
        auth: "API Key",
        params: [
          { name: "addons", type: "object[]", required: true, description: "Array with bookingId and serviceId" },
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({ sessionId: "cs_live_...", url: "https://checkout.stripe.com/..." }, null, 2),
        category: "payments",
      },
      {
        id: "delete-outreach-podcast",
        name: "Delete Outreach Podcast",
        method: "POST",
        path: `${BASE_PATH}/delete-outreach-podcast`,
        description: "Removes a podcast from a client's Google Sheet outreach list.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcastId", type: "string", required: true, description: "Podcast ID to remove" },
        ],
        responseExample: JSON.stringify({ success: true, message: "Deleted podcast from row 5", deletedRow: 5 }, null, 2),
        category: "payments",
      },
    ],
  },
  {
    id: "seo-integrations",
    name: "SEO & Integrations",
    description: "Submit URLs for Google indexing, check status, and export to Google Sheets.",
    endpoints: [
      {
        id: "submit-to-indexing",
        name: "Submit to Indexing",
        method: "POST",
        path: `${BASE_PATH}/submit-to-indexing`,
        description: "Submits a URL to Google's Indexing API for fast indexing.",
        auth: "API Key",
        params: [
          { name: "url", type: "string", required: true, description: "URL to submit" },
          { name: "postId", type: "string", required: true, description: "Blog post ID for tracking" },
        ],
        responseExample: JSON.stringify({ success: true, message: "URL submitted for indexing" }, null, 2),
        category: "seo-integrations",
      },
      {
        id: "check-indexing-status",
        name: "Check Indexing Status",
        method: "POST",
        path: `${BASE_PATH}/check-indexing-status`,
        description: "Checks Google indexing status via Search Console API.",
        auth: "API Key",
        params: [
          { name: "url", type: "string", required: true, description: "URL to check" },
          { name: "postId", type: "string", required: true, description: "Blog post ID" },
        ],
        responseExample: JSON.stringify({ success: true, data: { isIndexed: true, coverageState: "Submitted and indexed", lastCrawlTime: "2025-01-14T08:00:00Z" } }, null, 2),
        category: "seo-integrations",
      },
      {
        id: "export-to-google-sheets",
        name: "Export to Google Sheets",
        method: "POST",
        path: `${BASE_PATH}/export-to-google-sheets`,
        description: "Exports podcast data to a client's Google Sheet with central cache saving.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcasts", type: "object[]", required: true, description: "Array of podcast objects" },
        ],
        responseExample: JSON.stringify({ success: true, rowsAdded: 15, updatedRange: "Sheet1", cacheSaved: 12, cacheSkipped: 2, cacheErrors: 1 }, null, 2),
        category: "seo-integrations",
      },
    ],
  },
  {
    id: "admin",
    name: "Admin",
    description: "Manage admin user accounts and permissions.",
    endpoints: [
      {
        id: "manage-admin-users",
        name: "Manage Admin Users",
        method: "POST",
        path: `${BASE_PATH}/manage-admin-users`,
        description: "Admin user management: list, create, delete, reset-password. Requires JWT Bearer token from an existing admin.",
        auth: "API Key",
        params: [
          { name: "action", type: "string", required: true, description: "'list', 'create', 'delete', or 'reset-password'" },
          { name: "email", type: "string", required: false, description: "Required for create/delete/reset-password" },
          { name: "password", type: "string", required: false, description: "For create action. Min 8 characters" },
          { name: "newPassword", type: "string", required: false, description: "For reset-password. Min 8 characters" },
          { name: "name", type: "string", required: false, description: "Admin display name" },
        ],
        responseExample: JSON.stringify({ success: true, admins: [{ id: "uuid", email: "admin@getonapod.com", role: "super_admin", name: "Jonathan" }] }, null, 2),
        category: "admin",
      },
    ],
  },
];

export function getAllEndpoints(): ApiEndpoint[] {
  return API_CATEGORIES.flatMap((cat) => cat.endpoints);
}

export function getEndpointById(id: string): ApiEndpoint | undefined {
  return getAllEndpoints().find((e) => e.id === id);
}

export function searchEndpoints(query: string): ApiEndpoint[] {
  const lower = query.toLowerCase();
  return getAllEndpoints().filter(
    (e) =>
      e.name.toLowerCase().includes(lower) ||
      e.description.toLowerCase().includes(lower) ||
      e.path.toLowerCase().includes(lower) ||
      e.id.toLowerCase().includes(lower) ||
      (e.aiModel && e.aiModel.toLowerCase().includes(lower))
  );
}

export function generateCurlExample(endpoint: ApiEndpoint): string {
  const url = `https://YOUR_PROJECT_REF.supabase.co${endpoint.path}`;
  const hasBody = endpoint.params.length > 0 && endpoint.method === "POST";

  const bodyObj: Record<string, unknown> = {};
  if (hasBody) {
    for (const p of endpoint.params.filter((p) => p.required && !p.name.startsWith("("))) {
      if (p.type === "string") bodyObj[p.name] = `your-${p.name}`;
      else if (p.type === "string[]") bodyObj[p.name] = ["value1", "value2"];
      else if (p.type === "number") bodyObj[p.name] = 0;
      else if (p.type === "boolean") bodyObj[p.name] = true;
      else if (p.type.includes("[]")) bodyObj[p.name] = [];
      else bodyObj[p.name] = `your-${p.name}`;
    }
  }

  let cmd = `curl -X ${endpoint.method} "${url}"`;
  cmd += ` \\\n  -H "Content-Type: application/json"`;
  if (endpoint.auth === "API Key") {
    cmd += ` \\\n  -H "Authorization: Bearer YOUR_ANON_KEY"`;
    cmd += ` \\\n  -H "apikey: YOUR_ANON_KEY"`;
  }
  if (hasBody && Object.keys(bodyObj).length > 0) {
    cmd += ` \\\n  -d '${JSON.stringify(bodyObj, null, 2)}'`;
  }

  return cmd;
}

export function generateJsExample(endpoint: ApiEndpoint): string {
  const url = `https://YOUR_PROJECT_REF.supabase.co${endpoint.path}`;
  const hasBody = endpoint.params.length > 0 && endpoint.method === "POST";

  const bodyObj: Record<string, unknown> = {};
  if (hasBody) {
    for (const p of endpoint.params.filter((p) => p.required && !p.name.startsWith("("))) {
      if (p.type === "string") bodyObj[p.name] = `your-${p.name}`;
      else if (p.type === "string[]") bodyObj[p.name] = ["value1", "value2"];
      else if (p.type === "number") bodyObj[p.name] = 0;
      else if (p.type === "boolean") bodyObj[p.name] = true;
      else if (p.type.includes("[]")) bodyObj[p.name] = [];
      else bodyObj[p.name] = `your-${p.name}`;
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (endpoint.auth === "API Key") {
    headers["Authorization"] = "Bearer YOUR_ANON_KEY";
    headers["apikey"] = "YOUR_ANON_KEY";
  }

  let code = `const response = await fetch("${url}", {\n`;
  code += `  method: "${endpoint.method}",\n`;
  code += `  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, "\n  ")},\n`;
  if (hasBody && Object.keys(bodyObj).length > 0) {
    code += `  body: JSON.stringify(${JSON.stringify(bodyObj, null, 4).replace(/\n/g, "\n  ")})\n`;
  }
  code += `});\n\nconst data = await response.json();\nconsole.log(data);`;

  return code;
}

export function generatePythonExample(endpoint: ApiEndpoint): string {
  const url = `https://YOUR_PROJECT_REF.supabase.co${endpoint.path}`;
  const hasBody = endpoint.params.length > 0 && endpoint.method === "POST";

  const bodyObj: Record<string, unknown> = {};
  if (hasBody) {
    for (const p of endpoint.params.filter((p) => p.required && !p.name.startsWith("("))) {
      if (p.type === "string") bodyObj[p.name] = `your-${p.name}`;
      else if (p.type === "string[]") bodyObj[p.name] = ["value1", "value2"];
      else if (p.type === "number") bodyObj[p.name] = 0;
      else if (p.type === "boolean") bodyObj[p.name] = true;
      else if (p.type.includes("[]")) bodyObj[p.name] = [];
      else bodyObj[p.name] = `your-${p.name}`;
    }
  }

  let code = `import requests\n\n`;
  code += `url = "${url}"\n`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (endpoint.auth === "API Key") {
    headers["Authorization"] = "Bearer YOUR_ANON_KEY";
    headers["apikey"] = "YOUR_ANON_KEY";
  }

  code += `headers = ${JSON.stringify(headers, null, 4).replace(/"/g, '"')}\n`;

  if (hasBody && Object.keys(bodyObj).length > 0) {
    code += `payload = ${JSON.stringify(bodyObj, null, 4)}\n\n`;
    code += `response = requests.post(url, json=payload, headers=headers)\n`;
  } else {
    code += `\nresponse = requests.post(url, headers=headers)\n`;
  }
  code += `print(response.json())`;

  return code;
}
