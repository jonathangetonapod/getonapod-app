import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createProspect } from './tools/create-dashboard.js';

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
