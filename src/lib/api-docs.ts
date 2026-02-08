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
    id: "client-management",
    name: "Client Management",
    description: "Create and manage client accounts, Google Sheets, bookings, and podcast data.",
    endpoints: [
      {
        id: "create-client-account",
        name: "Create Client Account",
        method: "POST",
        path: `${BASE_PATH}/create-client-account`,
        description: "Creates a new client account with full onboarding data including bio generation, Google Sheet setup, and Bison campaign creation.",
        auth: "API Key",
        params: [
          { name: "name", type: "string", required: true, description: "Client's full name" },
          { name: "email", type: "string", required: true, description: "Client's email address" },
          { name: "company", type: "string", required: false, description: "Client's company name" },
          { name: "title", type: "string", required: false, description: "Client's job title" },
          { name: "industry", type: "string", required: false, description: "Client's industry" },
          { name: "bio", type: "string", required: false, description: "Client's bio text" },
          { name: "topics", type: "string[]", required: false, description: "Array of podcast topics of interest" },
          { name: "targetAudience", type: "string", required: false, description: "Description of target audience" },
          { name: "goals", type: "string", required: false, description: "Client's podcast guesting goals" },
          { name: "linkedinUrl", type: "string", required: false, description: "LinkedIn profile URL" },
          { name: "websiteUrl", type: "string", required: false, description: "Personal or company website URL" },
          { name: "headshotUrl", type: "string", required: false, description: "URL to client's headshot image" },
          { name: "calendarLink", type: "string", required: false, description: "Calendly or scheduling link" },
        ],
        responseExample: JSON.stringify({
          success: true,
          client: {
            id: "uuid-here",
            name: "John Doe",
            email: "john@example.com",
            status: "active"
          },
          googleSheet: { spreadsheetId: "1abc...", url: "https://docs.google.com/spreadsheets/d/..." },
          bisonCampaign: { id: "campaign-123" }
        }, null, 2),
        category: "client-management",
      },
      {
        id: "create-client-google-sheet",
        name: "Create Client Google Sheet",
        method: "POST",
        path: `${BASE_PATH}/create-client-google-sheet`,
        description: "Creates a formatted Google Sheet for tracking a client's podcast outreach, bookings, and status.",
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
        description: "Retrieves all podcast bookings for a specific client, including episode details and status.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({
          bookings: [
            {
              id: "booking-uuid",
              podcast_name: "The Growth Show",
              status: "confirmed",
              recording_date: "2025-03-15",
              episode_url: null
            }
          ]
        }, null, 2),
        category: "client-management",
      },
      {
        id: "get-client-podcasts",
        name: "Get Client Podcasts",
        method: "POST",
        path: `${BASE_PATH}/get-client-podcasts`,
        description: "Fetches podcast data for a client from their Google Sheet, including outreach status, podcast details, and approval states.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: false, description: "UUID of the client" },
          { name: "slug", type: "string", required: false, description: "Client's URL slug (alternative to clientId)" },
        ],
        responseExample: JSON.stringify({
          podcasts: [
            {
              id: "row-1",
              podcast_name: "Startup Stories",
              status: "pitched",
              host_name: "Jane Smith",
              audience_size: "50K",
              categories: ["Business", "Entrepreneurship"]
            }
          ],
          client: { name: "John Doe", slug: "john-doe" }
        }, null, 2),
        category: "client-management",
      },
    ],
  },
  {
    id: "prospect-dashboards",
    name: "Prospect Dashboards",
    description: "Create and manage public-facing prospect dashboards with curated podcast lists.",
    endpoints: [
      {
        id: "create-prospect-sheet",
        name: "Create Prospect Sheet",
        method: "POST",
        path: `${BASE_PATH}/create-prospect-sheet`,
        description: "Creates a new prospect dashboard with a Google Sheet backend, including formatted podcast data and a public shareable link.",
        auth: "API Key",
        params: [
          { name: "prospectName", type: "string", required: true, description: "Name of the prospect" },
          { name: "prospectBio", type: "string", required: false, description: "Brief bio or description of the prospect" },
          { name: "prospectImageUrl", type: "string", required: false, description: "URL to prospect's profile image" },
          { name: "podcasts", type: "object[]", required: true, description: "Array of podcast objects to include in the dashboard" },
        ],
        responseExample: JSON.stringify({
          success: true,
          dashboard: {
            id: "uuid",
            slug: "john-doe-abc123",
            url: "https://getonapod.com/prospect/john-doe-abc123",
            spreadsheetId: "1abc..."
          }
        }, null, 2),
        category: "prospect-dashboards",
      },
      {
        id: "append-prospect-sheet",
        name: "Append Prospect Sheet",
        method: "POST",
        path: `${BASE_PATH}/append-prospect-sheet`,
        description: "Adds additional podcasts to an existing prospect dashboard's Google Sheet.",
        auth: "API Key",
        params: [
          { name: "dashboardId", type: "string", required: true, description: "UUID of the prospect dashboard" },
          { name: "podcasts", type: "object[]", required: true, description: "Array of podcast objects to append" },
        ],
        responseExample: JSON.stringify({
          success: true,
          addedCount: 5
        }, null, 2),
        category: "prospect-dashboards",
      },
      {
        id: "get-prospect-podcasts",
        name: "Get Prospect Podcasts",
        method: "POST",
        path: `${BASE_PATH}/get-prospect-podcasts`,
        description: "Retrieves all podcasts from a prospect dashboard by slug or ID, used to render the public prospect view.",
        auth: "None",
        params: [
          { name: "slug", type: "string", required: false, description: "Public URL slug of the prospect dashboard" },
          { name: "dashboardId", type: "string", required: false, description: "UUID of the dashboard (alternative to slug)" },
        ],
        responseExample: JSON.stringify({
          podcasts: [
            {
              podcast_name: "The Marketing Hour",
              audience_size: "25K",
              categories: ["Marketing"],
              host_name: "Sarah Lee",
              reach_score: 85,
              why_this_show: "Great fit for B2B topics..."
            }
          ],
          dashboard: { name: "John Doe", bio: "CEO of Acme Corp" }
        }, null, 2),
        category: "prospect-dashboards",
      },
      {
        id: "delete-podcast-from-sheet",
        name: "Delete Podcast from Sheet",
        method: "POST",
        path: `${BASE_PATH}/delete-podcast-from-sheet`,
        description: "Removes a specific podcast row from a prospect dashboard's Google Sheet.",
        auth: "API Key",
        params: [
          { name: "spreadsheetId", type: "string", required: true, description: "Google Sheet ID" },
          { name: "podcastId", type: "string", required: true, description: "ID of the podcast row to delete" },
        ],
        responseExample: JSON.stringify({
          success: true,
          message: "Podcast removed from sheet"
        }, null, 2),
        category: "prospect-dashboards",
      },
    ],
  },
  {
    id: "ai-content",
    name: "AI Content Generation",
    description: "Generate AI-powered content including taglines, bios, podcast summaries, search queries, guest resources, and blog posts.",
    endpoints: [
      {
        id: "generate-tagline",
        name: "Generate Tagline",
        method: "POST",
        path: `${BASE_PATH}/generate-tagline`,
        description: "Generates a catchy tagline for a client based on their profile and industry using Claude AI.",
        auth: "API Key",
        params: [
          { name: "name", type: "string", required: true, description: "Client's name" },
          { name: "company", type: "string", required: false, description: "Company name" },
          { name: "industry", type: "string", required: false, description: "Industry vertical" },
          { name: "bio", type: "string", required: false, description: "Client bio for context" },
        ],
        responseExample: JSON.stringify({
          tagline: "Helping SaaS founders scale to $10M ARR through strategic podcast appearances"
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-client-bio",
        name: "Generate Client Bio",
        method: "POST",
        path: `${BASE_PATH}/generate-client-bio`,
        description: "Generates a professional bio optimized for podcast guest pitches using onboarding data and Claude AI.",
        auth: "API Key",
        params: [
          { name: "name", type: "string", required: true, description: "Client's full name" },
          { name: "company", type: "string", required: false, description: "Company name" },
          { name: "title", type: "string", required: false, description: "Job title" },
          { name: "industry", type: "string", required: false, description: "Industry" },
          { name: "topics", type: "string[]", required: false, description: "Topics of expertise" },
          { name: "targetAudience", type: "string", required: false, description: "Target audience description" },
          { name: "goals", type: "string", required: false, description: "Podcast guesting goals" },
          { name: "linkedinUrl", type: "string", required: false, description: "LinkedIn URL for additional context" },
          { name: "websiteUrl", type: "string", required: false, description: "Website URL for additional context" },
        ],
        responseExample: JSON.stringify({
          bio: "John Doe is the founder and CEO of Acme Corp, a leading...",
          shortBio: "Founder of Acme Corp. Expert in B2B SaaS growth.",
          talkingPoints: ["Scaling from $1M to $10M ARR", "Building remote-first teams"]
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-podcast-summary",
        name: "Generate Podcast Summary",
        method: "POST",
        path: `${BASE_PATH}/generate-podcast-summary`,
        description: "Generates a compelling 'Why This Show' description for a podcast, explaining why a guest should appear on it.",
        auth: "API Key",
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
          summary: "The Growth Show reaches an engaged audience of 50K+ business leaders..."
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-podcast-queries",
        name: "Generate Podcast Queries",
        method: "POST",
        path: `${BASE_PATH}/generate-podcast-queries`,
        description: "Generates optimized search queries for finding relevant podcasts based on client and prospect profiles.",
        auth: "API Key",
        params: [
          { name: "clientName", type: "string", required: true, description: "Client's name" },
          { name: "clientBio", type: "string", required: true, description: "Client's bio" },
          { name: "clientEmail", type: "string", required: false, description: "Client's email" },
          { name: "oldQuery", type: "string", required: false, description: "Previous query to improve upon" },
          { name: "prospectName", type: "string", required: false, description: "Prospect name for targeted queries" },
          { name: "prospectBio", type: "string", required: false, description: "Prospect bio for targeted queries" },
        ],
        responseExample: JSON.stringify({
          queries: [
            "B2B SaaS founder podcast interview",
            "startup growth strategy podcast",
            "entrepreneur leadership podcast guest"
          ]
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-guest-resource",
        name: "Generate Guest Resource",
        method: "POST",
        path: `${BASE_PATH}/generate-guest-resource`,
        description: "Generates downloadable guest resources (guides, checklists, templates) on a given topic using AI.",
        auth: "API Key",
        params: [
          { name: "topic", type: "string", required: true, description: "Topic for the resource" },
          { name: "category", type: "string", required: false, description: "Resource category" },
          { name: "resourceType", type: "string", required: false, description: "Type: 'guide', 'checklist', or 'template'. Defaults to 'guide'" },
        ],
        responseExample: JSON.stringify({
          title: "The Ultimate Podcast Guesting Checklist",
          content: "# Podcast Guesting Checklist\n\n## Before the Interview\n- [ ] Research the host...",
          resourceType: "checklist"
        }, null, 2),
        category: "ai-content",
      },
      {
        id: "generate-blog-content",
        name: "Generate Blog Content",
        method: "POST",
        path: `${BASE_PATH}/generate-blog-content`,
        description: "Generates a full blog post with title, meta description, and formatted content using Claude AI.",
        auth: "API Key",
        params: [
          { name: "topic", type: "string", required: true, description: "Blog post topic" },
          { name: "category", type: "string", required: false, description: "Blog category" },
          { name: "keywords", type: "string[]", required: false, description: "Target SEO keywords" },
          { name: "tone", type: "string", required: false, description: "Writing tone. Defaults to 'professional'" },
          { name: "wordCount", type: "number", required: false, description: "Target word count. Defaults to 1500" },
        ],
        responseExample: JSON.stringify({
          title: "How to Get Booked on Top Podcasts in 2025",
          metaDescription: "Learn the proven strategies...",
          content: "<h2>Introduction</h2><p>Podcast guesting is one of the most effective...</p>",
          category: "Podcast Strategy"
        }, null, 2),
        category: "ai-content",
      },
    ],
  },
  {
    id: "podcast-discovery",
    name: "Podcast Discovery & Analysis",
    description: "Find, score, and analyze podcasts for compatibility with client profiles.",
    endpoints: [
      {
        id: "score-podcast-compatibility",
        name: "Score Podcast Compatibility",
        method: "POST",
        path: `${BASE_PATH}/score-podcast-compatibility`,
        description: "Scores how well a list of podcasts match a client's profile using AI analysis of bios and podcast descriptions.",
        auth: "API Key",
        params: [
          { name: "clientBio", type: "string", required: true, description: "Client's bio for matching" },
          { name: "prospectBio", type: "string", required: false, description: "Prospect's bio for additional context" },
          { name: "podcasts", type: "object[]", required: true, description: "Array of podcast objects to score" },
        ],
        responseExample: JSON.stringify({
          scoredPodcasts: [
            {
              podcast_name: "The Growth Show",
              compatibility_score: 92,
              reasoning: "Strong alignment with B2B SaaS focus..."
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
        description: "Performs deep AI analysis of how well a client fits a specific podcast, including talking points and pitch angles.",
        auth: "API Key",
        params: [
          { name: "clientBio", type: "string", required: true, description: "Client's detailed bio" },
          { name: "podcastName", type: "string", required: true, description: "Name of the podcast" },
          { name: "podcastDescription", type: "string", required: false, description: "Podcast description" },
          { name: "hostName", type: "string", required: false, description: "Host name" },
          { name: "categories", type: "string[]", required: false, description: "Podcast categories" },
        ],
        responseExample: JSON.stringify({
          fitScore: 88,
          analysis: "Strong fit based on overlapping expertise in...",
          suggestedTopics: ["Scaling B2B SaaS", "Remote team management"],
          pitchAngle: "Position as a growth expert who has..."
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "fetch-podscan-email",
        name: "Fetch Podscan Email",
        method: "POST",
        path: `${BASE_PATH}/fetch-podscan-email`,
        description: "Fetches the contact email for a podcast from the Podscan API using the podcast's Podscan ID.",
        auth: "API Key",
        params: [
          { name: "podcast_id", type: "string", required: true, description: "Podscan podcast ID" },
        ],
        responseExample: JSON.stringify({
          email: "host@podcast.com",
          source: "podscan"
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "read-outreach-list",
        name: "Read Outreach List",
        method: "POST",
        path: `${BASE_PATH}/read-outreach-list`,
        description: "Reads a client's outreach list from their Google Sheet, returning all podcast targets and their current status.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({
          podcasts: [
            {
              podcast_name: "The Marketing Hour",
              status: "pitched",
              host_email: "host@example.com",
              last_contacted: "2025-01-15"
            }
          ]
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "get-client-outreach-podcasts",
        name: "Get Client Outreach Podcasts",
        method: "POST",
        path: `${BASE_PATH}/get-client-outreach-podcasts`,
        description: "Retrieves all podcasts in a client's outreach pipeline from the Google Sheet with full metadata.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({
          podcasts: [
            {
              id: "row-1",
              podcast_name: "Startup Stories",
              host_name: "Jane Smith",
              status: "approved",
              audience_size: "50K"
            }
          ]
        }, null, 2),
        category: "podcast-discovery",
      },
      {
        id: "get-outreach-podcasts-v2",
        name: "Get Outreach Podcasts V2",
        method: "POST",
        path: `${BASE_PATH}/get-outreach-podcasts-v2`,
        description: "Enhanced version of outreach podcast retrieval with additional filtering, sorting, and pagination support.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
        ],
        responseExample: JSON.stringify({
          podcasts: [
            {
              id: "row-1",
              podcast_name: "Growth Hacking Today",
              host_name: "Mike Chen",
              status: "pitched",
              audience_size: "100K",
              reach_score: 88
            }
          ],
          total: 25
        }, null, 2),
        category: "podcast-discovery",
      },
    ],
  },
  {
    id: "auth-portal",
    name: "Authentication & Portal",
    description: "Handle client portal authentication with password login, magic links, and session management.",
    endpoints: [
      {
        id: "login-with-password",
        name: "Login with Password",
        method: "POST",
        path: `${BASE_PATH}/login-with-password`,
        description: "Authenticates a client portal user with email and password, returning a session token.",
        auth: "None",
        params: [
          { name: "email", type: "string", required: true, description: "Client's email address" },
          { name: "password", type: "string", required: true, description: "Client's password" },
        ],
        responseExample: JSON.stringify({
          success: true,
          session: {
            token: "session-token-here",
            expiresAt: "2025-02-15T00:00:00Z"
          },
          client: { id: "uuid", name: "John Doe", email: "john@example.com" }
        }, null, 2),
        category: "auth-portal",
      },
      {
        id: "send-portal-magic-link",
        name: "Send Portal Magic Link",
        method: "POST",
        path: `${BASE_PATH}/send-portal-magic-link`,
        description: "Sends a passwordless magic link email to the client for portal authentication.",
        auth: "None",
        params: [
          { name: "email", type: "string", required: true, description: "Client's email address" },
        ],
        responseExample: JSON.stringify({
          success: true,
          message: "Magic link sent to john@example.com"
        }, null, 2),
        category: "auth-portal",
      },
      {
        id: "verify-portal-token",
        name: "Verify Portal Token",
        method: "POST",
        path: `${BASE_PATH}/verify-portal-token`,
        description: "Verifies a magic link token and creates a new portal session.",
        auth: "None",
        params: [
          { name: "token", type: "string", required: true, description: "Magic link token from email" },
        ],
        responseExample: JSON.stringify({
          success: true,
          session: {
            token: "session-token-here",
            expiresAt: "2025-02-15T00:00:00Z"
          },
          client: { id: "uuid", name: "John Doe" }
        }, null, 2),
        category: "auth-portal",
      },
      {
        id: "validate-portal-session",
        name: "Validate Portal Session",
        method: "POST",
        path: `${BASE_PATH}/validate-portal-session`,
        description: "Validates an existing session token and returns the associated client data.",
        auth: "Session Token",
        params: [
          { name: "sessionToken", type: "string", required: true, description: "Active session token to validate" },
        ],
        responseExample: JSON.stringify({
          valid: true,
          client: { id: "uuid", name: "John Doe", email: "john@example.com" }
        }, null, 2),
        category: "auth-portal",
      },
      {
        id: "logout-portal-session",
        name: "Logout Portal Session",
        method: "POST",
        path: `${BASE_PATH}/logout-portal-session`,
        description: "Invalidates a portal session token, logging the client out.",
        auth: "Session Token",
        params: [
          { name: "sessionToken", type: "string", required: true, description: "Session token to invalidate" },
        ],
        responseExample: JSON.stringify({
          success: true,
          message: "Session invalidated"
        }, null, 2),
        category: "auth-portal",
      },
    ],
  },
  {
    id: "outreach-email",
    name: "Outreach & Email",
    description: "Create outreach messages, trigger email campaigns, and manage leads in Bison.",
    endpoints: [
      {
        id: "create-outreach-message",
        name: "Create Outreach Message",
        method: "POST",
        path: `${BASE_PATH}/create-outreach-message`,
        description: "Generates a personalized podcast outreach email using AI, tailored to the podcast host and client profile.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcastName", type: "string", required: true, description: "Name of the target podcast" },
          { name: "hostName", type: "string", required: false, description: "Podcast host's name" },
          { name: "hostEmail", type: "string", required: true, description: "Host's email address" },
          { name: "podcastDescription", type: "string", required: false, description: "Podcast description for context" },
        ],
        responseExample: JSON.stringify({
          subject: "Guest Pitch: John Doe on The Growth Show",
          body: "Hi Sarah,\n\nI came across The Growth Show and loved your recent episode on...",
          messageId: "msg-uuid"
        }, null, 2),
        category: "outreach-email",
      },
      {
        id: "send-outreach-webhook",
        name: "Send Outreach Webhook",
        method: "POST",
        path: `${BASE_PATH}/send-outreach-webhook`,
        description: "Triggers the outreach email sending workflow via webhook, updating the podcast status in the client's sheet.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcastId", type: "string", required: true, description: "ID of the podcast being pitched" },
        ],
        responseExample: JSON.stringify({
          success: true,
          status: "sent",
          messageId: "msg-uuid"
        }, null, 2),
        category: "outreach-email",
      },
      {
        id: "create-bison-lead",
        name: "Create Bison Lead",
        method: "POST",
        path: `${BASE_PATH}/create-bison-lead`,
        description: "Creates or updates a lead in Bison CRM from a campaign message, syncing email reply data.",
        auth: "API Key",
        params: [
          { name: "message_id", type: "string", required: true, description: "Bison message ID to sync" },
        ],
        responseExample: JSON.stringify({
          success: true,
          lead: {
            email: "host@podcast.com",
            status: "replied",
            campaign: "Q1 Outreach"
          }
        }, null, 2),
        category: "outreach-email",
      },
      {
        id: "send-reply",
        name: "Send Reply",
        method: "POST",
        path: `${BASE_PATH}/send-reply`,
        description: "Sends a reply to a podcast host's email via Bison, continuing an existing conversation thread.",
        auth: "API Key",
        params: [
          { name: "bisonReplyId", type: "string", required: true, description: "Bison reply thread ID" },
          { name: "message", type: "string", required: true, description: "Reply message body" },
          { name: "subject", type: "string", required: false, description: "Email subject (optional, uses Re: thread subject)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          messageId: "reply-uuid"
        }, null, 2),
        category: "outreach-email",
      },
      {
        id: "fetch-email-thread",
        name: "Fetch Email Thread",
        method: "POST",
        path: `${BASE_PATH}/fetch-email-thread`,
        description: "Fetches a full email conversation thread from Bison by reply ID, returning all messages in the thread.",
        auth: "API Key",
        params: [
          { name: "replyId", type: "string", required: true, description: "Bison reply ID to fetch the conversation thread for" },
        ],
        responseExample: JSON.stringify({
          success: true,
          data: {
            messages: [
              { from: "you@company.com", to: "host@podcast.com", subject: "Guest Pitch", body: "Hi...", date: "2025-01-15T10:00:00Z" },
              { from: "host@podcast.com", to: "you@company.com", subject: "Re: Guest Pitch", body: "Thanks for reaching out...", date: "2025-01-16T14:30:00Z" }
            ]
          }
        }, null, 2),
        category: "outreach-email",
      },
    ],
  },
  {
    id: "webhooks",
    name: "Webhooks",
    description: "Receive and process incoming webhooks from Stripe, Resend, and Bison campaign replies.",
    endpoints: [
      {
        id: "stripe-webhook",
        name: "Stripe Webhook",
        method: "POST",
        path: `${BASE_PATH}/stripe-webhook`,
        description: "Processes Stripe payment events including checkout completions, subscription updates, and invoice payments.",
        auth: "Webhook Signature",
        params: [
          { name: "(Stripe Event)", type: "object", required: true, description: "Stripe webhook event payload (sent automatically by Stripe)" },
        ],
        responseExample: JSON.stringify({
          received: true
        }, null, 2),
        category: "webhooks",
      },
      {
        id: "resend-webhook",
        name: "Resend Webhook",
        method: "POST",
        path: `${BASE_PATH}/resend-webhook`,
        description: "Processes Resend email delivery webhooks including bounces, complaints, deliveries, and opens.",
        auth: "Webhook Signature",
        params: [
          { name: "(Resend Event)", type: "object", required: true, description: "Resend webhook event payload (sent automatically by Resend)" },
        ],
        responseExample: JSON.stringify({
          received: true,
          type: "email.delivered"
        }, null, 2),
        category: "webhooks",
      },
      {
        id: "campaign-reply-webhook",
        name: "Campaign Reply Webhook",
        method: "POST",
        path: `${BASE_PATH}/campaign-reply-webhook`,
        description: "Processes incoming campaign reply notifications from Bison, creating leads and updating outreach status.",
        auth: "Webhook Signature",
        params: [
          { name: "(Bison Event)", type: "object", required: true, description: "Bison campaign reply payload (sent automatically by Bison)" },
        ],
        responseExample: JSON.stringify({
          received: true,
          leadCreated: true
        }, null, 2),
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
        description: "Performs AI analysis of a sales call recording, extracting key insights, objections, and next steps.",
        auth: "API Key",
        params: [
          { name: "sales_call_id", type: "string", required: true, description: "UUID of the sales call record" },
          { name: "recording_id", type: "string", required: false, description: "Fathom recording ID (auto-detected if not provided)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          analysis: {
            sentiment: "positive",
            keyTopics: ["pricing", "timeline", "onboarding"],
            objections: ["Budget concerns for Q1"],
            nextSteps: ["Send proposal", "Schedule follow-up"],
            score: 78
          }
        }, null, 2),
        category: "sales-analytics",
      },
      {
        id: "classify-sales-call",
        name: "Classify Sales Call",
        method: "POST",
        path: `${BASE_PATH}/classify-sales-call`,
        description: "Classifies a sales call into categories (discovery, demo, closing, etc.) using AI analysis.",
        auth: "API Key",
        params: [
          { name: "sales_call_id", type: "string", required: true, description: "UUID of the sales call record" },
        ],
        responseExample: JSON.stringify({
          success: true,
          classification: "discovery",
          confidence: 0.92,
          stage: "top-of-funnel"
        }, null, 2),
        category: "sales-analytics",
      },
      {
        id: "sync-fathom-calls",
        name: "Sync Fathom Calls",
        method: "POST",
        path: `${BASE_PATH}/sync-fathom-calls`,
        description: "Syncs recent call recordings from Fathom API into the local database for analysis.",
        auth: "API Key",
        params: [
          { name: "since", type: "string", required: false, description: "ISO date string to sync calls from (defaults to last 7 days)" },
        ],
        responseExample: JSON.stringify({
          success: true,
          synced: 12,
          newCalls: 3,
          updatedCalls: 9
        }, null, 2),
        category: "sales-analytics",
      },
      {
        id: "sync-replies",
        name: "Sync Replies",
        method: "POST",
        path: `${BASE_PATH}/sync-replies`,
        description: "Syncs email replies from Bison campaigns into the local database, updating lead statuses.",
        auth: "API Key",
        params: [
          { name: "since", type: "string", required: false, description: "ISO date string to sync replies from" },
        ],
        responseExample: JSON.stringify({
          success: true,
          synced: 8,
          newReplies: 2
        }, null, 2),
        category: "sales-analytics",
      },
    ],
  },
  {
    id: "payments",
    name: "Payments",
    description: "Handle Stripe checkout sessions for products, add-ons, and manage outreach podcast deletions.",
    endpoints: [
      {
        id: "create-checkout-session",
        name: "Create Checkout Session",
        method: "POST",
        path: `${BASE_PATH}/create-checkout-session`,
        description: "Creates a Stripe Checkout session for purchasing products, with support for multiple cart items.",
        auth: "None",
        params: [
          { name: "cartItems", type: "object[]", required: true, description: "Array of items with priceId and quantity" },
          { name: "customerEmail", type: "string", required: false, description: "Customer's email for pre-filling checkout" },
          { name: "customerName", type: "string", required: false, description: "Customer's name" },
        ],
        responseExample: JSON.stringify({
          url: "https://checkout.stripe.com/c/pay/cs_live_..."
        }, null, 2),
        category: "payments",
      },
      {
        id: "create-addon-checkout",
        name: "Create Add-on Checkout",
        method: "POST",
        path: `${BASE_PATH}/create-addon-checkout`,
        description: "Creates a Stripe Checkout session specifically for add-on purchases linked to an existing client.",
        auth: "API Key",
        params: [
          { name: "addons", type: "object[]", required: true, description: "Array of add-on items with priceId and quantity" },
          { name: "clientId", type: "string", required: true, description: "UUID of the existing client" },
        ],
        responseExample: JSON.stringify({
          url: "https://checkout.stripe.com/c/pay/cs_live_..."
        }, null, 2),
        category: "payments",
      },
      {
        id: "delete-outreach-podcast",
        name: "Delete Outreach Podcast",
        method: "POST",
        path: `${BASE_PATH}/delete-outreach-podcast`,
        description: "Removes a podcast from a client's outreach list in their Google Sheet and updates the database.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcastId", type: "string", required: true, description: "ID of the podcast to remove" },
        ],
        responseExample: JSON.stringify({
          success: true,
          message: "Podcast removed from outreach list"
        }, null, 2),
        category: "payments",
      },
    ],
  },
  {
    id: "seo-integrations",
    name: "SEO & Integrations",
    description: "Submit URLs for Google indexing, check indexing status, and export data to Google Sheets.",
    endpoints: [
      {
        id: "submit-to-indexing",
        name: "Submit to Indexing",
        method: "POST",
        path: `${BASE_PATH}/submit-to-indexing`,
        description: "Submits a URL to Google's Indexing API to request fast indexing of new or updated pages.",
        auth: "API Key",
        params: [
          { name: "url", type: "string", required: true, description: "Full URL to submit for indexing" },
          { name: "postId", type: "string", required: false, description: "Associated blog post ID for tracking" },
        ],
        responseExample: JSON.stringify({
          success: true,
          status: "URL_UPDATED",
          notifyTime: "2025-01-15T10:30:00Z"
        }, null, 2),
        category: "seo-integrations",
      },
      {
        id: "check-indexing-status",
        name: "Check Indexing Status",
        method: "POST",
        path: `${BASE_PATH}/check-indexing-status`,
        description: "Checks the current Google indexing status of a URL via the Indexing API.",
        auth: "API Key",
        params: [
          { name: "url", type: "string", required: true, description: "URL to check indexing status for" },
          { name: "postId", type: "string", required: false, description: "Associated blog post ID" },
        ],
        responseExample: JSON.stringify({
          success: true,
          status: "indexed",
          lastCrawled: "2025-01-14T08:00:00Z"
        }, null, 2),
        category: "seo-integrations",
      },
      {
        id: "export-to-google-sheets",
        name: "Export to Google Sheets",
        method: "POST",
        path: `${BASE_PATH}/export-to-google-sheets`,
        description: "Exports podcast data to a client's Google Sheet with formatted headers, styling, and data validation.",
        auth: "API Key",
        params: [
          { name: "clientId", type: "string", required: true, description: "UUID of the client" },
          { name: "podcasts", type: "object[]", required: true, description: "Array of podcast objects to export" },
        ],
        responseExample: JSON.stringify({
          success: true,
          spreadsheetId: "1abc...",
          rowsAdded: 15,
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/..."
        }, null, 2),
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
        description: "Performs admin user management operations including listing, creating, updating, and deleting admin accounts.",
        auth: "API Key",
        params: [
          { name: "action", type: "string", required: true, description: "Action to perform: 'list', 'create', 'update', or 'delete'" },
          { name: "email", type: "string", required: false, description: "Admin user's email (required for create/update/delete)" },
          { name: "role", type: "string", required: false, description: "Admin role: 'admin' or 'super_admin'" },
          { name: "name", type: "string", required: false, description: "Admin user's display name" },
        ],
        responseExample: JSON.stringify({
          success: true,
          users: [
            { id: "uuid", email: "admin@getonapod.com", role: "super_admin", name: "Jonathan" }
          ]
        }, null, 2),
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
      e.id.toLowerCase().includes(lower)
  );
}

export function generateCurlExample(endpoint: ApiEndpoint): string {
  const url = `https://YOUR_PROJECT_REF.supabase.co${endpoint.path}`;
  const hasBody = endpoint.params.length > 0 && endpoint.method === "POST";

  const bodyObj: Record<string, string | number | boolean> = {};
  if (hasBody) {
    for (const p of endpoint.params.filter((p) => p.required)) {
      if (p.type === "string") bodyObj[p.name] = `your-${p.name}`;
      else if (p.type === "string[]") bodyObj[p.name] = ["value1", "value2"] as unknown as string;
      else if (p.type === "number") bodyObj[p.name] = 0;
      else if (p.type === "object[]") bodyObj[p.name] = [] as unknown as string;
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
    for (const p of endpoint.params.filter((p) => p.required)) {
      if (p.type === "string") bodyObj[p.name] = `your-${p.name}`;
      else if (p.type === "string[]") bodyObj[p.name] = ["value1", "value2"];
      else if (p.type === "number") bodyObj[p.name] = 0;
      else if (p.type === "object[]") bodyObj[p.name] = [];
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
    for (const p of endpoint.params.filter((p) => p.required)) {
      if (p.type === "string") bodyObj[p.name] = `your-${p.name}`;
      else if (p.type === "string[]") bodyObj[p.name] = ["value1", "value2"];
      else if (p.type === "number") bodyObj[p.name] = 0;
      else if (p.type === "object[]") bodyObj[p.name] = [];
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
