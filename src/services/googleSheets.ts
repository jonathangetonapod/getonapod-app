import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface CreateSheetResult {
  success: boolean
  spreadsheetUrl: string
  spreadsheetId: string
  message: string
}

export interface PodcastExportData {
  podcast_name: string
  podcast_description?: string | null
  itunes_rating?: number | null
  episode_count?: number | null
  podscan_podcast_id?: string | null
  podcast_id?: string | null  // Fallback if podscan_podcast_id not available
  // Legacy fields (not currently exported to sheets):
  publisher_name?: string | null
  audience_size?: number | null
  podcast_url?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
}

export interface ExportToSheetsResult {
  success: boolean
  rowsAdded: number
  updatedRange: string
}

export interface OutreachPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
}

export interface GetOutreachPodcastsResult {
  success: boolean
  podcasts: OutreachPodcast[]
  total: number
}

/**
 * Create a new Google Sheet for a client with formatted headers
 */
export async function createClientGoogleSheet(
  clientId: string,
  clientName: string
): Promise<CreateSheetResult> {
  if (!clientId || !clientName) {
    throw new Error('Client ID and name are required')
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to create a Google Sheet')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-client-google-sheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        clientId,
        clientName,
        ownerEmail: session.user.email, // Transfer ownership to logged-in user
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Create sheet error response:', error)
      throw new Error(error.error || error.details || 'Failed to create Google Sheet')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error creating Google Sheet:', error)
    throw new Error(`Failed to create Google Sheet: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Export podcasts to a client's Google Sheet
 */
export async function exportPodcastsToGoogleSheets(
  clientId: string,
  podcasts: PodcastExportData[]
): Promise<ExportToSheetsResult> {
  if (!clientId) {
    throw new Error('Client ID is required')
  }

  if (!podcasts || podcasts.length === 0) {
    throw new Error('At least one podcast must be selected for export')
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to export podcasts')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/export-to-google-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        clientId,
        podcasts,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to export to Google Sheets')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error exporting to Google Sheets:', error)
    throw new Error(`Failed to export podcasts: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get outreach podcasts from a client's Google Sheet
 * Reads column E (Podscan Podcast IDs) and fetches podcast details
 */
export async function getClientOutreachPodcasts(
  clientId: string
): Promise<GetOutreachPodcastsResult> {
  if (!clientId) {
    throw new Error('Client ID is required')
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to view outreach podcasts')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-outreach-podcasts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        clientId,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch outreach podcasts')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error fetching outreach podcasts:', error)
    throw new Error(`Failed to fetch outreach podcasts: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
