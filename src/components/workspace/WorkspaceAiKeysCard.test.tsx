import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { WorkspaceAiKeysCard } from './WorkspaceAiKeysCard'
import { clearWorkspaceAiKey, getWorkspaceAiKeys, setWorkspaceAiKey, setWorkspaceAiProvider, type WorkspaceAiKeysView } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceAiKeys: vi.fn(), clearWorkspaceAiKey: vi.fn(), setWorkspaceAiKey: vi.fn(), setWorkspaceAiProvider: vi.fn(), testWorkspaceAiKey: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const workspaceId = '11111111-1111-4111-8111-111111111111'
const keys: WorkspaceAiKeysView = {
  anthropic: { configured: true, last_four: '1234', updated_at: '2026-10-28T12:00:00Z' },
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const renderWith = (id: string) => <QueryClientProvider client={client}><WorkspaceAiKeysCard workspaceId={id} queryScope={['tenant', id]} /></QueryClientProvider>
  const view = render(renderWith(workspaceId))
  return { ...view, updateWorkspace: (id: string) => view.rerender(renderWith(id)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getWorkspaceAiKeys).mockResolvedValue(keys)
  vi.mocked(clearWorkspaceAiKey).mockResolvedValue(undefined)
  vi.mocked(setWorkspaceAiKey).mockResolvedValue(undefined)
  vi.mocked(setWorkspaceAiProvider).mockResolvedValue(undefined)
})

describe('workspace provider key management', () => {
  it('offers Claude and OpenAI while hiding platform provider credentials from an older server', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ ...keys, podscan: keys.anthropic, winnr: keys.anthropic, openai: keys.anthropic, blitz: keys.anthropic } as WorkspaceAiKeysView)
    renderCard()
    expect(await screen.findByText('2 keys saved')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Replace' })).toHaveLength(2)
    expect(screen.getByLabelText('Saved OpenAI key')).toBeInTheDocument()
    expect(screen.queryByText('Additional providers')).not.toBeInTheDocument()
    for (const provider of ['Podscan', 'Blitz', 'Winnr']) {
      expect(screen.queryByText(provider)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(`${provider} API key`)).not.toBeInTheDocument()
    }
  })

  it('saves an OpenAI key without asking for a Claude key', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ anthropic: { configured: false, last_four: null, updated_at: null } })
    renderCard()
    const input = await screen.findByLabelText('OpenAI API key')
    expect(input).toHaveAttribute('type', 'password')
    fireEvent.change(input, { target: { value: ' sk-project-customer-key-1234 ' } })
    expect(setWorkspaceAiKey).not.toHaveBeenCalled()
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
      anthropic: { configured: false, last_four: null, updated_at: null },
      openai: keys.anthropic,
      default_provider: null,
    })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(setWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'openai', 'sk-project-customer-key-1234'))
    expect(await screen.findByLabelText('Saved OpenAI key')).toHaveTextContent('1234')
    expect(screen.getByRole('combobox', { name: 'Default AI provider' })).toHaveValue('openai')
    expect(setWorkspaceAiProvider).not.toHaveBeenCalled()
  })

  it('retains a rejected OpenAI key draft and does not change the default provider', async () => {
    vi.mocked(setWorkspaceAiKey).mockRejectedValue(new Error('This OpenAI key was rejected'))
    renderCard()
    const input = await screen.findByLabelText('OpenAI API key')
    fireEvent.change(input, { target: { value: 'sk-project-rejected-key' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This OpenAI key was rejected'))
    expect(input).toHaveValue('sk-project-rejected-key')
    expect(screen.getByRole('combobox', { name: 'Default AI provider' })).toHaveValue('anthropic')
    expect(setWorkspaceAiProvider).not.toHaveBeenCalled()
  })

  it('selects OpenAI only after the preference is saved and refreshed', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ ...keys, openai: keys.anthropic, default_provider: 'anthropic' })
    let finish!: () => void
    vi.mocked(setWorkspaceAiProvider).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderCard()
    const select = await screen.findByRole('combobox', { name: 'Default AI provider' })
    fireEvent.change(select, { target: { value: 'openai' } })
    await waitFor(() => expect(setWorkspaceAiProvider).toHaveBeenCalledWith(workspaceId, 'openai'))
    expect(select).toBeDisabled()
    expect(select).toHaveValue('anthropic')
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ ...keys, openai: keys.anthropic, default_provider: 'openai' })
    finish()
    await waitFor(() => expect(select).toHaveValue('openai'))
    expect(select).toBeEnabled()
  })

  it('keeps the saved provider selected when changing it fails', async () => {
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({ ...keys, openai: keys.anthropic, default_provider: 'anthropic' })
    vi.mocked(setWorkspaceAiProvider).mockRejectedValue(new Error('Provider setting could not be saved'))
    renderCard()
    const select = await screen.findByRole('combobox', { name: 'Default AI provider' })
    fireEvent.change(select, { target: { value: 'openai' } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Provider setting could not be saved'))
    expect(select).toHaveValue('anthropic')
    expect(select).toBeEnabled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('disables choosing providers without saved credentials', async () => {
    renderCard()
    const select = await screen.findByRole('combobox', { name: 'Default AI provider' })
    expect(within(select).getByRole('option', { name: /OpenAI/ })).toBeDisabled()
    expect(within(select).getByRole('option', { name: 'Anthropic (Claude)' })).toBeEnabled()
  })

  it('explains shared ownership and credential handover without treating saved keys as validated connections', async () => {
    renderCard()
    expect(await screen.findByText('1 key saved')).toBeInTheDocument()
    expect(screen.getByText(/Use company-owned provider accounts/)).toHaveTextContent('Changing the workspace owner does not replace or revoke saved keys')
    expect(screen.getByText(/Keys are encrypted/)).toHaveTextContent('authentication only, not available credits, quota or model access')
    expect(screen.queryByText('1 provider connected')).not.toBeInTheDocument()
  })

  it('explains workspace-wide removal and ongoing external jobs before removing a key', async () => {
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('pause for everyone in this workspace')
    expect(dialog).toHaveTextContent('Jobs or campaigns already running in the provider account may continue')
    expect(dialog).toHaveTextContent('Removing a key here does not revoke it at the provider')
    expect(clearWorkspaceAiKey).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(clearWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'anthropic'))
  })

  it('preserves a key when the owner cancels removal', async () => {
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep the key' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(clearWorkspaceAiKey).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Saved Anthropic (Claude) key')).toBeInTheDocument()
  })

  it('discards an open removal dialog when an admin switches workspaces', async () => {
    const view = renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await screen.findByRole('alertdialog')
    view.updateWorkspace('22222222-2222-4222-8222-222222222222')
    await screen.findByLabelText('Saved Anthropic (Claude) key')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(clearWorkspaceAiKey).not.toHaveBeenCalled()
  })
})
