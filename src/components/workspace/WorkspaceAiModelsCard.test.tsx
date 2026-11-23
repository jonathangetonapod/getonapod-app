import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceAiModelsCard } from './WorkspaceAiModelsCard'
import {
  getWorkspaceAiModels,
  getWorkspacePromptModels,
  getWorkspaceResearchPromptOverrides,
  setWorkspaceAiModel,
  setWorkspacePromptModel,
  type WorkspaceAiModels,
} from '@/services/workspaceCampaigns'
import { getWorkspaceAiKeys } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceAiModels: vi.fn(),
  getWorkspacePromptModels: vi.fn(),
  getWorkspaceResearchPromptOverrides: vi.fn(),
  setWorkspaceAiModel: vi.fn(),
  setWorkspacePromptModel: vi.fn(),
}))
vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceAiKeys: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const option = (id: string, label: string) => ({ id, label, contextTokens: null, maxOutputTokens: null, thinksByDefault: false })
const noChoices: WorkspaceAiModels = {
  default: null, research_structure: null, pitch_fact_check: null, host_discovery: null, fit_scoring: null,
  search_queries: null, prospect_dashboard: null, autopilot: null, profile_drafts: null,
}

const renderCard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><WorkspaceAiModelsCard workspaceId={workspaceId} /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getWorkspacePromptModels).mockResolvedValue([
    option('claude-fable-5-2', 'Claude Fable 5.2'), option('claude-opus-5-5', 'Claude Opus 5.5'),
    option('claude-sonnet-5-5', 'Claude Sonnet 5.5'), option('claude-haiku-5-5', 'Claude Haiku 5.5'),
    option('claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5'),
  ])
  vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
    anthropic: { configured: true, last_four: '1234', updated_at: null },
    openai: { configured: false, last_four: null, updated_at: null },
    default_provider: 'anthropic',
  })
  vi.mocked(getWorkspaceAiModels).mockResolvedValue({ ...noChoices, pitch_fact_check: 'claude-haiku-5-5' })
  vi.mocked(getWorkspaceResearchPromptOverrides).mockResolvedValue({ write_email: { content: null, model: 'claude-sonnet-5-5', updated_at: null } })
  vi.mocked(setWorkspaceAiModel).mockResolvedValue(undefined)
  vi.mocked(setWorkspacePromptModel).mockResolvedValue(undefined)
})

