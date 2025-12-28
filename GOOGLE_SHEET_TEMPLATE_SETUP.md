# Google Sheet Template Setup

To enable automatic sheet creation, you need to create a template spreadsheet once. Then the system will copy it for each client.

## Why This Approach?

- **Avoids storage quota**: Service accounts have very limited storage. By copying a template you own, new sheets are created in YOUR Drive, not the service account's.
- **One-time setup**: Create the template once, use it forever.
- **Consistent formatting**: Every client gets the same professional headers.

## Setup Steps

### 1. Create the Template Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Click **+ Blank** to create a new spreadsheet
3. Name it: `TEMPLATE - Podcast Leads`

### 2. Add Headers

Add these headers to the first row (A1 to L1):

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Podcast Name | Publisher/Host | Description | Audience Size | Episodes | Rating | Podcast URL | Email | RSS Feed | Fit Score | AI Reasoning | Export Date |

### 3. Format the Headers

1. Select row 1 (click the "1" on the left)
2. **Background**: Blue (#3399DB)
3. **Text Color**: White
4. **Font**: Bold
5. **Alignment**: Center (both horizontal and vertical)
6. **Optional**: Freeze the header row (View → Freeze → 1 row)

### 4. Share with Service Account

1. Click **Share** button (top right)
2. Add this email: `sheets-writer@goapfulfilment.iam.gserviceaccount.com`
3. Set permission to **Viewer** (service account just needs to copy it)
4. Click **Send**

### 5. Get the Template ID

The template ID is in the URL:
```
https://docs.google.com/spreadsheets/d/YOUR_TEMPLATE_ID_HERE/edit
```

Copy the ID (the part between `/d/` and `/edit`)

### 6. Add Template ID to Supabase

Run this command in your terminal:

```bash
npx supabase secrets set GOOGLE_SHEET_TEMPLATE_ID="YOUR_TEMPLATE_ID_HERE"
```

Replace `YOUR_TEMPLATE_ID_HERE` with the actual ID from step 5.

## Done!

Now when you click "Create Sheet" in the client details page:
- ✅ The template will be copied
- ✅ New sheet will be in YOUR Drive (no service account quota used)
- ✅ Headers are already formatted
- ✅ Service account automatically gets write access
- ✅ URL is saved to client record

## Troubleshooting

**"Template not found" error**: Make sure you shared the template with the service account email.

**"Permission denied" error**: Check that the service account has at least Viewer access to the template.

**Want to update the template**: Just edit the original template spreadsheet. All future copies will use the new format (existing client sheets won't change).
