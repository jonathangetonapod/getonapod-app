import { useEffect, useState } from 'react'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Loader2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import PageSEO from '@/components/seo/PageSEO'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/externalUrl'
import { currentHostname } from '@/lib/workspaceHost'
import { isPortalBrandSlug, readPortalBrand, rememberPortalBrand } from '@/components/portal/portalBrandMemory'
import '@/styles/agencyLanding.css'

type LoginError = 'empty' | 'mismatch' | 'limited' | 'unavailable' | 'offline'

// supabase-js answers "Failed to send a request to the Edge Function" when the
// request never reached the server; the browser's own fetch failures read
// "Failed to fetch" (Chromium), "NetworkError ..." (Firefox) or "Load failed"
// (Safari). toFunctionError keeps that message and leaves status unset.
const OFFLINE_MESSAGE = /failed to send a request|failed to fetch|networkerror|load failed/iu

/**
 * Which sentence a failed sign-in gets. Every verdict about the credentials
 * reads the same, so the form never says whether an address exists. The
 * attempt limit is counted before any account lookup, for addresses with and
 * without an account alike, so saying it was hit gives nothing away either.
 */
const loginErrorFor = (err: unknown): LoginError => {
  const { code, status, message } = (err ?? {}) as { code?: unknown; status?: unknown; message?: unknown }
  if (code === 'LOGIN_RATE_LIMITED' || status === 429) return 'limited'
  if (code === 'LOGIN_UNAVAILABLE' || (typeof status === 'number' && status >= 500)) return 'unavailable'
  if (status === undefined && typeof message === 'string' && OFFLINE_MESSAGE.test(message)) return 'offline'
  return 'mismatch'
}

interface LoginBranding {
  name: string
  logo_url: string | null
  primary_color: string | null
}

/**
 * The client portal's door.
 *
 * It wears the same frame as the workspace sign-in, so the two doors read as
 * one product, but it stands alone: no dark panel selling the workspace, and
 * under an agency's link (?b=slug) the agency's own logo and name, never ours.
 * Without a known agency it stays neutral: a client of an agency must never
 * land on a door that names the platform behind it. The agency is remembered
 * for the tab (portalBrandMemory), so the sign-in after a session ends keeps
 * the same brand. The auth itself is the portal's own session, not Supabase Auth.
 */
export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  const [rememberedBrand] = useState(() => readPortalBrand())
  const [linkBranding, setLinkBranding] = useState<LoginBranding | null>(null)

  const { loginWithPassword, client, branding, loading: portalLoading } = useClientPortal()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const requestedSlug = searchParams.get('b') || ''
  const brandingSlug = isPortalBrandSlug(requestedSlug) ? requestedSlug : rememberedBrand?.slug || ''
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset === true
  const sessionExpired = (location.state as { sessionExpired?: boolean } | null)?.sessionExpired === true
  const forgotHref = brandingSlug ? `/portal/forgot?b=${encodeURIComponent(brandingSlug)}` : '/portal/forgot'

  useEffect(() => {
    if (!isPortalBrandSlug(brandingSlug)) return
    let cancelled = false
    supabase.functions
      .invoke('public-client-dashboard', { body: { action: 'metadata', slug: brandingSlug.toLowerCase(), hostname: currentHostname() } })
      .then(({ data, error: metadataError }) => {
        if (cancelled || metadataError) return
        const workspace = data?.metadata?.workspace
        if (workspace && typeof workspace.name === 'string' && workspace.name.trim()) {
          const resolved: LoginBranding = {
            name: workspace.name.trim(),
            logo_url: typeof workspace.logo_url === 'string' ? workspace.logo_url : null,
            primary_color: typeof workspace.primary_color === 'string' && /^#[0-9a-f]{6}$/iu.test(workspace.primary_color)
              ? workspace.primary_color
              : null,
          }
          setLinkBranding(resolved)
          rememberPortalBrand({ slug: brandingSlug, ...resolved })
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
      setError(loginErrorFor(err))
    } finally {
      setLoading(false)
    }
  }

  // The slug's own lookup wins; until it answers (or when it cannot), the
  // brand remembered for this tab keeps the door wearing the same agency.
  const remembered = rememberedBrand && (!rememberedBrand.slug || rememberedBrand.slug === brandingSlug.toLowerCase() || !brandingSlug)
    ? rememberedBrand
    : null
  const agencyName = linkBranding?.name || branding?.name || remembered?.name || null
  const agencyLogoSource = linkBranding?.logo_url || (!linkBranding ? remembered?.logo_url : null) || null
  const agencyLogoUrl = agencyLogoSource ? safeExternalUrl(agencyLogoSource) : null
  const agencyColor = linkBranding?.primary_color || remembered?.primary_color || undefined
  const emailInvalid = error === 'mismatch' || (error === 'empty' && !email.trim())
  const passwordInvalid = error === 'mismatch' || (error === 'empty' && !password)
  const errorId = 'portal-login-error'

  return (
    <div className="gp-page gp-auth-split gp-auth-solo">
      <PageSEO
        title="Client portal sign-in"
        description="Sign in to your client portal to review approvals, outreach activity, bookings, and live episodes."
        path="/portal/login"
        noindex
        whiteLabel
        brandName={agencyName || 'Client portal'}
        favicon={agencyLogoUrl}
        themeColor={agencyColor}
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
          // No known agency: a neutral mark that names no one and links
          // nowhere, so an agency's client never sees the platform behind it.
          <span className="gp-mark">
            <span className="gp-mark-dot" aria-hidden="true"><i /></span>
            Client portal
          </span>
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
                aria-invalid={emailInvalid || undefined}
                aria-describedby={error ? errorId : undefined}
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
                  aria-invalid={passwordInvalid || undefined}
                  aria-describedby={error ? errorId : undefined}
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
              <p id={errorId} className="gp-form-error" role="alert">
                {error === 'empty' && 'Enter your email and password.'}
                {error === 'offline' && 'Could not reach the server. Check your connection, then try again.'}
                {error === 'unavailable' && 'Sign-in is temporarily unavailable. Try again in a few minutes.'}
                {error === 'limited' && (
                  <>Too many sign-in attempts. Wait a few minutes, then try again, or <Link to={forgotHref}>reset your password</Link>.</>
                )}
                {error === 'mismatch' && (
                  <>That email and password do not match. Try again, or <Link to={forgotHref}>reset your password</Link>.</>
                )}
              </p>
            )}
          </form>

          <p className="gp-auth-foot">
            {agencyName
              ? <>Need help? Contact your {agencyName} team.</>
              : <>Need help? Contact the team that invited you.</>}
          </p>
        </main>

        {agencyName ? (
          <p className="gp-auth-copyright">© {new Date().getFullYear()} {agencyName}</p>
        ) : null}
      </div>
    </div>
  )
}