describe('workspace AI model settings', () => {
  it('shows the saved choices and leaves untouched steps on the workspace default', async () => {
    renderCard()
    expect(await screen.findByLabelText('Default model')).toHaveValue('')
    expect(screen.getByLabelText('Pitch fact-check')).toHaveValue('claude-haiku-5-5')
    expect(screen.getByLabelText('Pitch email draft')).toHaveValue('claude-sonnet-5-5')
    expect(screen.getByLabelText('Fit scoring')).toHaveValue('')
    // Retired inbox stages are not offered.
    expect(screen.queryByLabelText('Inbox reply')).not.toBeInTheDocument()
  })

  it('saves the workspace default and a step choice through the settings action', async () => {
    renderCard()
    fireEvent.change(await screen.findByLabelText('Default model'), { target: { value: 'claude-haiku-5-5' } })
    await waitFor(() => expect(setWorkspaceAiModel).toHaveBeenCalledWith(workspaceId, 'default', 'claude-haiku-5-5'))
    fireEvent.change(screen.getByLabelText('Pitch fact-check'), { target: { value: '' } })
    await waitFor(() => expect(setWorkspaceAiModel).toHaveBeenCalledWith(workspaceId, 'pitch_fact_check', null))
    expect(setWorkspacePromptModel).not.toHaveBeenCalled()
  })

  it('saves a research or pitch stage through the existing per-stage action', async () => {
    renderCard()
    fireEvent.change(await screen.findByLabelText('Podcast research'), { target: { value: 'claude-haiku-5-5' } })
    await waitFor(() => expect(setWorkspacePromptModel).toHaveBeenCalledWith(workspaceId, 'podcast_research', 'claude-haiku-5-5'))
    expect(setWorkspaceAiModel).not.toHaveBeenCalled()
  })

  it('keeps showing a saved model the current key no longer lists', async () => {
    vi.mocked(getWorkspaceAiModels).mockResolvedValue({ ...noChoices, autopilot: 'claude-retired-1' })
    renderCard()
    expect(await screen.findByLabelText('Autopilot')).toHaveValue('claude-retired-1')
    expect(screen.getByRole('option', { name: 'claude-retired-1 (not available with the current key)' })).toBeInTheDocument()
  })

  it('locks every choice when the model list cannot be read', async () => {
    vi.mocked(getWorkspacePromptModels).mockRejectedValue(new Error('no key'))
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't read the models")
    expect(screen.queryByLabelText('Default model')).not.toBeInTheDocument()
  })

  it('lists the Latest models apart from the Older ones', async () => {
    renderCard()
    const select = await screen.findByLabelText('Default model')
    const latest = within(select).getByRole('group', { name: 'Latest' })
    const older = within(select).getByRole('group', { name: 'Older' })
    expect(within(latest).getAllByRole('option').map((item) => item.textContent)).toEqual([
      'Claude Fable 5.2', 'Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5',
    ])
    expect(within(older).getAllByRole('option').map((item) => item.textContent)).toEqual(['Claude Sonnet 4.5'])
  })

  it('names the current default in every step that follows it, and updates it when the default changes', async () => {
    renderCard()
    const fitScoring = await screen.findByLabelText('Fit scoring')
    expect(within(fitScoring).getAllByRole('option')[0]).toHaveTextContent('Use default (Claude Sonnet 5.5)')
    expect(screen.getAllByRole('option', { name: 'Use default (Claude Sonnet 5.5)' })).toHaveLength(15)

    vi.mocked(getWorkspaceAiModels).mockResolvedValue({ ...noChoices, default: 'claude-opus-5-5', pitch_fact_check: 'claude-haiku-5-5' })
    fireEvent.change(screen.getByLabelText('Default model'), { target: { value: 'claude-opus-5-5' } })
    await waitFor(() => expect(within(fitScoring).getAllByRole('option')[0]).toHaveTextContent('Use default (Claude Opus 5.5)'))
    expect(screen.getAllByRole('option', { name: 'Use default (Claude Opus 5.5)' })).toHaveLength(15)
    // A step with its own model keeps it.
    expect(screen.getByLabelText('Pitch fact-check')).toHaveValue('claude-haiku-5-5')
  })

  it('marks steps with their own model and counts them', async () => {
    renderCard()
    await screen.findByLabelText('Default model')
    // pitch_fact_check and write_email carry their own model.
    expect(screen.getByText('2 of 15 steps use a custom model')).toBeInTheDocument()
    expect(screen.getAllByText('Custom')).toHaveLength(2)
    expect(screen.getByLabelText('Pitch fact-check')).toHaveClass('border-primary')
    expect(screen.getByLabelText('Fit scoring')).not.toHaveClass('border-primary')

    // The server keeps the choice, so the refetch after the save agrees.
    vi.mocked(getWorkspaceAiModels).mockResolvedValue({ ...noChoices, pitch_fact_check: 'claude-haiku-5-5', autopilot: 'claude-opus-5-5' })
    fireEvent.change(screen.getByLabelText('Autopilot'), { target: { value: 'claude-opus-5-5' } })
    expect(await screen.findByText('3 of 15 steps use a custom model')).toBeInTheDocument()
    await waitFor(() => expect(setWorkspaceAiModel).toHaveBeenCalledWith(workspaceId, 'autopilot', 'claude-opus-5-5'))
  })

  it('says when every step follows the default and offers no reset', async () => {
    vi.mocked(getWorkspaceAiModels).mockResolvedValue(noChoices)
    vi.mocked(getWorkspaceResearchPromptOverrides).mockResolvedValue({})
    renderCard()
    expect(await screen.findByText('All 15 steps use the default model')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset all to default' })).not.toBeInTheDocument()
  })

  it('resets every custom step after confirmation, through each step’s own action', async () => {
    renderCard()
    await screen.findByLabelText('Default model')
    fireEvent.click(screen.getByRole('button', { name: 'Reset all to default' }))
    expect(setWorkspaceAiModel).not.toHaveBeenCalled()
    vi.mocked(getWorkspaceAiModels).mockResolvedValue(noChoices)
    vi.mocked(getWorkspaceResearchPromptOverrides).mockResolvedValue({})
    fireEvent.click(await screen.findByRole('button', { name: 'Reset all' }))
    await waitFor(() => expect(setWorkspaceAiModel).toHaveBeenCalledWith(workspaceId, 'pitch_fact_check', null))
    await waitFor(() => expect(setWorkspacePromptModel).toHaveBeenCalledWith(workspaceId, 'write_email', null))
    // The default itself is left alone.
    expect(setWorkspaceAiModel).not.toHaveBeenCalledWith(workspaceId, 'default', null)
    expect(await screen.findByText('All 15 steps use the default model')).toBeInTheDocument()
  })

  it('names the OpenAI default when OpenAI is the provider', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
      anthropic: { configured: false, last_four: null, updated_at: null },
      openai: { configured: true, last_four: '9999', updated_at: null },
      default_provider: 'openai',
    })
    vi.mocked(getWorkspacePromptModels).mockResolvedValue([option('gpt-4.1', 'OpenAI · gpt-4.1'), option('gpt-5.1', 'OpenAI · gpt-5.1')])
    vi.mocked(getWorkspaceAiModels).mockResolvedValue(noChoices)
    renderCard()
    const select = await screen.findByLabelText('Default model')
    await waitFor(() => expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Recommended (OpenAI · gpt-4.1)'))
    expect(within(select).queryByRole('option', { name: /Claude/u })).not.toBeInTheDocument()
  })

  it('groups an OpenRouter list by vendor instead of Latest and Older', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
      anthropic: { configured: false, last_four: null, updated_at: null },
      openrouter: { configured: true, last_four: '9876', updated_at: null },
      default_provider: 'openrouter',
    })
    vi.mocked(getWorkspacePromptModels).mockResolvedValue([
      { ...option('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5'), group: 'Anthropic' },
      { ...option('openai/gpt-5.1', 'GPT-5.1'), group: 'OpenAI' },
    ])
    vi.mocked(getWorkspaceAiModels).mockResolvedValue(noChoices)
    vi.mocked(getWorkspaceResearchPromptOverrides).mockResolvedValue({})
    renderCard()
    const select = await screen.findByLabelText('Default model')
    expect(within(select).getByRole('group', { name: 'Anthropic (1)' })).toBeInTheDocument()
    expect(within(select).getByRole('group', { name: 'OpenAI (1)' })).toBeInTheDocument()
    expect(within(select).queryByRole('group', { name: 'Latest' })).not.toBeInTheDocument()
    await waitFor(() => expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Recommended (Claude Sonnet 5.5)'))
  })
})
