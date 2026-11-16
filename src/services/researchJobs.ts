import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type ResearchJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped'

export interface ResearchJobPitch {
  subject: string
  body: string
  follow_up_1_body?: string | null
  follow_up_2_body?: string | null
}

export interface ResearchJobProgress {
  status?: string | null
  completed_stages?: string[]
  current_stage?: string | null
  updated_at?: string | null
  started_at?: string | null
  missing_fields?: string[] | null
}

/** One show in a background batch: research then pitch, or the pitch alone. */
export interface ResearchJob {
  id: string
  shortlist_podcast_id: string
  batch_id: string
  /** What the batch was started to do. Absent from older function builds, which only researched. */
  kind?: 'research' | 'pitch'
  podcast_name: string
  status: ResearchJobStatus
  phase: string
  message: string | null
  research_progress?: ResearchJobProgress | null
  /** The research run the pitch was written from; a draft is current only while this still matches. */
  research_run_started_at?: string | null
  pitch_steps_completed?: number
  /** A draft is saved for this job. The list no longer carries the emails themselves. */
  has_pitch?: boolean
  /** Inline only from older function builds; otherwise fetched with getResearchJobDraft. */
  pitch?: ResearchJobPitch | null
}

/** Shared by the batch panel and the shortlist rows, so both read one poll. */
export const researchJobsQueryKey = (workspaceId: string, clientId: string) =>
  ['research-batches', workspaceId, clientId] as const

/** Every 5 seconds while a job is queued or running; an idle list is checked far less often. */
export const researchJobsRefetchInterval = (jobs: readonly ResearchJob[] | undefined): number =>
  (jobs ?? []).some((job) => job.status === 'queued' || job.status === 'running') ? 5_000 : 30_000

/** Newest first, across every batch this client has had. */
export async function listResearchJobs(workspaceId: string, clientId: string): Promise<ResearchJob[]> {
  const { data, error } = await supabase.functions.invoke('workspace-client-shortlist', {
    body: { action: 'research-batch-list', workspace_id: workspaceId, client_id: clientId, slim: true },
  })
  if (error) throw await toFunctionError(error, 'The research batches could not be loaded.')
  return Array.isArray(data?.jobs) ? data.jobs as ResearchJob[] : []
}

/** Whether a finished draft is saved for this job, from either list shape. */
export const jobHasDraft = (job: Pick<ResearchJob, 'has_pitch' | 'pitch'>): boolean =>
  job.has_pitch === true || Boolean(job.pitch?.body?.trim())

/** One job's written sequence, read when the operator asks to see it. */
export async function getResearchJobDraft(workspaceId: string, clientId: string, jobId: string): Promise<ResearchJobPitch> {
  const { data, error } = await supabase.functions.invoke('workspace-client-shortlist', {
    body: { action: 'research-batch-draft', workspace_id: workspaceId, client_id: clientId, job_id: jobId },
  })
  if (error) throw await toFunctionError(error, 'The draft could not be loaded.')
  if (!data?.pitch || typeof data.pitch.body !== 'string') throw new Error('The draft could not be loaded.')
  return data.pitch as ResearchJobPitch
}
