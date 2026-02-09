import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createProspect } from './tools/create-dashboard.js';
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
            google_sheet_url: { type: 'string', description: 'Google Sheet URL to link (optional)' },
            industry: { type: 'string', description: 'Industry vertical e.g. SaaS, Healthcare, Finance (optional)' },
            expertise: { type: 'array', items: { type: 'string' }, description: 'Areas of expertise for better podcast matching (optional)' },
            topics: { type: 'array', items: { type: 'string' }, description: 'Topics the prospect can speak on (optional)' },
            target_audience: { type: 'string', description: 'Description of the prospect target audience (optional)' },
            company: { type: 'string', description: 'Company name (optional)' },
            title: { type: 'string', description: 'Job title (optional)' }
          },
          required: ['prospect_name']
        }
      },
      {
        name: 'match_podcasts',
        description: 'Match a prospect to relevant podcasts using AI-powered semantic search. Finds podcasts that align with the prospect\'s expertise, topics, and audience. Use when user says "find podcasts for NAME" or "match podcasts for NAME".',
        inputSchema: {
          type: 'object',
          properties: {
            prospect_name: { type: 'string', description: 'Prospect full name' },
            prospect_bio: { type: 'string', description: 'Bio/background for matching (optional)' },
            prospect_id: { type: 'string', description: 'Prospect dashboard UUID - enables feedback exclusion and structured field lookup (optional)' },
            match_threshold: { type: 'number', description: 'Minimum similarity threshold 0-1 (default: 0.30)' },
            match_count: { type: 'number', description: 'Maximum number of matches to return (default: 50)' },
            use_ai_filter: { type: 'boolean', description: 'Use AI to filter and rank results (default: true)' },
            export_to_sheet: { type: 'boolean', description: 'Export matches to the prospect Google Sheet (default: false)' }
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
      case 'match_podcasts':
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
