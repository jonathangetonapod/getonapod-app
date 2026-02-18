import { generateProspectEmbedding, createProspectText } from './dist/services/openai.js';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRealEmbedding() {
  console.log('🧪 Testing with Real OpenAI Embedding\n');

  try {
    // Create prospect text
    const prospectText = createProspectText(
      'Sarah Johnson',
      'Marketing consultant specializing in SaaS startups and growth strategies'
    );
    console.log('📝 Prospect text:', prospectText);

    // Generate embedding
    console.log('\n🤖 Generating embedding with OpenAI...');
    const embedding = await generateProspectEmbedding(prospectText);
    console.log('✅ Embedding generated:', embedding.length, 'dimensions');
    console.log('   First 5 values:', embedding.slice(0, 5));

    // Search with the real embedding
    console.log('\n🔍 Searching database...');
    const { data, error } = await supabase.rpc('search_similar_podcasts', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 10
    });

    if (error) {
      console.log('❌ Error:', error.message);
      console.log('   Details:', error);
      return;
    }

    console.log(`✅ Found ${data.length} matches!\n`);

    if (data.length > 0) {
      console.log('Top matches:');
      data.forEach((match, i) => {
        console.log(`\n${i + 1}. ${match.podcast_name}`);
        console.log(`   Similarity: ${match.similarity.toFixed(3)}`);
        console.log(`   Categories:`, match.podcast_categories);
        console.log(`   Description: ${match.podcast_description?.substring(0, 100)}...`);
      });
    } else {
      console.log('⚠️  No matches found above 0.5 threshold');

      // Try with lower threshold
      console.log('\n🔍 Trying with 0.0 threshold...');
      const { data: allData, error: allError } = await supabase.rpc('search_similar_podcasts', {
        query_embedding: embedding,
        match_threshold: 0.0,
        match_count: 5
      });

      if (!allError && allData.length > 0) {
        console.log(`Found ${allData.length} matches with any threshold:`);
        allData.forEach(m => {
          console.log(`  - ${m.podcast_name} (${m.similarity.toFixed(3)})`);
        });
      }
    }

  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testRealEmbedding();
