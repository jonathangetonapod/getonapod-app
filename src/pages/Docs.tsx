import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const Docs = () => {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Get On A Pod API Documentation
          </h1>
          <p className="text-xl text-purple-200">
            Complete reference for integrating with the GOAP platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-white">Navigation</CardTitle>
            </CardHeader>
            <CardContent>
              <nav className="space-y-2">
                {[
                  { id: "overview", label: "Overview" },
                  { id: "auth", label: "Authentication" },
                  { id: "prospects", label: "Prospect Dashboards" },
                  { id: "podcasts", label: "Podcast Matching" },
                  { id: "clients", label: "Client Portal" },
                  { id: "admin", label: "Admin API" },
                  { id: "mcp", label: "MCP Tools" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                      activeSection === item.id
                        ? "bg-purple-600 text-white"
                        : "text-purple-200 hover:bg-purple-800/50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {activeSection === "overview" && (
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">API Overview</CardTitle>
                  <CardDescription className="text-purple-200">
                    Get On A Pod platform architecture and capabilities
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <p>
                    The GOAP API provides programmatic access to podcast matching, 
                    prospect management, and client portal functionality.
                  </p>
                  
                  <h3 className="text-xl font-semibold text-white mt-6">Base URLs</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm">
                    <p><span className="text-purple-400">Supabase:</span> https://ysjwveqnwjysldpfqzov.supabase.co</p>
                    <p><span className="text-purple-400">Website:</span> https://getonapod.com</p>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Core Features</h3>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong>Prospect Dashboards:</strong> Personalized podcast recommendations</li>
                    <li><strong>Podcast Database:</strong> 1000+ vetted podcasts with embeddings</li>
                    <li><strong>AI Matching:</strong> Vector similarity + Claude analysis</li>
                    <li><strong>Client Portal:</strong> Full client management system</li>
                    <li><strong>MCP Integration:</strong> BridgeKit-compatible tools</li>
                  </ul>
                </CardContent>
              </Card>
            )}

            {activeSection === "auth" && (
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">Authentication</CardTitle>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <h3 className="text-xl font-semibold text-white">Supabase Auth</h3>
                  <p>All API requests require a valid Supabase JWT token.</p>
                  
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`// Headers
Authorization: Bearer <SUPABASE_JWT>
apikey: <SUPABASE_ANON_KEY>`}</pre>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Auth Methods</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">Admin</Badge>
                      <span>Email/password via Supabase Auth</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600">Client</Badge>
                      <span>Magic link or email/password</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-600">Prospect</Badge>
                      <span>Slug-based access (no auth required)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === "prospects" && (
              <div className="space-y-6">
                {/* Overview */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <CardTitle className="text-white text-2xl">Prospects API</CardTitle>
                    <CardDescription className="text-purple-200">
                      Create personalized podcast recommendation dashboards for prospects
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <p>
                      The Prospects API lets you create shareable dashboards with AI-matched podcast recommendations.
                      Each prospect gets a unique URL and Google Sheet with their personalized matches.
                    </p>
                    
                    <h3 className="text-xl font-semibold text-white mt-4">Workflow</h3>
                    <div className="bg-slate-900 p-4 rounded-lg">
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li><strong>Create Dashboard</strong> → Generate slug + Google Sheet</li>
                        <li><strong>Match Podcasts</strong> → AI finds relevant podcasts via embeddings</li>
                        <li><strong>Export to Sheet</strong> → Podcasts added to prospect's sheet</li>
                        <li><strong>Share URL</strong> → Prospect views at /prospect/{'{slug}'}</li>
                        <li><strong>Track Selection</strong> → Record which podcasts they're interested in</li>
                      </ol>
                    </div>
                  </CardContent>
                </Card>

                {/* Database Schema */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <CardTitle className="text-white text-xl">Database Schema</CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300">
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`prospect_dashboards
├── id (uuid, primary key)
├── slug (text, unique) ─────────── URL identifier: /prospect/{slug}
├── prospect_name (text) ────────── Display name
├── prospect_email (text) ───────── Contact email
├── prospect_bio (text) ─────────── Background for AI matching
├── prospect_title (text) ───────── Job title
├── prospect_company (text) ─────── Company name
├── profile_picture_url (text) ──── Avatar image
├── spreadsheet_id (text) ───────── Google Sheet ID
├── spreadsheet_url (text) ──────── Full sheet URL
├── tagline (text) ──────────────── Custom header message
├── is_active (boolean) ─────────── Dashboard visible?
├── content_ready (boolean) ─────── Podcasts loaded?
├── bison_lead_id (integer) ─────── Link to Bison CRM
├── created_at (timestamptz)
└── updated_at (timestamptz)`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Create Prospect */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">POST</Badge>
                      <CardTitle className="text-white text-xl">Create Prospect Dashboard</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`POST /functions/v1/create-prospect-sheet

Headers:
  Authorization: Bearer {SUPABASE_SERVICE_KEY}
  Content-Type: application/json

Body:
{
  "prospectName": "John Doe",
  "prospectEmail": "john@example.com",
  "prospectBio": "CEO of TechCorp with 15 years in SaaS. Expert in scaling B2B companies...",
  "prospectTitle": "CEO",
  "prospectCompany": "TechCorp",
  "bisonLeadId": 12345  // optional - links to Bison CRM
}

Response:
{
  "success": true,
  "dashboard": {
    "id": "88ee691e-e192-4007-85fc-810f9567832c",
    "slug": "kwzx4pn5",
    "dashboard_url": "https://getonapod.com/prospect/kwzx4pn5",
    "spreadsheet_id": "1ABC123...",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1ABC123..."
  }
}`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Get Prospect */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600">GET</Badge>
                      <CardTitle className="text-white text-xl">Get Prospect by Slug</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <p className="text-purple-200">No auth required - prospects access via public slug</p>
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`GET /rest/v1/prospect_dashboards?slug=eq.{slug}&is_active=eq.true&select=*

Example:
GET /rest/v1/prospect_dashboards?slug=eq.kwzx4pn5&is_active=eq.true

Response:
{
  "id": "88ee691e-e192-4007-85fc-810f9567832c",
  "slug": "kwzx4pn5",
  "prospect_name": "John Doe",
  "prospect_bio": "CEO of TechCorp...",
  "prospect_title": "CEO",
  "prospect_company": "TechCorp",
  "profile_picture_url": "https://...",
  "spreadsheet_id": "1ABC123...",
  "tagline": "Hand-picked podcasts for your expertise",
  "is_active": true,
  "content_ready": true,
  "created_at": "2024-02-08T12:00:00Z"
}`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Match Podcasts */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">POST</Badge>
                      <CardTitle className="text-white text-xl">Match Podcasts for Prospect</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <p>Uses OpenAI embeddings + vector similarity + Claude filtering to find best matches.</p>
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`POST /functions/v1/backfill-prospect-podcasts

Body:
{
  "prospectId": "88ee691e-e192-4007-85fc-810f9567832c"
}

Response:
{
  "success": true,
  "prospect_name": "John Doe",
  "total": 15,
  "duration_seconds": 8.2
}

// This function:
// 1. Generates embedding from prospect name + bio
// 2. Searches 7,800+ podcasts via vector similarity
// 3. Filters top matches with Claude AI
// 4. Exports results to prospect's Google Sheet`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Get Podcasts */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">POST</Badge>
                      <CardTitle className="text-white text-xl">Get Podcasts for Prospect</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <p>Fetches podcast recommendations from the prospect's Google Sheet.</p>
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`POST /functions/v1/get-prospect-podcasts

Body:
{
  "spreadsheetId": "1ABC123...",
  "prospectDashboardId": "88ee691e-...",
  "prospectName": "John Doe",
  "prospectBio": "CEO of TechCorp..."
}

Response:
{
  "podcasts": [
    {
      "podcast_name": "The SaaS Podcast",
      "podcast_description": "Interviews with B2B founders...",
      "episode_count": 450,
      "itunes_rating": 4.8,
      "podscan_podcast_id": "pod_abc123"
    },
    // ... more podcasts
  ],
  "total": 15,
  "cached": true,
  "source": "google_sheets"
}`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Append Podcasts */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">POST</Badge>
                      <CardTitle className="text-white text-xl">Append Podcasts to Sheet</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <p>Manually add podcasts to a prospect's Google Sheet.</p>
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`POST /functions/v1/append-prospect-sheet

Body:
{
  "dashboardId": "88ee691e-...",
  "podcasts": [
    {
      "podcast_name": "The Leadership Show",
      "podcast_description": "Weekly leadership insights...",
      "podscan_podcast_id": "pod_xyz789",
      "episode_count": 200,
      "itunes_rating": 4.9
    }
  ]
}

Response:
{
  "success": true,
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/...",
  "rowsAdded": 1,
  "cacheSaved": 1
}`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Track Selection */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">POST</Badge>
                      <CardTitle className="text-white text-xl">Track Podcast Selection</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <p>Record which podcasts a prospect is interested in.</p>
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`POST /functions/v1/select-prospect-podcasts

Body:
{
  "prospectDashboardId": "88ee691e-...",
  "selectedPodcasts": [
    "pod_abc123",
    "pod_xyz789"
  ],
  "prospectEmail": "john@example.com"  // optional, for notifications
}

Response:
{
  "success": true,
  "selected_count": 2,
  "notification_sent": true
}`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Update Prospect */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-yellow-600">PATCH</Badge>
                      <CardTitle className="text-white text-xl">Update Prospect Dashboard</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`PATCH /rest/v1/prospect_dashboards?id=eq.{uuid}

Headers:
  Authorization: Bearer {SUPABASE_SERVICE_KEY}
  Content-Type: application/json
  Prefer: return=representation

Body:
{
  "tagline": "Your personalized podcast matches",
  "content_ready": true,
  "is_active": true,
  "prospect_bio": "Updated bio..."
}

Response:
{
  "id": "88ee691e-...",
  "slug": "kwzx4pn5",
  "tagline": "Your personalized podcast matches",
  "content_ready": true,
  // ... full updated record
}`}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Full Example */}
                <Card className="bg-slate-800/50 border-purple-500/20">
                  <CardHeader>
                    <CardTitle className="text-white text-xl">Complete Example: Create & Populate Dashboard</CardTitle>
                  </CardHeader>
                  <CardContent className="text-gray-300 space-y-4">
                    <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                      <pre>{`# 1. Create the prospect dashboard
curl -X POST "https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-prospect-sheet" \\
  -H "Authorization: Bearer {SERVICE_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prospectName": "Jane Smith",
    "prospectEmail": "jane@startup.com",
    "prospectBio": "Founder of AI startup, former Google PM, expert in product strategy"
  }'

# Response: { "dashboard": { "id": "abc-123", "slug": "xyz789" } }

# 2. Match and export podcasts
curl -X POST "https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/backfill-prospect-podcasts" \\
  -H "Authorization: Bearer {SERVICE_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{ "prospectId": "abc-123" }'

# Response: { "success": true, "total": 15 }

# 3. Share the dashboard URL
# https://getonapod.com/prospect/xyz789`}</pre>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === "podcasts" && (
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">Podcast Matching</CardTitle>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <h3 className="text-xl font-semibold text-white">Match Podcasts for Prospect</h3>
                  <p>Uses OpenAI embeddings + vector similarity to find matching podcasts.</p>
                  
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`POST /functions/v1/find-matching-podcasts

Body:
{
  "prospectName": "John Doe",
  "prospectBio": "CEO and leadership expert...",
  "matchCount": 15,
  "threshold": 0.2
}

Response:
{
  "matches": [
    {
      "podcast_id": "uuid",
      "name": "The Leadership Show",
      "score": 0.89,
      "reason": "Perfect fit for leadership topics..."
    }
  ]
}`}</pre>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Database Schema</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`podcasts
├── id (uuid)
├── name (text)
├── description (text)
├── host_name (text)
├── audience_size (text)
├── topics (text[])
├── guest_requirements (text)
├── contact_email (text)
├── embedding (vector)
└── is_active (boolean)`}</pre>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === "clients" && (
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">Client Portal API</CardTitle>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <h3 className="text-xl font-semibold text-white">Get Client Dashboard</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`POST /functions/v1/get-client-dashboard

Body:
{
  "clientId": "uuid"
}

Response:
{
  "client": {...},
  "outreach": [...],
  "bookings": [...],
  "recordings": [...],
  "stats": {
    "totalOutreach": 150,
    "totalBookings": 12,
    "conversionRate": 8
  }
}`}</pre>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Update Client</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`PATCH /rest/v1/clients?id=eq.{uuid}

Body:
{
  "bio": "Updated bio...",
  "talking_points": ["Topic 1", "Topic 2"],
  "headshot_url": "https://..."
}`}</pre>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === "admin" && (
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">Admin API</CardTitle>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <h3 className="text-xl font-semibold text-white">Create Prospect Dashboard</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`POST /functions/v1/dispatch-prospect

Body:
{
  "prospect_name": "John Doe",
  "prospect_email": "john@example.com",
  "prospect_bio": "...",
  "bison_lead_id": 12345
}

Response:
{
  "success": true,
  "dashboard_url": "https://getonapod.com/prospect/abc123",
  "spreadsheet_id": "...",
  "matched_podcasts": 15
}`}</pre>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Bulk Operations</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`POST /functions/v1/sync-clients-from-sheets
POST /functions/v1/sync-podcasts-from-sheets
POST /functions/v1/generate-client-sheet`}</pre>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === "mcp" && (
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">MCP Tools (BridgeKit)</CardTitle>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <p>
                    Available via BridgeKit MCP integration for AI agents.
                  </p>

                  <h3 className="text-xl font-semibold text-white mt-4">Available Tools</h3>
                  <div className="space-y-4">
                    {[
                      {
                        name: "get_all_podcasts",
                        desc: "Retrieve all active podcasts with optional filters"
                      },
                      {
                        name: "match_podcasts_for_prospect",
                        desc: "AI-powered podcast matching with export to sheets"
                      },
                      {
                        name: "create_prospect_dashboard",
                        desc: "Create a new prospect dashboard with matched podcasts"
                      },
                      {
                        name: "get_prospect_dashboard",
                        desc: "Retrieve prospect dashboard by slug"
                      },
                      {
                        name: "sync_podcasts",
                        desc: "Sync podcast database from master spreadsheet"
                      }
                    ].map((tool) => (
                      <div key={tool.name} className="bg-slate-900 p-4 rounded-lg">
                        <code className="text-purple-400">{tool.name}</code>
                        <p className="text-gray-400 mt-1">{tool.desc}</p>
                      </div>
                    ))}
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Example Usage</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`// Via mcporter CLI
mcporter call prospect-dashboard match_podcasts_for_prospect \\
  --prospect_name "John Doe" \\
  --prospect_bio "Leadership expert..." \\
  --match_count 15 \\
  --export_to_sheet true`}</pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-purple-300">
          <p>Need help? Contact <a href="mailto:support@getonapod.com" className="text-purple-400 hover:underline">support@getonapod.com</a></p>
        </div>
      </div>
    </div>
  );
};

export default Docs;
