import { supabase } from '../services/supabase.js';

interface CreateProspectInput {
  prospect_name: string;
  bio?: string;
  profile_picture_url?: string;
  google_sheet_url?: string;
}

interface CreateProspectResponse {
  success: boolean;
  prospect?: {
    id: string;
    name: string;
    slug: string;
    dashboard_url: string;
    spreadsheet_url: string | null;
  };
  error?: string;
}

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

export async function createProspect(
  input: CreateProspectInput
): Promise<CreateProspectResponse> {
  try {
    const slug = generateSlug();

    // Extract spreadsheet ID from URL if provided
    let spreadsheetId: string | null = null;
    let spreadsheetUrl: string | null = null;

    if (input.google_sheet_url) {
      spreadsheetUrl = input.google_sheet_url;
      const urlMatch = input.google_sheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (urlMatch) {
        spreadsheetId = urlMatch[1];
      } else {
        // If it's not a full URL, assume it's just the ID
        spreadsheetId = input.google_sheet_url;
        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      }
    }

    // Create prospect dashboard record directly
    const { data: dashboard, error: insertError } = await supabase
      .from('prospect_dashboards')
      .insert({
        slug,
        prospect_name: input.prospect_name,
        prospect_bio: input.bio || null,
        prospect_image_url: input.profile_picture_url || null,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        content_ready: true
      })
      .select('id, prospect_name, slug, spreadsheet_url')
      .single();

    if (insertError) {
      throw new Error(`Failed to create prospect: ${insertError.message}`);
    }

    const dashboardUrl = `${process.env.APP_URL}/prospect/${dashboard.slug}`;

    return {
      success: true,
      prospect: {
        id: dashboard.id,
        name: dashboard.prospect_name,
        slug: dashboard.slug,
        dashboard_url: dashboardUrl,
        spreadsheet_url: dashboard.spreadsheet_url
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
