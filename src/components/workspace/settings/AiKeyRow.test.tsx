import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiKeyRow, type AiKeyProviderInfo } from './AiKeyRow'
import { testWorkspaceAiKey, type WorkspaceAiKeyStatus, type WorkspaceAiKeyTestResult } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ testWorkspaceAiKey: vi.fn() }))

const provider: AiKeyProviderInfo = { id: 'anthropic', label: 'Anthropic (Claude)', keyPrefix: 'sk-ant-', usedFor: 'Research and pitch writing.', consoleUrl: '' }
const saved: WorkspaceAiKeyStatus = { configured: true, last_four: '1234', updated_at: '2026-10-28T12:00:00Z' }
const baseProps = { workspaceId: 'workspace-a', provider, status: saved, busy: false, saving: false, onSave: vi.fn<(_: string) => Promise<void>>(), onRemove: vi.fn() }

function renderRow() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const renderWith = (props = baseProps) => <QueryClientProvider client={client}><AiKeyRow {...props} /></QueryClientProvider>
  const view = render(renderWith())
  return { ...view, update: (props: Partial<typeof baseProps>) => view.rerender(renderWith({ ...baseProps, ...props })) }
}

beforeEach(() => {
  vi.clearAllMocks()
  baseProps.onSave.mockResolvedValue(undefined)
  vi.mocked(testWorkspaceAiKey).mockResolvedValue('valid')
})

describe('provider credential lifecycle', () => {
  it('describes a stored key without implying current authentication or available quota', () => {
    renderRow()
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.queryByText('Authentication accepted')).not.toBeInTheDocument()
  })

  it('marks a rejected key as rejected instead of showing a successful connection', async () => {
    vi.mocked(testWorkspaceAiKey).mockResolvedValue('invalid')
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    expect(await screen.findByText('Key rejected')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('The provider rejected this key')
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.queryByText('Authentication accepted')).not.toBeInTheDocument()
  })

  it('limits a successful test to authentication, without promising credits or model access', async () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    expect(await screen.findByText('Authentication accepted')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('authentication only, not available credits, quota or model access')
  })

  it('does not retain a successful badge when a later test cannot reach the provider', async () => {
    vi.mocked(testWorkspaceAiKey).mockResolvedValueOnce('valid').mockResolvedValueOnce('unreachable')
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    await screen.findByText('Authentication accepted')
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    expect(await screen.findByText(/The provider did not answer/)).toBeInTheDocument()
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.queryByText('Authentication accepted')).not.toBeInTheDocument()
    expect(screen.queryByText('Key rejected')).not.toBeInTheDocument()
  })

  it('prevents replacing or removing a key while its authentication check is running', async () => {
    let finish!: (result: WorkspaceAiKeyTestResult) => void
    vi.mocked(testWorkspaceAiKey).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    await screen.findByText('Checking authentication…')
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
    const remove = screen.getByRole('button', { name: 'Remove' })
    expect(remove).toBeDisabled()
    fireEvent.click(remove)
    expect(baseProps.onRemove).not.toHaveBeenCalled()
    await act(async () => { finish('valid') })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled())
  })

  it('discards a test result if a refreshed credential replaces the key while the test is in flight', async () => {
    let finish!: (result: WorkspaceAiKeyTestResult) => void
    vi.mocked(testWorkspaceAiKey).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const view = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    await screen.findByText('Checking authentication…')
    view.update({ status: { ...saved, last_four: '5678', updated_at: '2026-10-28T12:05:00Z' } })
    expect(screen.getByLabelText('Saved Anthropic (Claude) key')).toHaveTextContent('5678')
    await act(async () => { finish('invalid') })
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.queryByText('Key rejected')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears a replacement draft when the displayed workspace changes', () => {
    const view = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    fireEvent.change(screen.getByLabelText('Anthropic (Claude) API key'), { target: { value: 'workspace-a-secret' } })
    expect(screen.getByText(/replaces the key for everyone in this workspace/)).toHaveTextContent('Jobs or campaigns already running in the provider account may continue')
    view.update({ workspaceId: 'workspace-b' })
    expect(screen.queryByDisplayValue('workspace-a-secret')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Saved Anthropic (Claude) key')).toBeInTheDocument()
    expect(baseProps.onSave).not.toHaveBeenCalled()
  })

  it('resets a rejected-key result after an explicit replacement is saved', async () => {
    vi.mocked(testWorkspaceAiKey).mockResolvedValue('invalid')
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }))
    await screen.findByText('Key rejected')
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    fireEvent.change(screen.getByLabelText('Anthropic (Claude) API key'), { target: { value: ' replacement-key ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))
    await waitFor(() => expect(baseProps.onSave).toHaveBeenCalledWith('replacement-key'))
    expect(await screen.findByText('Key saved')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
