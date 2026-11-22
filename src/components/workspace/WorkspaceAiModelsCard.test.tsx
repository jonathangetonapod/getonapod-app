import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceAiModels: vi.fn(),
  getWorkspacePromptModels: vi.fn(),
  getWorkspaceResearchPromptOverrides: vi.fn(),
  setWorkspaceAiModel: vi.fn(),
  setWorkspacePromptModel: vi.fn(),
}))
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
  vi.mocked(getWorkspacePromptModels).mockResolvedValue([option('claude-sonnet-5-5', 'Claude Sonnet 5.5'), option('claude-haiku-5-5', 'Claude Haiku 5.5')])
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
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t read the models')
    expect(screen.queryByLabelText('Default model')).not.toBeInTheDocument()
  })
})
