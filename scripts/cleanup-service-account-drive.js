// Script to list and delete all files from the service account's Google Drive
import fs from 'fs';
import { google } from 'googleapis';
import readline from 'readline';

async function main() {
  // Load service account credentials
  const keyFile = '/Users/jonathangarces/Desktop/adam_responses/goapfulfilment-4fc482944ac5.json';

  // Create JWT client with keyFile path
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  // List all files
  console.log('Fetching files from service account Drive...\n');
  const res = await drive.files.list({
    pageSize: 100,
    fields: 'files(id, name, mimeType, createdTime, size)',
  });

  const files = res.data.files;

  if (!files || files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log(`Found ${files.length} files:\n`);
  files.forEach((file, i) => {
    const sizeKB = file.size ? (parseInt(file.size) / 1024).toFixed(2) : 'N/A';
    console.log(`${i + 1}. ${file.name}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Type: ${file.mimeType}`);
    console.log(`   Created: ${file.createdTime}`);
    console.log(`   Size: ${sizeKB} KB\n`);
  });

  // Ask for confirmation before deleting
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Delete all these files? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes') {
      console.log('\nDeleting files...');
      for (const file of files) {
        try {
          await drive.files.delete({ fileId: file.id });
          console.log(`✓ Deleted: ${file.name}`);
        } catch (error) {
          console.error(`✗ Failed to delete ${file.name}:`, error.message);
        }
      }
      console.log('\nCleanup complete!');
    } else {
      console.log('Cancelled.');
    }
    rl.close();
  });
}

main().catch(console.error);
