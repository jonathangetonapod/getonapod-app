import { describe, expect, it } from 'vitest'
import { activeJobIds, batchDraftIds, pitchWritableIds } from '@/lib/pitchDrafts'
import type { ResearchJob } from '@/services/researchJobs'
import type { WorkspaceCampaignTarget } from '@/services/workspaceCampaigns'

const job = (overrides: Partial<ResearchJob>): ResearchJob => ({
  id: 'job', batch_id: 'batch', shortlist_podcast_id: 'row', podcast_name: 'Show', status: 'completed', phase: 'pitch',
  message: null, research_run_started_at: 'run-1', pitch: { subject: 'Idea', body: 'Hello' }, ...overrides,
})
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, visibility: 'visible' as const, feedback_status: 'approved' as const,
  research_progress: { status: 'completed' as const, current_stage: null, completed_stages: [], started_at: 'run-1' },
  ...overrides,
})

describe('batchDraftIds', () => {
  it('counts a finished draft written from the current research', () => {
    expect([...batchDraftIds([job({})], [row('row')])]).toEqual(['row'])
  })

  it('reads the slim list, which says a draft exists without carrying it', () => {
    expect([...batchDraftIds([job({ pitch: null, has_pitch: true })], [row('row')])]).toEqual(['row'])
  })

  it('ignores a draft written from research that has since been re-run', () => {
    expect(batchDraftIds([job({ research_run_started_at: 'run-0' })], [row('row')]).size).toBe(0)
  })

  it('judges by the newest finished draft, and skips unfinished or empty jobs', () => {
    const jobs = [
      job({ id: 'failed', status: 'failed', pitch: null }),
      job({ id: 'newest', research_run_started_at: 'run-0' }),
      job({ id: 'older' }),
    ]
    expect(batchDraftIds(jobs, [row('row')]).size).toBe(0)
  })
})

describe('pitchWritableIds', () => {
  const target = (overrides: Partial<WorkspaceCampaignTarget>) => overrides as WorkspaceCampaignTarget

  it('keeps approved, researched, visible shows with no pitch, draft or running job', () => {
    const podcasts = [
      row('ready'),
      row('unresearched', { research_progress: null }),
      row('archived', { visibility: 'archived' }),
      row('passed', { feedback_status: 'rejected' }),
      row('unreviewed', { feedback_status: null }),
      row('queued'),
      row('drafted'),
      row('written'),
      row('sent'),
    ]
    const targets = new Map([
      ['written', target({ status: 'draft', pitch_subject: 'Idea', pitch_body: 'Hello' })],
      ['sent', target({ status: 'in_outreach' })],
    ])
    const taken = new Set(['drafted', ...activeJobIds([job({ shortlist_podcast_id: 'queued', status: 'queued', pitch: null })])])
    expect(pitchWritableIds(podcasts, targets, taken)).toEqual(['ready'])
  })
})
