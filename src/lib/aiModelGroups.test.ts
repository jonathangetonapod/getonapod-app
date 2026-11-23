import { describe, expect, it } from 'vitest'
import { groupModels, parseModelId } from '@/lib/aiModelGroups'

const option = (id: string) => ({ id, label: id, contextTokens: null, maxOutputTokens: null, thinksByDefault: false })
const ids = (models: Array<{ id: string }>) => models.map((model) => model.id)

describe('groupModels', () => {
  it('puts the newest model of each Claude family under Latest, largest first', () => {
    const { latest, older } = groupModels([
      'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5',
      'claude-opus-5', 'claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022',
    ].map(option))
    expect(ids(latest)).toEqual(['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
    expect(ids(older)).toEqual(['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-4-5-20250929', 'claude-3-5-haiku-20241022'])
  })

  it('follows the list it is given, so a new release moves into Latest on its own', () => {
    const { latest } = groupModels(['claude-sonnet-5-5', 'claude-sonnet-6'].map(option))
    expect(ids(latest)).toEqual(['claude-sonnet-6'])
  })

  it('groups OpenAI models by their newest version', () => {
    const { latest, older } = groupModels(['gpt-4.1', 'gpt-5', 'gpt-5.1', 'gpt-5.1-mini'].map(option))
    expect(ids(latest)).toEqual(['gpt-5.1', 'gpt-5.1-mini'])
    expect(ids(older)).toEqual(['gpt-4.1', 'gpt-5'])
  })

  it('keeps a model it cannot read under Older rather than dropping it', () => {
    expect(ids(groupModels([option('mystery-model')]).older)).toEqual(['mystery-model'])
  })

  it('reads both Claude id styles', () => {
    expect(parseModelId('claude-3-5-haiku-20241022')).toEqual({ family: 'claude-haiku', version: [3, 5] })
    expect(parseModelId('claude-opus-4-1-20250805')).toEqual({ family: 'claude-opus', version: [4, 1] })
    expect(parseModelId('claude-opus-5')).toEqual({ family: 'claude-opus', version: [5, 0] })
  })
})
