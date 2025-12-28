// Check for files in trash that need to be permanently deleted
import { google } from 'googleapis';

async function main() {
  const keyFile = '/Users/jonathangarces/Desktop/adam_responses/goapfulfilment-4fc482944ac5.json';

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  console.log('Checking for files in trash...\n');

  // List trashed files
  const res = await drive.files.list({
    q: 'trashed=true',
    pageSize: 100,
    fields: 'files(id, name, mimeType, size)',
  });

  const files = res.data.files;

  if (!files || files.length === 0) {
    console.log('✓ No files in trash.');
    console.log('\nChecking all files including trash...\n');

    // List ALL files
    const allRes = await drive.files.list({
      pageSize: 100,
      fields: 'files(id, name, mimeType, size, trashed, ownedByMe)',
    });

    const allFiles = allRes.data.files;
    console.log(`Total files found: ${allFiles.length}\n`);

    let totalSize = 0;
    const ownedFiles = allFiles.filter(f => f.ownedByMe);

    console.log(`Files owned by service account: ${ownedFiles.length}\n`);

    ownedFiles.forEach((file, i) => {
      const sizeKB = file.size ? parseInt(file.size) / 1024 : 0;
      totalSize += parseInt(file.size || 0);
      console.log(`${i + 1}. ${file.name}`);
      console.log(`   ID: ${file.id}`);
      console.log(`   Type: ${file.mimeType}`);
      console.log(`   Size: ${sizeKB.toFixed(2)} KB`);
      console.log(`   Trashed: ${file.trashed || false}\n`);
    });

    console.log(`Total storage used: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  console.log(`Found ${files.length} files in trash:\n`);

  let totalSize = 0;
  files.forEach((file, i) => {
    const sizeKB = file.size ? parseInt(file.size) / 1024 : 0;
    totalSize += parseInt(file.size || 0);
    console.log(`${i + 1}. ${file.name}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Size: ${sizeKB.toFixed(2)} KB\n`);
  });

  console.log(`Total size in trash: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`);
  console.log('Permanently deleting all trashed files...\n');

  for (const file of files) {
    try {
      await drive.files.delete({ fileId: file.id });
      console.log(`✓ Permanently deleted: ${file.name}`);
    } catch (error) {
      console.error(`✗ Failed to delete ${file.name}:`, error.message);
    }
  }

  console.log('\n✅ Trash emptied!');
}

main().catch(console.error);
