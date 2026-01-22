# MCP Prospect Dashboard Server

A Model Context Protocol (MCP) server that automates creating prospect dashboards through Claude Code.

## Features

- **Create Prospect**: Create a new prospect dashboard with just their name - automatically creates Google Sheet
- **Enable Prospect Dashboard**: Publish the dashboard so prospects can view it (sets content_ready=true)

## Installation

1. Clone or navigate to this directory:
```bash
cd mcp-prospect-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_URL=https://getonapod.com
```

5. Build the project:
```bash
npm run build
```

## Configuration for Claude Code

Add this to your Claude Code MCP settings (typically `~/.config/claude/settings.json` or similar):

```json
{
  "mcpServers": {
    "prospect-dashboard": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-prospect-dashboard/dist/index.js"
      ],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "APP_URL": "https://getonapod.com"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/mcp-prospect-dashboard` with the actual absolute path to this directory.

## Available Tools

### 1. create_prospect

Creates a new prospect dashboard. Can either create a new Google Sheet or link an existing one.

**Parameters**:
- `prospect_name` (required): Prospect's full name
- `bio` (optional): Bio/background about the prospect
- `profile_picture_url` (optional): URL to profile picture
- `google_sheet_url` (optional): Link to existing Google Sheet. If not provided, creates a new sheet.

**Returns**:
```json
{
  "success": true,
  "prospect": {
    "id": "uuid-here",
    "name": "Sarah Johnson",
    "slug": "abc12345",
    "dashboard_url": "https://getonapod.com/prospect/abc12345",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/..."
  }
}
```

### 2. enable_prospect_dashboard

Publishes the prospect dashboard so they can view it. Sets content_ready=true.

**Parameters**:
- `prospect_id` (required): Prospect UUID from create_prospect
- `tagline` (optional): Personalized tagline for the dashboard

**Returns**:
```json
{
  "success": true,
  "dashboard_url": "https://getonapod.com/prospect/abc12345",
  "enabled_at": "2026-01-21T..."
}
```

## Usage Examples

Once configured in Claude Code:

### Example 1: Create prospect (no Google Sheet yet)

```
You: Create a prospect for Sarah Johnson

Claude: [Creates prospect using create_prospect]
Result:
✓ Prospect dashboard created successfully
- Name: Sarah Johnson
- Dashboard: https://getonapod.com/prospect/abc12345
- Google Sheet: None (add later)
- Prospect ID: uuid-here
```

### Example 2: Create prospect with bio and link existing sheet

```
You: Create a prospect for Mike Chen with bio "Marketing expert with 15 years experience" and Google Sheet https://docs.google.com/spreadsheets/d/xyz123

Claude: [Creates prospect using create_prospect]
Result:
✓ Prospect dashboard created successfully
- Name: Mike Chen
- Bio: Marketing expert with 15 years experience
- Dashboard: https://getonapod.com/prospect/def67890
- Google Sheet: https://docs.google.com/spreadsheets/d/xyz123 (linked existing)
- Prospect ID: uuid-here
```

### Example 3: Enable the dashboard

```
You: Enable the dashboard with tagline "Your personalized podcast opportunities"

Claude: [Enables dashboard using enable_prospect_dashboard]
Result: Dashboard is now live at https://getonapod.com/prospect/abc12345
```

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Start the server:
```bash
npm start
```

## Project Structure

```
mcp-prospect-dashboard/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── config.ts             # Configuration and env validation
│   ├── tools/
│   │   ├── create-dashboard.ts   # Prospect creation tool
│   │   └── enable-dashboard.ts   # Dashboard enablement tool
│   └── services/
│       └── supabase.ts       # Supabase client
├── package.json
├── tsconfig.json
└── .env
```

## How It Works

1. **create_prospect** creates a prospect dashboard record:
   - Generates a unique 8-character slug
   - Creates a record in `prospect_dashboards` table with content_ready=false
   - If `google_sheet_url` is provided, links to that existing sheet
   - If no sheet URL provided, leaves spreadsheet_url as null (to be added later)
   - Returns dashboard URL and spreadsheet URL (or null)

2. **enable_prospect_dashboard** updates the prospect dashboard:
   - Sets `content_ready=true` to publish the dashboard
   - Optionally sets `personalized_tagline`
   - Returns the public dashboard URL

The prospect dashboard at `/prospect/{slug}` shows:
- When content_ready=false: "Coming Soon" message
- When content_ready=true: Full dashboard with podcasts from Google Sheet
- Prospects can view their curated podcast opportunities
- Shows at `/admin/prospect-dashboards` for admin management

## Troubleshooting

**Error: Missing required environment variable**
- Make sure your `.env` file has all required variables
- Check that the MCP configuration includes the environment variables

**Error: Failed to create Google Sheet**
- Verify GOOGLE_SERVICE_ACCOUNT_JSON is configured in Supabase Edge Functions
- Check that the service account has Google Sheets and Drive API access
- Ensure GOOGLE_WORKSPACE_USER_EMAIL is set correctly

**Error: Prospect dashboard slug not found**
- The create-prospect-sheet function generates unique 8-character slugs
- Check that the `prospect_dashboards` table exists
- Verify migration `20260107_prospect_dashboards.sql` was applied

**MCP not showing up in Claude Code**
- Verify the absolute path in your MCP settings is correct
- Make sure you ran `npm run build` after making changes
- Restart Claude Code after updating MCP settings

## License

Proprietary - Authority Built
