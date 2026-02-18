import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabase() {
  console.log('🔍 Checking Database Setup\n');

  // Check if podcasts have embeddings
  const { count, error: countError } = await supabase
    .from('podcasts')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  if (countError) {
    console.log('❌ Error counting podcasts:', countError.message);
  } else {
    console.log(`✅ Podcasts with embeddings: ${count}`);
  }

  // Check total podcasts
  const { count: total, error: totalError } = await supabase
    .from('podcasts')
    .select('*', { count: 'exact', head: true });

  if (totalError) {
    console.log('❌ Error counting total podcasts:', totalError.message);
  } else {
    console.log(`📊 Total podcasts: ${total}`);
  }

  // Check if function exists by calling it with a dummy embedding
  console.log('\n🧪 Testing search_similar_podcasts function...');
  const dummyEmbedding = new Array(1536).fill(0);
  const { data, error } = await supabase.rpc('search_similar_podcasts', {
    query_embedding: dummyEmbedding,
    match_threshold: 0.0,
    match_count: 5
  });

  if (error) {
    console.log('❌ Error calling search_similar_podcasts:', error.message);
    console.log('   Code:', error.code);
    console.log('   Hint:', error.hint);
  } else {
    const resultCount = data ? data.length : 0;
    console.log(`✅ Function works! Returned ${resultCount} results`);
    if (resultCount > 0) {
      console.log('\nSample result:');
      console.log('  -', data[0].podcast_name);
      console.log('  - Similarity:', data[0].similarity);
    }
  }
}

checkDatabase().catch(error => {
  console.error('💥 Error:', error);
  process.exit(1);
});
