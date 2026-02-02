#!/usr/bin/env node

/**
 * HANDLE LEAD SCRIPT
 * 
 * Processes a lead and creates a prospect dashboard + draft reply.
 * Used by Scout SDR agent.
 * 
 * Usage:
 *   node handle-lead.js --name "John Smith" --email "john@acme.com" \
 *     --company "Acme Corp" --reply "What are your packages?" \
 *     --temperature hot --intent pricing --campaign 218
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BRIDGEKIT_URL = process.env.BRIDGEKIT_URL || 'https://getbridgekit.com/mcp?session_token=sess_Roj864Tb13Js6qhA8Z_Htq_0r7VEaA2BMqcTMFrbvwE';
const DRAFTS_DIR = process.env.DRAFTS_DIR || path.join(process.env.HOME, 'drafts');

// Ensure drafts directory exists
if (!fs.existsSync(DRAFTS_DIR)) {
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
}

// Parse command line arguments
function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace('--', '');
    const value = argv[i + 1];
    args[key] = value;
  }
  
  return args;
}

// Call BridgeKit MCP tool
function callBridgekit(toolName, toolArgs) {
  const argsStr = Object.entries(toolArgs)
    .filter(([k, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(' ');
  
  const cmd = `mcporter call --http-url "${BRIDGEKIT_URL}" ${toolName} ${argsStr}`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
    // mcporter returns JSON directly
    const parsed = JSON.parse(result);
    return parsed;
  } catch (err) {
    console.error(`BridgeKit error (${toolName}):`, err.message);
    return { success: false, error: err.message };
  }
}

// Create prospect dashboard
async function createProspectDashboard(lead) {
  console.log('📊 Creating prospect dashboard...');
  
  const result = callBridgekit('create_prospect', {
    prospect_name: lead.name,
    bio: `${lead.company ? lead.company + '. ' : ''}${lead.bio || 'Interested in podcast guesting opportunities.'}`
  });
  
  if (!result.success || result.error) {
    console.error('❌ Failed to create dashboard:', result.error || 'Unknown error');
    return null;
  }
  
  // Extract from nested prospect object
  const prospect = result.prospect || result;
  console.log('✅ Dashboard created:', prospect.dashboard_url || prospect.slug);
  
  return {
    prospect_id: prospect.id,
    dashboard_url: prospect.dashboard_url,
    spreadsheet_url: prospect.spreadsheet_url,
    slug: prospect.slug
  };
}

// Match podcasts for prospect
async function matchPodcasts(prospectId, lead) {
  console.log('🎙️ Matching podcasts...');
  
  const result = callBridgekit('match_podcasts_for_prospect', {
    prospect_name: lead.name,
    prospect_bio: lead.bio || `Expert from ${lead.company}`,
    prospect_id: prospectId,
    match_count: 20
  });
  
  if (!result.success && result.error) {
    console.error('❌ Failed to match podcasts:', result.error);
    return null;
  }
  
  const matchCount = result.data?.matches?.length || 'some';
  console.log(`✅ Podcasts matched (${matchCount})`);
  return result;
}

// Run AI analysis
async function runAnalysis(prospectId) {
  console.log('🤖 Running AI analysis...');
  
  const result = callBridgekit('run_ai_analysis_for_prospect', {
    prospect_id: prospectId
  });
  
  if (!result.success && result.error) {
    console.error('❌ Failed to run analysis:', result.error);
    return null;
  }
  
  const analyzed = result.analysis_results?.analyzed || '?';
  console.log(`✅ Analysis complete (${analyzed} podcasts)`);
  return result;
}

// Publish dashboard
async function publishDashboard(prospectId) {
  console.log('🚀 Publishing dashboard...');
  
  const result = callBridgekit('toggle_prospect_publish', {
    prospect_id: prospectId
  });
  
  if (!result.success && result.error) {
    console.error('❌ Failed to publish:', result.error);
    return null;
  }
  
  console.log('✅ Dashboard published:', result.published ? 'LIVE' : 'hidden');
  return result;
}

// Update opportunity stage in Twenty CRM
async function updateOpportunityStage(lead, newStage) {
  console.log(`📊 Updating opportunity to ${newStage}...`);
  
  // Search for the opportunity by name
  const searchResult = callBridgekit('twenty_search_opportunities', {
    stage: 'LEAD',
    limit: 50
  });
  
  if (!searchResult.success) {
    console.log('⚠️ Could not search opportunities');
    return null;
  }
  
  // Find matching opportunity (by email in name or contact)
  // For now, just log that we would update
  console.log(`✅ Stage update: LEAD → ${newStage} (ready for manual update)`);
  return { stage: newStage };
}

// Get reply template based on temperature
function getReplyTemplate(lead, dashboardUrl) {
  const templates = {
    hot: `Hi ${lead.firstName}!

Great question – I'd be happy to walk you through our packages.

**Our podcast placement packages:**

| Package | Placements | Price |
|---------|------------|-------|
| **Starter** | 3 podcasts | $2,500 |
| **Growth** | 6 podcasts | $4,500 |
| **Authority** | 12 podcasts | $8,000 |

Every package includes:
- ✅ Hand-picked podcasts matched to your expertise
- ✅ Personalized outreach to hosts on your behalf
- ✅ Full booking coordination & prep support
- ✅ Your own dashboard to track placements

${dashboardUrl ? `I put together a personalized list of podcast matches for you:\n${dashboardUrl}\n` : ''}
Let me know if you have any questions about the packages!

Talk soon,
Scout
Get On A Pod`,

    warm: `Hi ${lead.firstName}!

Thanks for getting back to me.

${dashboardUrl ? `I put together a personalized dashboard with podcast opportunities that would be perfect for someone with your background:\n${dashboardUrl}\n` : 'I can put together a personalized list of podcasts that would be perfect for your expertise.'}

These are hand-picked shows where your insights would really resonate. Take a look and let me know which ones catch your eye!

Happy to answer any questions.

Best,
Scout
Get On A Pod`,

    cool: `Hi ${lead.firstName}!

Totally understand – timing is everything.

${dashboardUrl ? `In the meantime, I've put together a dashboard with some podcast opportunities for when you're ready:\n${dashboardUrl}\n` : ''}
Feel free to check it out whenever works. I'll follow up in a few weeks to see if things have freed up.

Best,
Scout
Get On A Pod`,

    cold: `Hi ${lead.firstName}!

Thanks for letting me know – I appreciate the response.

If things change down the road, feel free to reach out. Wishing you all the best!

Best,
Scout
Get On A Pod`
  };
  
  return templates[lead.temperature] || templates.warm;
}

// Save draft to file
function saveDraft(lead, reply, dashboardUrl, prospectId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${lead.email.replace('@', '_at_')}.md`;
  const filepath = path.join(DRAFTS_DIR, filename);
  
  const content = `# Draft Reply

**Created:** ${new Date().toISOString()}
**Lead:** ${lead.name} <${lead.email}>
**Company:** ${lead.company || 'Unknown'}
**Temperature:** ${lead.temperature.toUpperCase()}
**Intent:** ${lead.intent}
**Campaign:** ${lead.campaign}

---

## Their Reply

"${lead.reply}"

---

## Dashboard

${dashboardUrl ? `**URL:** ${dashboardUrl}\n**Prospect ID:** ${prospectId}` : '⚠️ Dashboard not created (BridgeKit error)'}

---

## Draft Reply

\`\`\`
${reply}
\`\`\`

---

## Status

- [ ] Reviewed
- [ ] Approved
- [ ] Sent

---

## Actions

- Approve and send: \`bison reply ${lead.email} --template this-file\`
- Edit and send: Make changes above, then send manually
- Reject: Delete this file
`;

  fs.writeFileSync(filepath, content);
  console.log(`\n📄 Draft saved: ${filepath}`);
  
  return filepath;
}

// Main function
async function handleLead(args) {
  const lead = {
    name: args.name || 'Unknown',
    firstName: (args.name || 'there').split(' ')[0],
    email: args.email || 'unknown@example.com',
    company: args.company || '',
    reply: args.reply || '',
    temperature: (args.temperature || 'warm').toLowerCase(),
    intent: args.intent || 'unknown',
    campaign: args.campaign || 'unknown',
    bio: args.bio || ''
  };
  
  console.log(`\n🎯 Processing ${lead.temperature.toUpperCase()} lead: ${lead.name}`);
  console.log(`   Email: ${lead.email}`);
  console.log(`   Intent: ${lead.intent}`);
  console.log('');
  
  let prospectId = null;
  let dashboardUrl = null;
  
  // For HOT and WARM leads, create dashboard
  if (['hot', 'warm'].includes(lead.temperature)) {
    const prospect = await createProspectDashboard(lead);
    
    if (prospect && prospect.prospect_id) {
      prospectId = prospect.prospect_id;
      dashboardUrl = prospect.dashboard_url;
      
      console.log(`   Dashboard URL: ${dashboardUrl}`);
      
      // Match podcasts
      await matchPodcasts(prospectId, lead);
      
      // Run AI analysis
      await runAnalysis(prospectId);
      
      // Publish
      await publishDashboard(prospectId);
      
      // Update opportunity stage to REPLIED (we sent dashboard)
      await updateOpportunityStage(lead, 'REPLIED');
    } else {
      console.log('⚠️ Could not create dashboard, continuing without...');
    }
  }
  
  // Generate reply
  console.log('\n✍️ Generating reply...');
  const reply = getReplyTemplate(lead, dashboardUrl);
  
  // Save draft
  const draftPath = saveDraft(lead, reply, dashboardUrl, prospectId);
  
  // Output summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Lead: ${lead.name} (${lead.temperature.toUpperCase()})`);
  console.log(`Dashboard: ${dashboardUrl || 'Not created'}`);
  console.log(`Draft: ${draftPath}`);
  console.log('='.repeat(50));
  
  return {
    lead,
    prospectId,
    dashboardUrl,
    reply,
    draftPath
  };
}

// Run
const args = parseArgs();
handleLead(args).catch(console.error);
