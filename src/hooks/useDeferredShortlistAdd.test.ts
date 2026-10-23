import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useDeferredShortlistAdd } from '@/hooks/useDeferredShortlistAdd'
import { addClientShortlistPodcasts } from '@/services/clientShortlist'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), info: vi.fn(), success: vi.fn() }) }))

const mockedAdd = vi.mocked(addClientShortlistPodcasts)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const client = { id: '22222222-2222-4222-8222-222222222222', name: 'Dallas Fontaine' }
const show = { podcast_id: 'p1', podcast_name: 'Show', podcast_categories: [] } as unknown as WorkspacePodcastCatalogItem

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useDeferredShortlistAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockedAdd.mockResolvedValue({ added: 1, skipped: 0, podcast_ids: ['p1'] })
  })
  afterEach(() => {
    setVisibility('visible')
    vi.useRealTimers()
  })

  // Walking away from the tab must not drop an add that is waiting out its Undo.
  it('sends a waiting add at once when the tab is hidden', async () => {
    const onCommitted = vi.fn()
    const { result } = renderHook(() => useDeferredShortlistAdd({ workspaceId, onCommitted }))

    act(() => result.current.add(client, [show]))
    expect(result.current.isAdded(client.id, 'p1')).toBe(true)
    expect(mockedAdd).not.toHaveBeenCalled()

    setVisibility('hidden')
    await waitFor(() => expect(onCommitted).toHaveBeenCalledWith(client.id))
    expect(mockedAdd).toHaveBeenCalledTimes(1)
    // Its timer is spent; nothing is sent twice.
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(mockedAdd).toHaveBeenCalledTimes(1)
  })

  it('sends a waiting add when the page is left', async () => {
    const { result, unmount } = renderHook(() => useDeferredShortlistAdd({ workspaceId, onCommitted: vi.fn() }))
    act(() => result.current.add(client, [show]))
    unmount()
    await waitFor(() => expect(mockedAdd).toHaveBeenCalledTimes(1))
  })

  it('puts the button back and says so when the add fails', async () => {
    mockedAdd.mockRejectedValue(new Error('The client podcast list could not be updated.'))
    const { result } = renderHook(() => useDeferredShortlistAdd({ workspaceId, onCommitted: vi.fn() }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    act(() => result.current.add(client, [show]))
    await act(async () => { vi.advanceTimersByTime(8000) })
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('The client podcast list could not be updated.'))
    expect(result.current.isAdded(client.id, 'p1')).toBe(false)
  })

  it('does not queue a show the client already has', () => {
    const { result } = renderHook(() => useDeferredShortlistAdd({ workspaceId, onCommitted: vi.fn() }))
    act(() => result.current.add(client, [show], [show]))
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith('Already on Dallas Fontaine’s shortlist.')
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled()
  })
})
