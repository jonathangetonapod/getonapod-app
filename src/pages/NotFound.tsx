import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AuthShell } from '@/components/landing/AuthShell'
import { CALL_LABEL, CALL_URL } from '@/lib/landingContent'

/**
 * The page for an address that is nothing. It wears the auth frame, which
 * keeps it out of the index (AuthShell's PageSEO is always noindex) and gives
 * a lost reader the same two doors as every other dead end.
 */
const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

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
