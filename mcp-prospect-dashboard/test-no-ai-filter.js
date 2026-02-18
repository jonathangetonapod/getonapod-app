import { matchPodcastsForProspect } from './dist/tools/match-podcasts.js';

console.log('Testing WITHOUT AI filtering:\n');

async function test() {
  const result = await matchPodcastsForProspect({
    prospect_name: 'Alex Chen',
    prospect_bio: 'Tech entrepreneur focused on AI and machine learning',
    match_count: 15,
    use_ai_filter: false // Disable AI filtering
  });

  console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
  console.log(`\nTotal matches: ${result.data?.total_matches || 0}`);
}

test();
