import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import type { FinderFilters } from '@/lib/finderFilters'

/** One podcast as a scan stored it. */
export interface FinderScanPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  language: string | null
  region: string | null
  podcast_email: string | null
  rss_feed: string | null
  podcast_categories: Array<{ category_id: string; category_name: string }> | null
  source: 'database' | 'podscan'
}

export interface FinderScanResult {
  podcast: FinderScanPodcast
  /** 0-100, or null when the podcast could not be scored. */
  score: number | null
  reasoning: string | null
  /** The score is the keyword estimate, not the model's judgement. */
  estimated: boolean
}

export interface FinderScanSummary {
  id: string
  workspace_id: string
  client_id: string
  client_name: string | null
  queries: string[]
  found_count: number
  match_count: number
  credits_used: number
  created_at: string
}

export interface FinderScan extends FinderScanSummary {
  filters: FinderFilters
  results: FinderScanResult[]
}

export interface FinderScanInput {
  queries: string[]
  filters: FinderFilters
  found_count: number
  credits_used: number
  results: FinderScanResult[]
}

async function invokeFinderScans<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', { body })
  if (error) throw await toFunctionError(error, fallback)
  if (!data || typeof data !== 'object') throw new Error(fallback)
  return data as T
}

export async function saveFinderScan(
  workspaceId: string,
  clientId: string,
  scan: FinderScanInput,
): Promise<FinderScanSummary> {
  const data = await invokeFinderScans<{ scan?: FinderScanSummary }>({
    action: 'finder-scan-save',
    workspace_id: workspaceId.toLowerCase(),
    client_id: clientId.toLowerCase(),
    scan,
  }, 'The scan could not be saved.')
  if (!data.scan?.id) throw new Error('The scan could not be saved.')
  return data.scan
}

/** The five most recent scans, for one client or across the workspace. */
export async function listFinderScans(workspaceId: string, clientId?: string | null): Promise<FinderScanSummary[]> {
  const data = await invokeFinderScans<{ scans?: FinderScanSummary[] }>({
    action: 'finder-scan-list',
    workspace_id: workspaceId.toLowerCase(),
    ...(clientId ? { client_id: clientId.toLowerCase() } : {}),
  }, 'Recent scans could not be loaded.')
  return Array.isArray(data.scans) ? data.scans : []
}

export async function getFinderScan(workspaceId: string, scanId: string): Promise<FinderScan> {
  const data = await invokeFinderScans<{ scan?: FinderScan }>({
    action: 'finder-scan-get',
    workspace_id: workspaceId.toLowerCase(),
    scan_id: scanId.toLowerCase(),
  }, 'The scan could not be loaded.')
  if (!data.scan?.id) throw new Error('The scan could not be loaded.')
  return { ...data.scan, results: Array.isArray(data.scan.results) ? data.scan.results : [] }
}
