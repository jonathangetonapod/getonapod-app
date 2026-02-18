import { matchPodcastsForProspect } from './dist/tools/match-podcasts.js';

console.log('Testing minimum 15 results guarantee\n');

async function test() {
  const result = await matchPodcastsForProspect({
    prospect_name: 'Test User',
    prospect_bio: 'Very specific niche topic that might not have many matches',
    match_count: 5,  // Request only 5, but should get at least 15
    match_threshold: 0.9  // Very high threshold, should trigger fallback
  });

  console.log('Requested: 5 matches with 0.9 threshold');
  console.log(`Received: ${result.data?.total_matches || 0} matches`);

  if (result.success && result.data) {
    console.log('\nTop 5 matches:');
    result.data.matches.slice(0, 5).forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.podcast_name} (${m.similarity.toFixed(3)})`);
    });

    if (result.data.total_matches >= 15) {
      console.log('\n✅ SUCCESS: Got at least 15 matches!');
    } else {
      console.log(`\n❌ FAILED: Only got ${result.data.total_matches} matches (expected 15+)`);
    }
  } else {
    console.log('❌ Error:', result.error);
  }
}

test();
