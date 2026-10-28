import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceAiKeysCard } from './WorkspaceAiKeysCard'
import { clearWorkspaceAiKey, getWorkspaceAiKeys, type WorkspaceAiKeysView } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceAiKeys: vi.fn(), clearWorkspaceAiKey: vi.fn(), setWorkspaceAiKey: vi.fn(), testWorkspaceAiKey: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const workspaceId = '11111111-1111-4111-8111-111111111111'
const notSaved = { configured: false, last_four: null, updated_at: null }
const keys: WorkspaceAiKeysView = {
  anthropic: { configured: true, last_four: '1234', updated_at: '2026-10-28T12:00:00Z' },
  openai: notSaved, winnr: notSaved, blitz: notSaved, podscan: notSaved,
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
})

describe('workspace provider key management', () => {
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
