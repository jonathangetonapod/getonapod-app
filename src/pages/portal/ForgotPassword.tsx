import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KeyRound, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PageSEO from '@/components/seo/PageSEO'
import { supabase } from '@/lib/supabase'
import { currentHostname } from '@/lib/workspaceHost'
import { requestPortalPasswordReset } from '@/services/clientPortal'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

interface LinkBranding {
  name: string
  logo_url: string | null
  primary_color: string | null
}

/*
 * The agency behind a ?b= link, for the tab title and icon. The page has no
 * session to read branding from, so it asks for the public metadata the login
 * page already uses; it is cosmetic, and the neutral page stays fully usable
 * when the lookup fails. ResetPassword carries the same lookup: a page file
 * cannot export a hook without breaking fast refresh.
 */
function useLinkBranding(brandingSlug: string): LinkBranding | null {
  const [linkBranding, setLinkBranding] = useState<LinkBranding | null>(null)

  useEffect(() => {
    if (!brandingSlug || !SLUG_PATTERN.test(brandingSlug) || brandingSlug.length > 180) return
    let cancelled = false
    supabase.functions
      .invoke('public-client-dashboard', { body: { action: 'metadata', slug: brandingSlug.toLowerCase(), hostname: currentHostname() } })
      .then(({ data, error }) => {
        if (cancelled || error) return
        const workspace = data?.metadata?.workspace
        if (workspace && typeof workspace.name === 'string' && workspace.name.trim()) {
          setLinkBranding({
            name: workspace.name.trim(),
            logo_url: typeof workspace.logo_url === 'string' ? workspace.logo_url : null,
            primary_color: typeof workspace.primary_color === 'string' && /^#[0-9a-f]{6}$/iu.test(workspace.primary_color)
              ? workspace.primary_color
              : null,
          })
        }
      })
      .catch(() => {
        // Branding is cosmetic; the neutral page stays fully functional.
      })
    return () => {
      cancelled = true
    }
  }, [brandingSlug])

  return linkBranding
}

export default function PortalForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const [searchParams] = useSearchParams()
  const brandingSlug = searchParams.get('b') || ''
  const loginHref = brandingSlug ? `/portal/login?b=${encodeURIComponent(brandingSlug)}` : '/portal/login'
  const linkBranding = useLinkBranding(brandingSlug)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await requestPortalPasswordReset(email.trim().toLowerCase())
      setRequested(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The reset request could not be sent.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <PageSEO
        title="Reset your portal password"
        description="Request a client portal password reset link."
        path="/portal/forgot"
        noindex
        whiteLabel
        brandName={linkBranding?.name || 'Client portal'}
        favicon={linkBranding?.logo_url}
        themeColor={linkBranding?.primary_color || undefined}
      />
      <Card className="w-full max-w-md">
        {requested ? (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <MailCheck className="h-8 w-8 text-emerald-700" />
              </div>
              <h1 className="text-2xl font-semibold leading-none tracking-tight">Check your email</h1>
              <CardDescription>
                If {email.trim()} has a portal account, a reset link is on the way. It expires in 60 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full h-11">
                <Link to={loginHref}>Back to sign in</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                <KeyRound className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-semibold leading-none tracking-tight">Reset your password</h1>
              <CardDescription>
                Enter your portal email and we will send you a reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={submitting}
                    className="w-full h-11"
                    autoFocus
                  />
                </div>
                {error && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full h-11" disabled={submitting || !email}>
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
                <Button asChild variant="ghost" className="w-full h-11">
                  <Link to={loginHref}>Back to sign in</Link>
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
