// Script to get Google Indexing API access token
// Run: node scripts/get-google-token.js path/to/service-account.json

import { GoogleAuth } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';

async function getAccessToken(keyFilePath) {
  try {
    // Read the service account key file
    const keyFile = JSON.parse(readFileSync(keyFilePath, 'utf8'));

    // Create auth client
    const auth = new GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });

    // Get access token
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    console.log('\n✅ Access Token Generated!\n');
    console.log('Token:', accessToken.token);
    console.log('\nExpires:', new Date(accessToken.res.data.expiry_date).toLocaleString());
    console.log('\n📝 Set this token in Supabase:');
    console.log(`npx supabase secrets set GOOGLE_INDEXING_TOKEN="${accessToken.token}"`);
    console.log('\n⚠️  Note: This token expires in 1 hour. You\'ll need to regenerate it periodically.');
    console.log('For production, use the service account JSON directly in your Edge Function.\n');

  } catch (error) {
    console.error('❌ Error getting access token:', error.message);
    process.exit(1);
  }
}

// Get key file path from command line
const keyFilePath = process.argv[2];

if (!keyFilePath) {
  console.error('❌ Usage: node scripts/get-google-token.js path/to/service-account.json');
  process.exit(1);
}

if (!existsSync(keyFilePath)) {
  console.error('❌ Key file not found:', keyFilePath);
  process.exit(1);
}

getAccessToken(keyFilePath);
