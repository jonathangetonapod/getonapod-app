import { useEffect, useState } from 'react'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Loader2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import PageSEO from '@/components/seo/PageSEO'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/externalUrl'
import { currentHostname } from '@/lib/workspaceHost'
import '@/styles/agencyLanding.css'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

interface LoginBranding {
  name: string
  logo_url: string | null
}

/**
 * The client portal's door.
 *
 * It wears the same frame as the workspace sign-in, so the two doors read as
 * one product, but it stands alone: no dark panel selling the workspace, and
 * under an agency's link (?b=slug) the agency's own logo and name, never ours.
 * The auth itself is the portal's own session, not Supabase Auth.
 */
export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<'empty' | 'mismatch' | 'offline' | null>(null)
  const [linkBranding, setLinkBranding] = useState<LoginBranding | null>(null)

  const { loginWithPassword, client, branding, loading: portalLoading } = useClientPortal()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const brandingSlug = searchParams.get('b') || ''
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset === true
  const sessionExpired = (location.state as { sessionExpired?: boolean } | null)?.sessionExpired === true
  const forgotHref = brandingSlug ? `/portal/forgot?b=${encodeURIComponent(brandingSlug)}` : '/portal/forgot'

  useEffect(() => {
    if (!brandingSlug || !SLUG_PATTERN.test(brandingSlug) || brandingSlug.length > 180) return
    let cancelled = false
    supabase.functions
      .invoke('public-client-dashboard', { body: { action: 'metadata', slug: brandingSlug.toLowerCase(), hostname: currentHostname() } })
      .then(({ data, error: metadataError }) => {
        if (cancelled || metadataError) return
        const workspace = data?.metadata?.workspace
        if (workspace && typeof workspace.name === 'string' && workspace.name.trim()) {
          setLinkBranding({
            name: workspace.name.trim(),
            logo_url: typeof workspace.logo_url === 'string' ? workspace.logo_url : null,
          })
        }
      })
      .catch(() => {
        // Branding is cosmetic; the neutral login stays fully functional.
      })
    return () => {
      cancelled = true
    }
  }, [brandingSlug])

  useEffect(() => {
    if (!client || portalLoading) return
    const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    const destination = requestedPath?.startsWith('/portal/') && requestedPath !== '/portal/login'
      ? requestedPath
      : '/portal/dashboard'
    navigate(destination, { replace: true })
  }, [client, location.state, navigate, portalLoading])

  if (portalLoading || client) {
    return (
      <div className="gp-page gp-auth-loading" role="status">
        <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading portal</span>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // The button stays pressable; the form says what is missing instead of
    // going grey and leaving someone to guess why.
    if (!email.trim() || !password) {
      setError('empty')
      return
    }
    setError(null)
    setLoading(true)

    try {
      await loginWithPassword(email, password)
      // Context will handle navigation
    } catch (err) {
      console.error('Failed to login:', err)
      // One sentence for every verdict the server reaches, so the form never
      // says whether the address exists. Only a request that never got there
      // says something else, because that is about the connection.
      const message = err instanceof Error ? err.message : ''
      setError(/failed to fetch|networkerror|load failed/iu.test(message) ? 'offline' : 'mismatch')
    } finally {
      setLoading(false)
    }
  }

  const agencyName = linkBranding?.name || branding?.name || null
  const agencyLogoUrl = linkBranding?.logo_url ? safeExternalUrl(linkBranding.logo_url) : null

  return (
    <div className="gp-page gp-auth-split gp-auth-solo">
      <PageSEO
        title="Client portal sign-in"
        description="Sign in to your client portal to review approvals, outreach activity, bookings, and live episodes."
        path="/portal/login"
        noindex
      />

      <div className="gp-auth-col">
        {agencyName ? (
          // An agency's client sees the agency, not us. Nothing here links out
          // to the marketing site.
          <span className="gp-mark">
            {agencyLogoUrl ? (
              <img src={agencyLogoUrl} alt="" className="gp-auth-logo" />
            ) : (
              <span className="gp-mark-dot" aria-hidden="true"><i /></span>
            )}
            {agencyName}
          </span>
        ) : (
          <Link className="gp-mark" to="/">
            <span className="gp-mark-dot" aria-hidden="true"><i /></span>
            Get On A Pod
          </Link>
        )}

        <main className="gp-auth-main">
          <h1>Sign in to your portal.</h1>
          <p className="gp-auth-standfirst">
            {agencyName
              ? `The ${agencyName} client portal: approvals, bookings and live episodes in one place.`
              : 'Approvals, bookings and live episodes, in one place.'}
          </p>

          <form className="gp-form" onSubmit={handleSubmit} noValidate>
            {passwordReset && (
              <p className="gp-auth-status" role="status">
                Password updated. Sign in with your new password.
              </p>
            )}
            {sessionExpired && !passwordReset && (
              <p className="gp-auth-status" role="status">
                Your session ended. Sign in again to continue.
              </p>
            )}

            <div className="gp-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={loading}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                autoFocus
              />
            </div>

            <div className="gp-field">
              <div className="gp-field-head">
                <label htmlFor="password">Password</label>
                <Link to={forgotHref} className="gp-auth-link">Forgot password?</Link>
              </div>
              <div className="gp-field-with-toggle">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  disabled={loading}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                />
                <button
                  type="button"
                  className="gp-reveal"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button type="submit" className="gp-btn gp-btn-primary gp-btn-block" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            {error && (
              <p className="gp-form-error" role="alert">
                {error === 'empty' && 'Enter your email and password.'}
                {error === 'offline' && 'Could not reach the server. Try again.'}
                {error === 'mismatch' && (
                  <>That email and password do not match. Try again, or <Link to={forgotHref}>reset your password</Link>.</>
                )}
              </p>
            )}
          </form>

          <p className="gp-auth-foot">
            {agencyName
              ? <>Need help? Contact your {agencyName} team.</>
              : <>Need help? <a href="mailto:jonathan@getonapod.com">jonathan@getonapod.com</a></>}
          </p>
        </main>

        <p className="gp-auth-copyright">© {new Date().getFullYear()} {agencyName || 'Get On A Pod'}</p>
      </div>
    </div>
  )
}
