import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientSdrPromptsCard } from '@/components/workspace/ClientSdrPromptsCard'
import {
  getClientPromptRequirements,
  getClientSdrPrompts,
  getWorkspacePromptRequirements,
  getWorkspaceResearchPromptOverrides,
  resetClientSdrPrompt,
  setClientPromptRequirements,
  setClientSdrPrompt,
} from '@/services/workspaceCampaigns'

vi.mock('@/services/workspaceCampaigns', () => ({
  getClientPromptRequirements: vi.fn(),
  getClientSdrPrompts: vi.fn(),
  getWorkspacePromptRequirements: vi.fn(),
  getWorkspaceResearchPromptOverrides: vi.fn(),
  resetClientSdrPrompt: vi.fn(),
  setClientPromptRequirements: vi.fn(),
  setClientSdrPrompt: vi.fn(),
}))

const mockedPrompts = vi.mocked(getClientSdrPrompts)
const mockedOverrides = vi.mocked(getWorkspaceResearchPromptOverrides)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const renderCard = (canManage = true) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ClientSdrPromptsCard
      workspaceId={workspaceId}
      clientId={clientId}
      clientName="Dallas Fontaine"
      canManage={canManage}
    />
  </QueryClientProvider>,
)

/** Opens a stage's editor by its heading button. */
// A prompt opens in a dialog now rather than expanding in place, so the title
// appears twice once it is open: on the row and in the dialog heading.
const openStage = async (title: string) => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Edit ${title}`, 'i') }))
}

describe('ClientSdrPromptsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPrompts.mockResolvedValue({})
    mockedOverrides.mockResolvedValue({})
    vi.mocked(getWorkspacePromptRequirements).mockResolvedValue({})
    vi.mocked(getClientPromptRequirements).mockResolvedValue({})
    vi.mocked(setClientSdrPrompt).mockResolvedValue(undefined)
    vi.mocked(resetClientSdrPrompt).mockResolvedValue(undefined)
    vi.mocked(setClientPromptRequirements).mockResolvedValue(undefined)
  })

  // A failed load used to render shipped defaults labelled "Workspace
  // default", and a save would have written them over the real prompt.
  it('shows an error with a retry instead of shipped defaults when the client prompts fail to load', async () => {
    mockedPrompts.mockRejectedValueOnce(new Error('The prompts could not be read.'))
    renderCard()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The prompts could not be read.')
    expect(screen.queryByText('Workspace default')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Pitch email/i })).not.toBeInTheDocument()

    mockedPrompts.mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /Edit Pitch email/i })).toBeInTheDocument()
  })

  it('shows the error when the workspace layer fails, since the fallback text is unknown', async () => {
    mockedOverrides.mockRejectedValueOnce(new Error('Workspace prompts unavailable.'))
    renderCard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace prompts unavailable.')
    expect(screen.queryByText('Workspace default')).not.toBeInTheDocument()
  })

  it('folds the prompts behind a one-line summary of the workspace defaults', async () => {
    renderCard()

    const summary = await screen.findByRole('button', { name: /AI prompts\s*Using workspace defaults\s*Customize/ })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Edit Pitch email/i })).not.toBeInTheDocument()

    fireEvent.click(summary)
    // One Edit per row; Save and Reset wait inside the editor.
    expect(await screen.findAllByRole('button', { name: /^Edit / })).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/house style/i)).not.toBeInTheDocument()
  })

  it('counts the prompts customized for this client', async () => {
    mockedPrompts.mockResolvedValue({
      write_email: { content: 'Custom pitch prompt', updated_at: null },
      find_topics: { content: 'Custom topics prompt', updated_at: null },
    } as never)
    renderCard()

    expect(await screen.findByRole('button', { name: /AI prompts\s*2 customized\s*Edit/ })).toBeInTheDocument()
  })

  it('asks before resetting a custom prompt to the workspace default', async () => {
    mockedPrompts.mockResolvedValue({ write_email: { content: 'Custom pitch prompt', updated_at: null } } as never)
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /AI prompts\s*1 customized/ }))
    await openStage('Pitch email')
    fireEvent.click(await screen.findByRole('button', { name: 'Reset to workspace default' }))
    expect(vi.mocked(resetClientSdrPrompt)).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Reset Pitch email to the workspace default?')

    fireEvent.click(screen.getByRole('button', { name: 'Keep custom prompt' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(vi.mocked(resetClientSdrPrompt)).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reset to workspace default' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reset prompt' }))
    await waitFor(() => expect(vi.mocked(resetClientSdrPrompt)).toHaveBeenCalledWith(workspaceId, clientId, 'write_email'))
  })
})
