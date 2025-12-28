// Script to delete all files from the service account's Google Drive
import { google } from 'googleapis';

async function main() {
  const keyFile = '/Users/jonathangarces/Desktop/adam_responses/goapfulfilment-4fc482944ac5.json';

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  console.log('Fetching files from service account Drive...\n');
  const res = await drive.files.list({
    pageSize: 100,
    fields: 'files(id, name)',
  });

  const files = res.data.files;

  if (!files || files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log(`Found ${files.length} files. Deleting...\n`);

  for (const file of files) {
    try {
      await drive.files.delete({ fileId: file.id });
      console.log(`✓ Deleted: ${file.name}`);
    } catch (error) {
      console.error(`✗ Failed to delete ${file.name}:`, error.message);
    }
  }

  console.log('\n✅ Cleanup complete! Service account Drive is now empty.');
}

main().catch(console.error);
