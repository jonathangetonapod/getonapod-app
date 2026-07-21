export interface StoredPortalSession {
  session_token: string
  expires_at: string
  client_id: string
}

export interface StoredPortalClient {
  id: string
  name: string
}

interface StorageWindow {
  localStorage: Storage
  sessionStorage: Storage
}

const SESSION_KEYS = ['client_portal_session', 'client_portal_client'] as const
const CLEAR_KEYS = [...SESSION_KEYS, 'podcast-cart'] as const

export function createPortalSessionStore<
  TSession extends StoredPortalSession,
  TClient extends StoredPortalClient,
>(getStorageWindow: () => StorageWindow = () => window) {
  let memorySession: TSession | null = null
  let memoryClient: TClient | null = null

  const memoryValue = () => ({ session: memorySession, client: memoryClient })

  const removeKeys = (storageName: 'localStorage' | 'sessionStorage', keys: readonly string[]) => {
    try {
      const storage = getStorageWindow()[storageName]
      for (const key of keys) storage.removeItem(key)
    } catch {
      // Browser storage is optional; the in-memory session remains authoritative.
    }
  }

  const clearPersistedSession = () => removeKeys('sessionStorage', SESSION_KEYS)
  const clearLegacySession = () => removeKeys('localStorage', SESSION_KEYS)

  return {
    save(session: TSession, client: TClient): void {
      if (session.client_id !== client.id) {
        throw new Error('Portal session does not match the client')
      }

      memorySession = session
      memoryClient = client
      clearLegacySession()

      try {
        const storage = getStorageWindow().sessionStorage
        storage.setItem('client_portal_session', JSON.stringify(session))
        storage.setItem('client_portal_client', JSON.stringify(client))
      } catch {
        // Remove a partial pair without discarding the valid in-memory session.
        clearPersistedSession()
      }
    },

    get(): { session: TSession | null; client: TClient | null } {
      clearLegacySession()

      let sessionValue: string | null
      let clientValue: string | null
      try {
        const storage = getStorageWindow().sessionStorage
        sessionValue = storage.getItem('client_portal_session')
        clientValue = storage.getItem('client_portal_client')
      } catch {
        return memoryValue()
      }

      if (!sessionValue && !clientValue) return memoryValue()
      if (!sessionValue || !clientValue) {
        clearPersistedSession()
        return memoryValue()
      }

      try {
        const session = JSON.parse(sessionValue) as Partial<TSession>
        const client = JSON.parse(clientValue) as Partial<TClient>
        if (
          typeof session.session_token !== 'string'
          || typeof session.expires_at !== 'string'
          || typeof session.client_id !== 'string'
          || typeof client.id !== 'string'
          || typeof client.name !== 'string'
          || client.id !== session.client_id
        ) {
          throw new Error('Stored portal session is malformed')
        }

        memorySession = session as TSession
        memoryClient = client as TClient
        return memoryValue()
      } catch {
        clearPersistedSession()
        return memoryValue()
      }
    },

    clear(): void {
      memorySession = null
      memoryClient = null
      removeKeys('sessionStorage', CLEAR_KEYS)
      removeKeys('localStorage', CLEAR_KEYS)
    },
  }
}
