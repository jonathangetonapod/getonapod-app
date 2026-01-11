import { createContext, useContext, useEffect, useState } from 'react'
import type { Client } from '@/services/clients'
import {
  type ClientPortalSession,
  requestMagicLink as apiRequestMagicLink,
  verifyToken as apiVerifyToken,
  validateSession as apiValidateSession,
  loginWithPassword as apiLoginWithPassword,
  logout as apiLogout,
  sessionStorage
} from '@/services/clientPortal'
import { setUser as setSentryUser } from '@/lib/sentry'

interface ClientPortalContextType {
  client: Client | null
  session: ClientPortalSession | null
  loading: boolean
  isImpersonating: boolean
  requestMagicLink: (email: string) => Promise<void>
  loginWithToken: (token: string) => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<void>
  impersonateClient: (client: Client) => void
  exitImpersonation: () => void
  logout: () => Promise<void>
}

const ClientPortalContext = createContext<ClientPortalContextType | undefined>(undefined)

export const ClientPortalProvider = ({ children }: { children: React.ReactNode }) => {
  const [client, setClient] = useState<Client | null>(null)
  const [session, setSession] = useState<ClientPortalSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)

  useEffect(() => {
    // Restore session from localStorage on mount
    const restoreSession = async () => {
      // Check for impersonation mode
      const impersonatingData = localStorage.getItem('admin-impersonating-client')
      if (impersonatingData) {
        try {
          const impersonatedClient = JSON.parse(impersonatingData)
          setClient(impersonatedClient)
          setIsImpersonating(true)
          setLoading(false)
          return
        } catch (error) {
          console.error('[ClientPortal] Failed to restore impersonation:', error)
          localStorage.removeItem('admin-impersonating-client')
        }
      }

      const { session: storedSession, client: storedClient } = sessionStorage.get()

      if (!storedSession || !storedClient) {
        setLoading(false)
        return
      }

      // Check if session is expired
      if (sessionStorage.isExpired(storedSession)) {
        console.log('[ClientPortal] Session expired, clearing storage')
        sessionStorage.clear()
        setLoading(false)
        return
      }

      try {
        // Validate session with backend
        const validatedClient = await apiValidateSession(storedSession.session_token)
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
        sessionStorage.clear()
      } finally {
        setLoading(false)
      }
    }

    restoreSession()
  }, [])

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

  const requestMagicLink = async (email: string) => {
    await apiRequestMagicLink(email)
  }

  const loginWithToken = async (token: string) => {
    // Clear any existing session first to avoid race conditions
    sessionStorage.clear()
    setSession(null)
    setClient(null)

    setLoading(true)
    try {
      const { session: newSession, client: newClient } = await apiVerifyToken(token)

      // Store in localStorage
      sessionStorage.save(newSession, newClient)

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
      console.error('[ClientPortal] Login failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const loginWithPassword = async (email: string, password: string) => {
    // Clear any existing session first to avoid race conditions
    sessionStorage.clear()
    setSession(null)
    setClient(null)

    setLoading(true)
    try {
      const { session: newSession, client: newClient } = await apiLoginWithPassword(email, password)

      console.log('[ClientPortal] Login successful, storing session:', {
        sessionToken: newSession.session_token.substring(0, 20) + '...',
        tokenLength: newSession.session_token.length,
        clientId: newSession.client_id,
        expiresAt: newSession.expires_at
      })

      // Store in localStorage
      sessionStorage.save(newSession, newClient)

      // Verify it was saved correctly
      const { session: savedSession } = sessionStorage.get()
      console.log('[ClientPortal] Session saved to localStorage:', {
        saved: !!savedSession,
        tokenMatch: savedSession?.session_token === newSession.session_token,
        savedToken: savedSession?.session_token.substring(0, 20) + '...'
      })

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
      setLoading(false)
    }
  }

  const logout = async () => {
    if (session) {
      try {
        await apiLogout(session.session_token)
      } catch (error) {
        console.error('[ClientPortal] Logout error:', error)
        // Continue with logout even if API call fails
      }
    }

    // Clear state and storage
    sessionStorage.clear()
    setSession(null)
    setClient(null)

    // Clear user from Sentry
    setSentryUser(null)
  }

  const impersonateClient = (clientToImpersonate: Client) => {
    // Store impersonation data in localStorage
    localStorage.setItem('admin-impersonating-client', JSON.stringify(clientToImpersonate))

    // Set state
    setClient(clientToImpersonate)
    setIsImpersonating(true)
    setSession(null) // No real session when impersonating
  }

  const exitImpersonation = () => {
    // Clear impersonation data
    localStorage.removeItem('admin-impersonating-client')

    // Clear state
    setClient(null)
    setIsImpersonating(false)
    setSession(null)
  }

  return (
    <ClientPortalContext.Provider
      value={{
        client,
        session,
        loading,
        isImpersonating,
        requestMagicLink,
        loginWithToken,
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
