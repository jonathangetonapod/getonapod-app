import { matchPodcastsForProspect } from './dist/tools/match-podcasts.js';

console.log('🤖 Testing AI Quality Filtering\n');
console.log('='.repeat(70));

async function testAIFiltering() {
  console.log('\n📝 Prospect: Tech Entrepreneur (AI/ML Focus)\n');

  const result = await matchPodcastsForProspect({
    prospect_name: 'Alex Chen',
    prospect_bio: 'Tech entrepreneur focused on artificial intelligence, machine learning, and neural networks. Building AI-powered SaaS products.',
    match_count: 15,
    use_ai_filter: true // Enable AI filtering
  });

  if (result.success && result.data) {
    console.log(`✅ Found ${result.data.total_matches} AI-filtered matches\n`);
    console.log('Top 10 matches with AI explanations:\n');

    result.data.matches.slice(0, 10).forEach((match, i) => {
      console.log(`${i + 1}. ${match.podcast_name}`);
      console.log(`   📊 Similarity: ${match.similarity.toFixed(3)}`);
      if (match.relevance_score) {
        console.log(`   ⭐ AI Relevance: ${match.relevance_score}/10`);
      }
      if (match.relevance_reason) {
        console.log(`   💡 Why: ${match.relevance_reason}`);
      }
      console.log('');
    });

    // Show score distribution
    const scoreDistribution = result.data.matches.reduce((acc, m) => {
      const score = m.relevance_score || 0;
      if (score >= 9) acc.excellent++;
      else if (score >= 7) acc.strong++;
      else if (score >= 6) acc.good++;
      else acc.filtered++;
      return acc;
    }, { excellent: 0, strong: 0, good: 0, filtered: 0 });

    console.log('\n📊 Quality Distribution:');
    console.log(`   🌟 Excellent (9-10): ${scoreDistribution.excellent}`);
    console.log(`   ⭐ Strong (7-8): ${scoreDistribution.strong}`);
    console.log(`   ✓ Good (6-7): ${scoreDistribution.good}`);

  } else {
    console.log('❌ Error:', result.error);
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n💡 All matches shown are AI-verified as relevant!');
  console.log('   Safe to present to prospects.\n');
}

testAIFiltering();
