import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { Client } from '@/services/clients'
import { useClientPortal } from '@/contexts/ClientPortalContext'

// Owner-side portal preview entry. The workspace app opens this route in a
// new tab with a freshly minted (server-side, audited, 1-hour) portal session
// in the URL hash. The hash never reaches the server; it is consumed and
// scrubbed before entering the portal shell.
const PreviewHandoff = () => {
  const navigate = useNavigate()
  const { adoptSession } = useClientPortal()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    try {
      const params = new URLSearchParams(window.location.hash.replace(/^#/u, ''))
      const sessionToken = params.get('session') || ''
      const expiresAt = params.get('expires') || ''
      const clientRaw = params.get('client') || ''
      // Symmetric UTF-8-safe decode of the base64 payload (see the encoder in
      // WorkspaceClientDetail); plain atob+JSON.parse mangled non-Latin1 names.
      const client = JSON.parse(
        new TextDecoder().decode(Uint8Array.from(atob(clientRaw), (character) => character.charCodeAt(0))),
      ) as { id?: string; name?: string }
      if (!sessionToken || !expiresAt || !client?.id || !client?.name) {
        setFailed(true)
        return
      }
      window.history.replaceState(null, '', '/portal/preview')
      // Through the provider, so the portal shell already holds the session
      // when the dashboard mounts; writing storage directly raced the
      // provider's own restore and landed on the login form.
      void adoptSession(
        { session_token: sessionToken, expires_at: expiresAt, client_id: client.id },
        { id: client.id, name: client.name } as Client,
      ).then(() => {
        if (!cancelled) navigate('/portal/dashboard', { replace: true })
      })
    } catch {
      setFailed(true)
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 text-sm text-muted-foreground">
      {failed
        ? 'This preview link is invalid or expired. Start a new preview from the client page.'
        : <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Opening the client portal…</span>}
    </div>
  )
}

export default PreviewHandoff
