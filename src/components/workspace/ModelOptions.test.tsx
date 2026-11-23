import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModelOptions } from '@/components/workspace/ModelOptions'
import type { PromptModelOption } from '@/services/workspaceCampaigns'

const model = (id: string, label: string, group?: string): PromptModelOption => ({
  id, label, contextTokens: null, maxOutputTokens: null, thinksByDefault: false, ...(group ? { group } : {}),
})

const renderSelect = (models: PromptModelOption[], showId = false) => render(
  <select aria-label="Model"><ModelOptions models={models} showId={showId} /></select>,
)

describe('model picker options', () => {
  it('keeps a single-vendor list flat', () => {
    renderSelect([model('claude-sonnet-5-5', 'Claude Sonnet 5.5'), model('claude-haiku-5-5', 'Claude Haiku 5.5')])
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Claude Sonnet 5.5', 'Claude Haiku 5.5'])
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('groups an OpenRouter list by vendor in server order, with counts', () => {
    renderSelect([
      model('openrouter/auto', 'Auto Router · price varies', 'OpenRouter'),
      model('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5 · $2 in / $10 out per 1M tokens', 'Anthropic'),
      model('anthropic/claude-haiku-5.5', 'Claude Haiku 5.5', 'Anthropic'),
      model('meta-llama/llama-4:free', 'Llama 4 · free', 'Meta'),
    ], true)
    const groups = screen.getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(['OpenRouter (1)', 'Anthropic (2)', 'Meta (1)'])
    expect(within(groups[1]).getByRole('option', { name: /Claude Sonnet 5\.5/ })).toHaveValue('anthropic/claude-sonnet-5.5')
    expect(within(groups[2]).getByRole('option')).toHaveTextContent('Llama 4 · free — meta-llama/llama-4:free')
  })
})
