import { describe, expect, it } from 'vitest'
import {
  RELATIONSHIP_STAGES,
  RELATIONSHIP_STAGE_VIEW,
  relationshipBadge,
  relationshipStage,
  stageLabel,
} from '@/lib/relationshipLabels'

const summary = (
  derived_state: Parameters<typeof relationshipStage>[0]['derived_state'],
  manual_stage: Parameters<typeof relationshipStage>[0]['manual_stage'] = null,
) => ({ derived_state, manual_stage })

describe('stageLabel', () => {
  it('maps every derived state to one of the seven stages', () => {
    expect(stageLabel('none')).toBe('New')
    expect(stageLabel('pitched')).toBe('Pitched')
    expect(stageLabel('replied')).toBe('In conversation')
    expect(stageLabel('in_conversation')).toBe('In conversation')
    expect(stageLabel('booked')).toBe('Placed')
    expect(stageLabel('declined')).toBe('Not a fit')
    expect(stageLabel('suppressed')).toBe('Do not contact')
  })

  it('maps every stored override, including the retired warm', () => {
    expect(stageLabel('nurturing')).toBe('Nurturing')
    expect(stageLabel('warm')).toBe('Nurturing')
    expect(stageLabel('not_a_fit')).toBe('Not a fit')
    expect(stageLabel('placed')).toBe('Placed')
    expect(stageLabel('do_not_contact')).toBe('Do not contact')
  })

  it('reads a missing value as New', () => {
    expect(stageLabel(null)).toBe('New')
    expect(stageLabel(undefined)).toBe('New')
  })

  it('names every stage once, so two stages cannot share a word', () => {
    const labels = RELATIONSHIP_STAGES.map((stage) => stageLabel(stage))
    expect(labels).toEqual(['New', 'Pitched', 'In conversation', 'Nurturing', 'Placed', 'Not a fit', 'Do not contact'])
    expect(new Set(labels).size).toBe(labels.length)
    for (const view of Object.values(RELATIONSHIP_STAGE_VIEW)) {
      expect(view.className.length).toBeGreaterThan(0)
    }
  })
})

describe('relationshipStage', () => {
  it('follows outreach activity when nothing is set', () => {
    expect(relationshipStage(summary('replied'))).toBe('in_conversation')
    expect(relationshipStage(summary('none'))).toBe('new')
  })

  it('lets an explicit stage override activity', () => {
    expect(relationshipStage(summary('in_conversation', 'not_a_fit'))).toBe('not_a_fit')
    expect(relationshipStage(summary('pitched', 'placed'))).toBe('placed')
    expect(relationshipStage(summary('booked', 'do_not_contact'))).toBe('do_not_contact')
  })

  // The add form defaults to Nurturing. If it held through a live thread, a
  // hand-added host would never reach the quiet banner.
  it('holds Nurturing only until outreach starts', () => {
    expect(relationshipStage(summary('none', 'nurturing'))).toBe('nurturing')
    expect(relationshipStage(summary('none', 'warm'))).toBe('nurturing')
    expect(relationshipStage(summary('pitched', 'nurturing'))).toBe('pitched')
    expect(relationshipStage(summary('replied', 'warm'))).toBe('in_conversation')
  })

  // An opt-out is the host's decision. No override can hide it.
  it('never shows an opted-out host as anything but Do not contact', () => {
    expect(relationshipStage(summary('suppressed', 'in_conversation'))).toBe('do_not_contact')
  })
})

describe('relationshipBadge', () => {
  it('says nothing about a host at New', () => {
    // Every podcast in the catalogue is this one. A badge on all of them says
    // nothing and hides the ones that matter.
    expect(relationshipBadge(summary('none'))).toBeNull()
  })

  it('uses the same words as the relationship book', () => {
    expect(relationshipBadge(summary('booked'))?.label).toBe('Placed')
    expect(relationshipBadge(summary('declined'))?.label).toBe('Not a fit')
    expect(relationshipBadge(summary('replied', 'do_not_contact'))?.label).toBe('Do not contact')
    expect(relationshipBadge(summary('none', 'warm'))?.label).toBe('Nurturing')
  })
})
