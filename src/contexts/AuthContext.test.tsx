import { act, renderHook, waitFor } from '@testing-library/react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(), refreshSession: vi.fn(), onAuthStateChange: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}))
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))

const invoke = vi.mocked(supabase.functions.invoke)
const refresh = vi.mocked(supabase.auth.refreshSession)
let currentSession: Session | null
let authEvent: (event: AuthChangeEvent, session: Session | null) => void
const session = (token: string, id = 'user-one') => ({
  access_token: token,
  user: { id, email: 'member@example.com' },
}) as Session
const active = {
  data: { state: 'active', platform_admin: false, membership: { id: 'member-one', role: 'owner' }, workspace: { id: 'workspace-one' } },
  error: null,
}
const refusal = (status = 401) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(JSON.stringify({
      code: status === 401 ? 'INVALID_AUTH' : 'CONTEXT_UNAVAILABLE',
      error: status === 401 ? 'Authentication is invalid or expired' : 'Account service unavailable',
    }), { status }),
  }),
})

function emit(nextSession: Session | null, event: AuthChangeEvent = 'TOKEN_REFRESHED') {
  currentSession = nextSession
  authEvent(event, nextSession)
}

describe('AuthProvider session recovery', () => {
  beforeEach(() => {
    currentSession = session('old-token')
    invoke.mockReset().mockResolvedValue(active)
    refresh.mockReset().mockImplementation(async () => {
      const next = session('new-token')
      emit(next)
      return { data: { session: next, user: next.user }, error: null }
    })
    vi.mocked(supabase.auth.getSession).mockImplementation(async () => ({ data: { session: currentSession }, error: null }))
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authEvent = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } } as never
    })
  })
  afterEach(() => vi.useRealTimers())

  it('renews a rejected token once and checks access using the fresh token', async () => {
    invoke.mockResolvedValueOnce(refusal())
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('active'))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, 'account-context', { headers: { Authorization: 'Bearer old-token' } })
    expect(invoke).toHaveBeenNthCalledWith(2, 'account-context', { headers: { Authorization: 'Bearer new-token' } })
    expect(result.current.session?.access_token).toBe('new-token')
  })

  it('requires sign-in after a rejected retry without looping on token events', async () => {
    invoke.mockImplementation(async () => refusal())
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('session_expired'))
    expect(result.current.accountError).toContain('Sign in again with the same account')
    expect(result.current.workspace).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('requires sign-in when a refresh token is no longer valid', async () => {
    invoke.mockResolvedValueOnce(refusal())
    refresh.mockResolvedValue({
      data: { session: null, user: null },
      error: Object.assign(new Error('Invalid Refresh Token'), { status: 400 }),
    } as never)
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('session_expired'))
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('honors the SDK sign-out event when revoked sessions are removed', async () => {
    invoke.mockResolvedValueOnce(refusal())
    refresh.mockImplementation(async () => {
      emit(null, 'SIGNED_OUT')
      return { data: { session: null, user: null }, error: null }
    })
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('signed_out'))
    expect(result.current.user).toBeNull()
    expect(result.current.workspace).toBeNull()
  })

  it('does not renew credentials for server errors', async () => {
    invoke.mockResolvedValueOnce(refusal(503))
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('error'))
    expect(result.current.accountError).toBe('Account service unavailable')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps a transient background failure from interrupting an active workspace', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('active'))
    invoke.mockResolvedValueOnce(refusal(503))
    await act(async () => { await result.current.refreshAccount({ quiet: true }) })
    expect(result.current.accountState).toBe('active')
    expect(result.current.workspace?.id).toBe('workspace-one')
  })

  it('does not preserve active access when background recovery rejects authentication', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.accountState).toBe('active'))
    invoke.mockImplementation(async () => refusal())
    await act(async () => { await result.current.refreshAccount({ quiet: true }) })
    expect(result.current.accountState).toBe('session_expired')
    expect(result.current.workspace).toBeNull()
  })

  it('ignores recovery results after the user signs out', async () => {
    invoke.mockResolvedValueOnce(refusal())
    let finishRefresh!: (value: Awaited<ReturnType<typeof supabase.auth.refreshSession>>) => void
    refresh.mockImplementation(() => new Promise((resolve) => { finishRefresh = resolve }))
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await act(async () => {
      emit(null, 'SIGNED_OUT')
      const next = session('new-token')
      finishRefresh({ data: { session: next, user: next.user }, error: null })
    })
    expect(result.current.accountState).toBe('signed_out')
    expect(result.current.user).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('bounds the wait when session renewal stalls', async () => {
    vi.useFakeTimers()
    invoke.mockResolvedValueOnce(refusal())
    refresh.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(refresh).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(result.current.accountState).toBe('error')
    expect(result.current.accountError).toContain('timed out')
  })
})
