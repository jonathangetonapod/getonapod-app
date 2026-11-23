import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceAiKeysCard } from './WorkspaceAiKeysCard'
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  setWorkspaceAiKey,
  setWorkspaceAiProvider,
  testWorkspaceAiKey,
  type WorkspaceAiKeysView,
} from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceAiKeys: vi.fn(), clearWorkspaceAiKey: vi.fn(), setWorkspaceAiKey: vi.fn(), setWorkspaceAiProvider: vi.fn(), testWorkspaceAiKey: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const saved = { configured: true, last_four: '1234', updated_at: '2026-10-28T12:00:00Z' }
const none = { configured: false, last_four: null, updated_at: null }
const claudeOnly: WorkspaceAiKeysView = { anthropic: saved, openai: none, default_provider: 'anthropic' }

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const renderWith = (id: string) => <QueryClientProvider client={client}><WorkspaceAiKeysCard workspaceId={id} /></QueryClientProvider>
  const view = render(renderWith(workspaceId))
  return { ...view, updateWorkspace: (id: string) => view.rerender(renderWith(id)) }
}

const toggle = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getWorkspaceAiKeys).mockResolvedValue(claudeOnly)
  vi.mocked(clearWorkspaceAiKey).mockResolvedValue(undefined)
  vi.mocked(setWorkspaceAiKey).mockResolvedValue(undefined)
  vi.mocked(setWorkspaceAiProvider).mockResolvedValue(undefined)
  vi.mocked(testWorkspaceAiKey).mockResolvedValue('valid')
})

describe('AI provider card', () => {
  it('shows the default provider pressed with its masked key, and no key count', async () => {
    renderCard()
    expect(await screen.findByLabelText('Saved Claude key')).toHaveTextContent('sk-ant-…1234')
    expect(toggle('Claude')).toHaveAttribute('aria-pressed', 'true')
    expect(toggle('OpenAI')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/keys? saved/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/We never switch providers automatically/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/AI key checks confirm authentication only/u)).not.toBeInTheDocument()
  })

  it('does not switch the default to a provider with no key until the key is saved', async () => {
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(toggle('OpenAI'))

    expect(toggle('OpenAI')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Claude stays the default until you save an OpenAI key.')).toBeInTheDocument()
    expect(setWorkspaceAiProvider).not.toHaveBeenCalled()

    const input = screen.getByLabelText('OpenAI API key')
    expect(input).toHaveAttribute('type', 'password')
    fireEvent.change(input, { target: { value: ' sk-proj-new-key-9876 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and use OpenAI' }))

    await waitFor(() => expect(setWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'openai', 'sk-proj-new-key-9876'))
    await waitFor(() => expect(setWorkspaceAiProvider).toHaveBeenCalledWith(workspaceId, 'openai'))
    expect(vi.mocked(setWorkspaceAiKey).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(setWorkspaceAiProvider).mock.invocationCallOrder[0])
  })

  it('leaves the default alone when the key for the new provider fails to save', async () => {
    vi.mocked(setWorkspaceAiKey).mockRejectedValue(new Error('That key was rejected.'))
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(toggle('OpenAI'))
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'sk-bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and use OpenAI' }))
    await waitFor(() => expect(setWorkspaceAiKey).toHaveBeenCalled())
    expect(setWorkspaceAiProvider).not.toHaveBeenCalled()
  })

  it('switches the default straight away to a provider that already has a key', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ anthropic: saved, openai: { ...saved, last_four: '5678' }, default_provider: 'anthropic' })
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(toggle('OpenAI'))
    await waitFor(() => expect(setWorkspaceAiProvider).toHaveBeenCalledWith(workspaceId, 'openai'))
    expect(screen.getByLabelText('Saved OpenAI key')).toHaveTextContent('5678')
  })

  it('shows a passing test inline as a Key works badge', async () => {
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText('Key works')).toBeInTheDocument()
  })

  it('shows a failed test inline', async () => {
    vi.mocked(testWorkspaceAiKey).mockResolvedValue('invalid')
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/The provider rejected this key/u)).toBeInTheDocument()
    expect(screen.queryByText('Key works')).not.toBeInTheDocument()
  })

  it('asks before removing a key', async () => {
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    expect(clearWorkspaceAiKey).not.toHaveBeenCalled()
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Remove the Claude key?')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove key' }).at(-1)!)
    await waitFor(() => expect(clearWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'anthropic'))
  })

  it('replaces a saved key without switching provider', async () => {
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    fireEvent.change(screen.getByLabelText('Claude API key'), { target: { value: 'sk-ant-new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(setWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'anthropic', 'sk-ant-new'))
    expect(setWorkspaceAiProvider).not.toHaveBeenCalled()
  })

  it('keeps the shared-key guidance in a closed disclosure', async () => {
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    const details = screen.getByText('Who can use this key?').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent('Everyone in this workspace shares it.')
  })

  it('links to each provider for a key', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ anthropic: none, openai: none, default_provider: null })
    renderCard()
    expect(await screen.findByRole('link', { name: /Get a key/u })).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys')
    fireEvent.click(toggle('OpenAI'))
    expect(screen.getByRole('link', { name: /Get a key/u })).toHaveAttribute('href', 'https://platform.openai.com/api-keys')
  })

  it('starts clean when the workspace changes', async () => {
    const view = renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    fireEvent.change(screen.getByLabelText('Claude API key'), { target: { value: 'half typed' } })
    view.updateWorkspace('22222222-2222-4222-8222-222222222222')
    expect(await screen.findByLabelText('Saved Claude key')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('half typed')).not.toBeInTheDocument()
  })

  it('offers OpenRouter as a third provider, and makes it the default once its key is saved', async () => {
    renderCard()
    await screen.findByLabelText('Saved Claude key')
    fireEvent.click(toggle('OpenRouter'))
    expect(toggle('OpenRouter')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Claude stays the default until you save an OpenRouter key.')).toBeInTheDocument()
    const input = screen.getByLabelText('OpenRouter API key')
    expect(input).toHaveAttribute('placeholder', 'sk-or-…')
    expect(screen.getByRole('link', { name: /Get a key/u })).toHaveAttribute('href', 'https://openrouter.ai/settings/keys')
    fireEvent.change(input, { target: { value: 'sk-or-v1-agency-key-9876' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and use OpenRouter' }))
    await waitFor(() => expect(setWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'openrouter', 'sk-or-v1-agency-key-9876'))
    await waitFor(() => expect(setWorkspaceAiProvider).toHaveBeenCalledWith(workspaceId, 'openrouter'))
  })

  it('treats a lone OpenRouter key as the default', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ anthropic: none, openai: none, openrouter: { ...saved, last_four: '9876' }, default_provider: null })
    renderCard()
    expect(await screen.findByLabelText('Saved OpenRouter key')).toHaveTextContent('sk-or-…9876')
    expect(toggle('OpenRouter')).toHaveAttribute('aria-pressed', 'true')
  })
})
