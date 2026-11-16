import { hasWrittenPitch, pitchStatus } from '@/lib/shortlistPitchStatus'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'
import { jobHasDraft, type ResearchJob } from '@/services/researchJobs'
import type { WorkspaceCampaignTarget } from '@/services/workspaceCampaigns'

type DraftPodcast = Pick<ClientShortlistPodcast, 'id' | 'research_progress'>

/**
 * Shortlist rows with a batch-written pitch waiting for review.
 *
 * A draft counts only while it was written from the research the show has now:
 * the pitch view reuses it on the same test, so a row never promises a draft
 * the next screen would write again.
 */
export function batchDraftIds(jobs: readonly ResearchJob[], podcasts: readonly DraftPodcast[]): Set<string> {
  // Jobs arrive newest first; the first finished draft per show is the current one.
  const newest = new Map<string, ResearchJob>()
  for (const job of jobs) {
    if (job.status === 'completed' && jobHasDraft(job) && !newest.has(job.shortlist_podcast_id)) {
      newest.set(job.shortlist_podcast_id, job)
    }
  }
  const drafts = new Set<string>()
  for (const podcast of podcasts) {
    const job = newest.get(podcast.id)
    const run = podcast.research_progress?.started_at
    if (job && run && job.research_run_started_at === run) drafts.add(podcast.id)
  }
  return drafts
}

/** Rows a batch is working on now, research or pitch; queueing them again would only be refused. */
export function activeJobIds(jobs: readonly ResearchJob[]): Set<string> {
  return new Set(jobs.filter((job) => job.status === 'queued' || job.status === 'running').map((job) => job.shortlist_podcast_id))
}

type WritablePodcast = Pick<ClientShortlistPodcast, 'id' | 'visibility' | 'feedback_status' | 'research_progress'>

/**
 * Which of these rows a pitch-only batch would write for: approved (the same
 * rows that offer a pitch button), researched, still on the client's list, and
 * with no pitch, draft or running job already. The server makes its own checks;
 * this keeps rows it would skip out of the batch.
 */
export function pitchWritableIds(
  podcasts: readonly WritablePodcast[],
  targetsByPodcast: ReadonlyMap<string, WorkspaceCampaignTarget>,
  /** Rows with a current draft or a job under way. */
  taken: ReadonlySet<string>,
): string[] {
  return podcasts.filter((podcast) => {
    if (podcast.visibility !== 'visible' || podcast.feedback_status !== 'approved') return false
    if (podcast.research_progress?.status !== 'completed') return false
    if (taken.has(podcast.id)) return false
    const target = targetsByPodcast.get(podcast.id)
    return !hasWrittenPitch(target) && pitchStatus(target) === 'pending'
  }).map((podcast) => podcast.id)
}

/**
 * Which of these rows hold a batch draft that could be written again: a draft
 * exists, nothing is saved to the campaign, and no job is working on the show.
 * For after the prompts change; campaign copy is never rewritten.
 */
export function draftRewritableIds(
  podcasts: readonly WritablePodcast[],
  targetsByPodcast: ReadonlyMap<string, WorkspaceCampaignTarget>,
  drafts: ReadonlySet<string>,
  active: ReadonlySet<string>,
): string[] {
  return podcasts.filter((podcast) => {
    if (podcast.visibility !== 'visible' || podcast.feedback_status !== 'approved') return false
    if (!drafts.has(podcast.id) || active.has(podcast.id)) return false
    const target = targetsByPodcast.get(podcast.id)
    return !hasWrittenPitch(target) && pitchStatus(target) === 'pending'
  }).map((podcast) => podcast.id)
}
