# MCP Prospect Dashboard Setup

This project includes an MCP (Model Context Protocol) server for automating prospect dashboard creation and management.

## Quick Setup

1. **Set environment variables** in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export SUPABASE_URL="https://ysjwveqnwjysldpfqzov.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
export APP_URL="https://getonapod.com"
```

2. **Reload your shell**:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

3. **Restart Claude Code** to load the MCP server

4. **Verify it's working**:
```
> /mcp
```

You should see `prospect-dashboard` in the list of connected servers.

## Available Tools

Once configured, you can use these MCP tools:

### `create_prospect`
Creates a new prospect dashboard. Can create a new Google Sheet or link an existing one.

**Parameters:**
- `prospect_name` (required)
- `bio` (optional)
- `profile_picture_url` (optional)
- `google_sheet_url` (optional) - link existing sheet, or leave blank to auto-create

**Example usage:**
```
Create a prospect for Sarah Johnson with bio "Marketing expert" and Google Sheet https://docs.google.com/spreadsheets/d/abc123
```

Or minimal:
```
Create a prospect for Sarah Johnson
```

**Returns:**
- Prospect ID
- Name
- Dashboard slug
- Dashboard URL (https://getonapod.com/prospect/{slug})
- Google Sheet URL

### `enable_prospect_dashboard`
Publishes the prospect dashboard (sets content_ready=true).

**Example usage:**
```
Enable prospect dashboard for [id] with tagline "Your personalized podcast opportunities"
```

## Get Your Supabase Service Role Key

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **service_role** key (NOT the anon key)

## How It Works

1. **create_prospect** creates a prospect dashboard record:
   - Generates unique 8-character slug
   - Creates record in `prospect_dashboards` table with content_ready=false
   - If `google_sheet_url` provided: links to existing sheet
   - If no sheet URL: leaves blank to add later
   - Returns dashboard URL and spreadsheet URL (or null)

2. **enable_prospect_dashboard** publishes the dashboard:
   - Sets `content_ready=true`
   - Optionally sets personalized tagline
   - Returns the public dashboard URL

The prospect dashboard at `/prospect/{slug}`:
- Shows "Coming Soon" when content_ready=false
- Shows full dashboard with podcasts when content_ready=true
- Appears in `/admin/prospect-dashboards` for admin management
- Can be shared with prospects to view their curated podcast opportunities

## Troubleshooting

**MCP server not showing up?**
- Make sure environment variables are set: `echo $SUPABASE_URL`
- Restart Claude Code after setting env vars
- Check `~/.claude/settings.json` has `"enabledMcpjsonServers": ["prospect-dashboard"]`

**Connection errors?**
- Verify the MCP server is built: `cd mcp-prospect-dashboard && npm run build`
- Check the path in `.mcp.json` is correct

**Authentication errors?**
- Verify your SUPABASE_SERVICE_ROLE_KEY is correct
- Make sure it's the service_role key, not the anon key

**Google Sheet creation failing?**
- Verify GOOGLE_SERVICE_ACCOUNT_JSON is configured in Supabase Edge Functions
- Check GOOGLE_WORKSPACE_USER_EMAIL is set
- Ensure service account has Sheets and Drive API access

## For Team Members

The `.mcp.json` file is committed to git, but you need to:
1. Set the environment variables above
2. Build the MCP server: `cd mcp-prospect-dashboard && npm install && npm run build`
3. Restart Claude Code

## Documentation

Full MCP server documentation: `mcp-prospect-dashboard/README.md`
