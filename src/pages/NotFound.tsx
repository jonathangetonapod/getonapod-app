import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AuthShell } from '@/components/landing/AuthShell'
import PageSEO from '@/components/seo/PageSEO'
import { CALL_LABEL, CALL_URL } from '@/lib/landingContent'
import '@/styles/agencyLanding.css'

// Addresses an agency's own clients and prospects are sent to. A dead link
// there must not name the platform, offer its sales call or send anyone to its
// homepage: the reader belongs to the agency.
const CLIENT_FACING_PATH = /^\/(?:portal|client|prospect|onboarding)(?:\/|$)/u

const isClientFacingPath = (pathname: string) => CLIENT_FACING_PATH.test(pathname)

/**
 * The page for an address that is nothing. It wears the auth frame, which
 * keeps it out of the index (AuthShell's PageSEO is always noindex) and gives
 * a lost reader the same two doors as every other dead end. Under the client
 * facing paths it is a neutral notice with no doors at all.
 */
const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  if (isClientFacingPath(location.pathname)) {
    return (
      <div className="gp-page gp-auth-split gp-auth-solo">
        <PageSEO
          title="Link not valid"
          description="This link is not valid."
          path={location.pathname}
          noindex
          whiteLabel
          brandName="Client portal"
        />
        <div className="gp-auth-col">
          <main className="gp-auth-main gp-auth-narrow">
            <h1>This link is not valid.</h1>
            <p className="gp-auth-reason">Contact the person who sent it.</p>
          </main>
        </div>
      </div>
    )
  }

  return (
    <AuthShell
      title="Page not found | Get On A Pod"
      description="There is nothing at this address."
      path={location.pathname}
      tone="notice"
      heading="Nothing at this address."
      footer={<>Looking for your portal? <Link to="/portal/login">Client sign-in</Link></>}
    >
      <p className="gp-auth-reason">The link may be old or mistyped.</p>
      <div className="gp-auth-actions">
        <Link className="gp-btn gp-btn-primary" to="/">Go to the homepage</Link>
        <a className="gp-btn gp-btn-quiet" href={CALL_URL} target="_blank" rel="noopener noreferrer">
          {CALL_LABEL}
        </a>
      </div>
    </AuthShell>
  )
}

export default NotFound
