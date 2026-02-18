#!/usr/bin/env node
import { matchPodcastsForProspect } from './dist/tools/match-podcasts.js';

console.log('🧪 Testing Podcast Matching Tool\n');
console.log('='.repeat(60));

async function runTests() {
  // Test 1: Basic matching
  console.log('\n📝 Test 1: Basic Marketing Consultant Match');
  console.log('-'.repeat(60));
  const result1 = await matchPodcastsForProspect({
    prospect_name: 'Sarah Johnson',
    prospect_bio: 'Marketing consultant specializing in SaaS startups and growth strategies',
    match_count: 10
    // Using default threshold of 0.2
  });

  if (result1.success) {
    console.log(`✅ Success! Found ${result1.data.total_matches} matches`);
    console.log(`\nTop 3 matches:`);
    result1.data.matches.slice(0, 3).forEach((match, i) => {
      console.log(`  ${i + 1}. ${match.podcast_name} (similarity: ${match.similarity.toFixed(3)})`);
      console.log(`     ${match.podcast_description?.substring(0, 100)}...`);
    });
  } else {
    console.log(`❌ Failed: ${result1.error}`);
  }

  // Test 2: Tech entrepreneur
  console.log('\n\n📝 Test 2: Tech/AI Entrepreneur Match');
  console.log('-'.repeat(60));
  const result2 = await matchPodcastsForProspect({
    prospect_name: 'Alex Chen',
    prospect_bio: 'Tech entrepreneur focused on AI, machine learning, and neural networks',
    match_count: 10
    // Using default threshold of 0.2
  });

  if (result2.success) {
    console.log(`✅ Success! Found ${result2.data.total_matches} matches`);
    console.log(`\nTop 3 matches:`);
    result2.data.matches.slice(0, 3).forEach((match, i) => {
      console.log(`  ${i + 1}. ${match.podcast_name} (similarity: ${match.similarity.toFixed(3)})`);
      console.log(`     ${match.podcast_description?.substring(0, 100)}...`);
    });
  } else {
    console.log(`❌ Failed: ${result2.error}`);
  }

  // Test 3: High threshold test
  console.log('\n\n📝 Test 3: High Similarity Threshold (0.7+)');
  console.log('-'.repeat(60));
  const result3 = await matchPodcastsForProspect({
    prospect_name: 'Jordan Smith',
    prospect_bio: 'Fitness coach and wellness expert',
    match_count: 20,
    match_threshold: 0.7
  });

  if (result3.success) {
    console.log(`✅ Success! Found ${result3.data.total_matches} matches above 0.7 threshold`);
    if (result3.data.matches.length > 0) {
      console.log(`\nTop 3 matches:`);
      result3.data.matches.slice(0, 3).forEach((match, i) => {
        console.log(`  ${i + 1}. ${match.podcast_name} (similarity: ${match.similarity.toFixed(3)})`);
      });
    }
  } else {
    console.log(`❌ Failed: ${result3.error}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ All tests completed!\n');
}

runTests().catch(error => {
  console.error('\n💥 Test failed with error:', error);
  process.exit(1);
});
