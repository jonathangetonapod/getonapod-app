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
              <Card className="bg-slate-800/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">Prospect Dashboards</CardTitle>
                </CardHeader>
                <CardContent className="text-gray-300 space-y-4">
                  <h3 className="text-xl font-semibold text-white">Get Prospect by Slug</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`GET /rest/v1/prospect_dashboards?slug=eq.{slug}&is_active=eq.true

Response:
{
  "id": "uuid",
  "slug": "abc123",
  "prospect_name": "John Doe",
  "prospect_bio": "...",
  "spreadsheet_id": "...",
  "created_at": "..."
}`}</pre>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Get Podcasts for Prospect</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`POST /functions/v1/get-prospect-podcasts

Body:
{
  "spreadsheetId": "...",
  "prospectDashboardId": "uuid",
  "prospectName": "John Doe",
  "prospectBio": "..."
}

Response:
{
  "podcasts": [...],
  "total": 15,
  "cached": true
}`}</pre>
                  </div>

                  <h3 className="text-xl font-semibold text-white mt-6">Track Podcast Selection</h3>
                  <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre>{`POST /functions/v1/select-prospect-podcasts

Body:
{
  "prospectDashboardId": "uuid",
  "selectedPodcasts": ["podcast-id-1", "podcast-id-2"]
}`}</pre>
                  </div>
                </CardContent>
              </Card>
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
