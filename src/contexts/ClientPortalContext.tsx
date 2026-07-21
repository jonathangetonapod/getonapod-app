import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Client } from '@/services/clients'
import {
  type ClientPortalSession,
  validateSession as apiValidateSession,
  loginWithPassword as apiLoginWithPassword,
  logout as apiLogout,
  sessionStorage as portalSessionStorage
} from '@/services/clientPortal'
import { setUser as setSentryUser } from '@/lib/sentry'
import { useAuth } from '@/contexts/AuthContext'
import { queryClient } from '@/lib/queryClient'

interface ClientPortalContextType {
  client: Client | null
  session: ClientPortalSession | null
  loading: boolean
  isImpersonating: boolean
  loginWithPassword: (email: string, password: string) => Promise<void>
  impersonateClient: (client: Client) => void
  exitImpersonation: () => void
  logout: () => Promise<void>
}

const ClientPortalContext = createContext<ClientPortalContextType | undefined>(undefined)

export const ClientPortalProvider = ({ children }: { children: React.ReactNode }) => {
  const { isPlatformAdmin, loading: authLoading } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [session, setSession] = useState<ClientPortalSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const requestGeneration = useRef(0)

  useEffect(() => {
    if (authLoading) {
      setLoading(true)
      return
    }

    const requestId = ++requestGeneration.current
    // Restore session from localStorage on mount
    const restoreSession = async () => {
      setLoading(true)

      // Impersonation is tab-scoped and only restorable while the current
      // Supabase account is still a live platform administrator.
      localStorage.removeItem('admin-impersonating-client')
      const impersonatingData = window.sessionStorage.getItem('admin-impersonating-client')
      if (impersonatingData && isPlatformAdmin) {
        try {
          const impersonatedClient = JSON.parse(impersonatingData)
          if (typeof impersonatedClient?.id !== 'string' || typeof impersonatedClient?.name !== 'string') {
            throw new Error('Stored impersonation is malformed')
          }
          if (requestId !== requestGeneration.current) return
          setClient(impersonatedClient)
          setIsImpersonating(true)
          setLoading(false)
          return
        } catch (error) {
          console.error('[ClientPortal] Failed to restore impersonation:', error)
          window.sessionStorage.removeItem('admin-impersonating-client')
        }
      } else {
        window.sessionStorage.removeItem('admin-impersonating-client')
        setIsImpersonating(false)
      }

      const { session: storedSession, client: storedClient } = portalSessionStorage.get()

      if (!storedSession || !storedClient) {
        if (requestId !== requestGeneration.current) return
        setSentryUser(null)
        setClient(null)
        setSession(null)
        setLoading(false)
        return
      }

      // Check if session is expired
      if (portalSessionStorage.isExpired(storedSession)) {
        console.log('[ClientPortal] Session expired, clearing storage')
        portalSessionStorage.clear()
        if (requestId !== requestGeneration.current) return
        setSentryUser(null)
        setClient(null)
        setSession(null)
        setLoading(false)
        return
      }

      try {
        // Validate session with backend
        const validatedClient = await apiValidateSession(storedSession.session_token)
        if (requestId !== requestGeneration.current) return
        setSession(storedSession)
        setClient(validatedClient)

        // Set user in Sentry
        setSentryUser({
          id: validatedClient.id,
          email: validatedClient.email || undefined,
          name: validatedClient.name
        })
      } catch (error) {
        console.error('[ClientPortal] Session validation failed:', error)
        portalSessionStorage.clear()
        if (requestId !== requestGeneration.current) return
        setSentryUser(null)
        setClient(null)
        setSession(null)
      } finally {
        if (requestId === requestGeneration.current) setLoading(false)
      }
    }

    void restoreSession()
    return () => {
      if (requestGeneration.current === requestId) requestGeneration.current += 1
    }
  }, [authLoading, isPlatformAdmin])

  // Auto-refresh session before expiry (23 hours)
  useEffect(() => {
    if (!session) return

    const expiresAt = new Date(session.expires_at)
    const now = new Date()
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()

    // If less than 1 hour until expiry, show warning
    if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
      console.warn('[ClientPortal] Session expiring soon')
      // Could show toast notification here
    }

    // Set timeout to clear session when it expires
    const timeoutId = setTimeout(() => {
      console.log('[ClientPortal] Session expired, logging out')
      logout()
    }, timeUntilExpiry)

    return () => clearTimeout(timeoutId)
  }, [session])

  const loginWithPassword = async (email: string, password: string) => {
    const requestId = ++requestGeneration.current
    // Clear any existing session first to avoid race conditions
    portalSessionStorage.clear()
    window.sessionStorage.removeItem('admin-impersonating-client')
    queryClient.clear()
    setSentryUser(null)
    setSession(null)
    setClient(null)
    setIsImpersonating(false)

    setLoading(true)
    try {
      const { session: newSession, client: newClient } = await apiLoginWithPassword(email, password)
      if (requestId !== requestGeneration.current) return

      // Store in localStorage
      portalSessionStorage.save(newSession, newClient)

      // Update state
      setSession(newSession)
      setClient(newClient)

      // Set user in Sentry
      setSentryUser({
        id: newClient.id,
        email: newClient.email || undefined,
        name: newClient.name
      })
    } catch (error) {
      console.error('[ClientPortal] Password login failed:', error)
      throw error
    } finally {
      if (requestId === requestGeneration.current) setLoading(false)
    }
  }

  const logout = async () => {
    requestGeneration.current += 1
    if (session) {
      try {
        await apiLogout(session.session_token)
      } catch (error) {
        console.error('[ClientPortal] Logout error:', error)
        // Continue with logout even if API call fails
      }
    }

    // Clear state and storage
    portalSessionStorage.clear()
    window.sessionStorage.removeItem('admin-impersonating-client')
    queryClient.clear()
    setSession(null)
    setClient(null)
    setIsImpersonating(false)

    // Clear user from Sentry
    setSentryUser(null)
  }

  const impersonateClient = (clientToImpersonate: Client) => {
    if (!isPlatformAdmin) throw new Error('Platform administrator access is required')
    requestGeneration.current += 1

    // Never combine an old client bearer session with a different impersonated
    // client. Best-effort invalidate it server-side, then clear all local state.
    if (session) void apiLogout(session.session_token).catch(() => undefined)
    portalSessionStorage.clear()
    queryClient.clear()
    const safeClient = {
      id: clientToImpersonate.id,
      name: clientToImpersonate.name,
      email: clientToImpersonate.email,
      photo_url: clientToImpersonate.photo_url,
    } as Client
    window.sessionStorage.setItem('admin-impersonating-client', JSON.stringify(safeClient))

    // Set state
    setClient(safeClient)
    setIsImpersonating(true)
    setSession(null) // No real session when impersonating
    setSentryUser(null)
  }

  const exitImpersonation = () => {
    requestGeneration.current += 1
    // Clear impersonation data
    window.sessionStorage.removeItem('admin-impersonating-client')
    queryClient.clear()

    // Clear state
    setClient(null)
    setIsImpersonating(false)
    setSession(null)
    setSentryUser(null)
  }

  return (
    <ClientPortalContext.Provider
      value={{
        client,
        session,
        loading,
        isImpersonating,
        loginWithPassword,
        impersonateClient,
        exitImpersonation,
        logout
      }}
    >
      {children}
    </ClientPortalContext.Provider>
  )
}

export const useClientPortal = () => {
  const context = useContext(ClientPortalContext)
  if (context === undefined) {
    throw new Error('useClientPortal must be used within a ClientPortalProvider')
  }
  return context
}
