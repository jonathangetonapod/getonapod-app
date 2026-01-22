import { supabase } from '../services/supabase.js';

interface EnableProspectDashboardInput {
  prospect_id: string;
  tagline?: string;
}

interface EnableProspectDashboardResponse {
  success: boolean;
  dashboard_url?: string;
  enabled_at?: string;
  error?: string;
}

export async function enableProspectDashboard(
  input: EnableProspectDashboardInput
): Promise<EnableProspectDashboardResponse> {
  try {
    const updateData: any = {
      content_ready: true
    };

    // Add tagline if provided
    if (input.tagline) {
      updateData.personalized_tagline = input.tagline;
    }

    const { data, error } = await supabase
      .from('prospect_dashboards')
      .update(updateData)
      .eq('id', input.prospect_id)
      .select('slug, personalized_tagline')
      .single();

    if (error) {
      throw new Error(`Failed to enable prospect dashboard: ${error.message}`);
    }

    const dashboardUrl = `${process.env.APP_URL}/prospect/${data.slug}`;

    return {
      success: true,
      dashboard_url: dashboardUrl,
      enabled_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
