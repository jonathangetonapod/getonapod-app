// Script to create a template spreadsheet that will be copied for each client
import { google } from 'googleapis';

async function main() {
  const keyFile = '/Users/jonathangarces/Desktop/adam_responses/goapfulfilment-4fc482944ac5.json';

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  });

  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const drive = google.drive({ version: 'v3', auth: authClient });

  console.log('Creating template spreadsheet...\n');

  // Create a spreadsheet with Drive API
  const createResponse = await drive.files.create({
    requestBody: {
      name: 'TEMPLATE - Podcast Leads',
      mimeType: 'application/vnd.google-apps.spreadsheet',
    },
    fields: 'id, webViewLink',
  });

  const spreadsheetId = createResponse.data.id;
  const spreadsheetUrl = createResponse.data.webViewLink;

  console.log(`✓ Created template spreadsheet`);
  console.log(`  ID: ${spreadsheetId}`);
  console.log(`  URL: ${spreadsheetUrl}\n`);

  // Add headers
  const headers = [
    'Podcast Name',
    'Publisher/Host',
    'Description',
    'Audience Size',
    'Episodes',
    'Rating',
    'Podcast URL',
    'Email',
    'RSS Feed',
    'Fit Score',
    'AI Reasoning',
    'Export Date',
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Add header values
        {
          updateCells: {
            range: {
              sheetId: 0,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            rows: [{
              values: headers.map(header => ({
                userEnteredValue: { stringValue: header },
              })),
            }],
            fields: 'userEnteredValue',
          },
        },
        // Format headers: bold, background color, text color
        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.2,
                  green: 0.6,
                  blue: 0.86,
                },
                textFormat: {
                  foregroundColor: {
                    red: 1.0,
                    green: 1.0,
                    blue: 1.0,
                  },
                  fontSize: 11,
                  bold: true,
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
          },
        },
        // Auto-resize columns
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: 0,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: headers.length,
            },
          },
        },
      ],
    },
  });

  console.log('✓ Formatted headers\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Template created successfully!');
  console.log('\nAdd this to your Supabase secrets:');
  console.log(`\nnpx supabase secrets set GOOGLE_SHEET_TEMPLATE_ID="${spreadsheetId}"\n`);
  console.log(`Template URL: ${spreadsheetUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
