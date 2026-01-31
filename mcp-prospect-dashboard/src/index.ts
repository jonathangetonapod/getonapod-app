import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createProspect } from './tools/create-dashboard.js';
import { enableProspectDashboard } from './tools/enable-dashboard.js';
import { matchPodcastsForProspect } from './tools/match-podcasts.js';

const server = new Server(
  {
    name: 'prospect-dashboard',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_prospect',
        description: 'Create a new prospect dashboard. Use when user says things like "create a new prospect called NAME" or "add prospect NAME" or "create prospect for NAME". Optionally accepts bio, profile picture URL, and Google Sheet URL to link.',
        inputSchema: {
          type: 'object',
          properties: {
            prospect_name: { type: 'string', description: 'Prospect full name' },
            bio: { type: 'string', description: 'Bio/background (optional)' },
            profile_picture_url: { type: 'string', description: 'Profile picture URL (optional)' },
            google_sheet_url: { type: 'string', description: 'Google Sheet URL to link (optional)' }
          },
          required: ['prospect_name']
        }
      },
      {
        name: 'enable_prospect_dashboard',
        description: 'Enable/publish a prospect dashboard so the prospect can view it. Sets content_ready=true and optionally adds a tagline.',
        inputSchema: {
          type: 'object',
          properties: {
            prospect_id: { type: 'string', description: 'Prospect UUID from create_prospect' },
            tagline: { type: 'string', description: 'Optional personalized tagline for the dashboard' }
          },
          required: ['prospect_id']
        }
      },
      {
        name: 'match_podcasts_for_prospect',
        description: 'Find matching podcasts for a prospect using AI-powered semantic search. Analyzes prospect name and bio, generates an embedding, and searches 7,884 podcasts across 67 categories for best matches. Returns podcasts ranked by similarity score with AI quality filtering. Guarantees at least 15 results.',
        inputSchema: {
          type: 'object',
          properties: {
            prospect_name: { type: 'string', description: 'Prospect full name (required)' },
            prospect_bio: { type: 'string', description: 'Prospect bio/background - more detailed = better matches (optional)' },
            match_threshold: { type: 'number', description: 'Minimum similarity (0.0-1.0). Default: 0.2' },
            match_count: { type: 'number', description: 'Max results. Default: 50, Max: 100' },
            prospect_id: { type: 'string', description: 'UUID from create_prospect (for export)' },
            export_to_sheet: { type: 'boolean', description: 'Export to Google Sheets. Default: false' },
            use_ai_filter: { type: 'boolean', description: 'Use AI to filter for quality/relevance. Default: true (recommended)' }
          },
          required: ['prospect_name']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'create_prospect':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(await createProspect(args as any), null, 2)
          }]
        };
      case 'enable_prospect_dashboard':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(await enableProspectDashboard(args as any), null, 2)
          }]
        };
      case 'match_podcasts_for_prospect':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(await matchPodcastsForProspect(args as any), null, 2)
          }]
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Prospect Dashboard Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
