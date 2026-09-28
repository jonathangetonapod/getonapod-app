import { Link } from 'react-router-dom'

import { AccessRequestForm } from '@/components/landing/AccessRequestForm'
import { AuthShell } from '@/components/landing/AuthShell'
import { CALL_URL } from '@/lib/landingContent'

/**
 * The register page.
 *
 * It is called "Request to join" everywhere it appears, because that is what it
 * does — the platform is invite-only and this creates no account. Calling the
 * link "Sign up" and then not signing anyone up is the one thing this page must
 * not do.
 *
 * The same form is on the agency page at /platform#start. This exists so the
 * sign-in page has somewhere to send people, and so the link survives being
 * shared.
 */
const RequestAccess = () => (
  <AuthShell
    title="Request to join | Get On A Pod"
    description="Ask to join Get On A Pod. Membership is by invite; tell us what you run and we will reply with a time to talk."
    path="/register"
    heading="Request to join."
    standfirst="Tell us what you run today: how many clients, what you use now, and whether podcasts are new for you."
    footer={<>Already have a workspace? <Link to="/login">Sign in</Link></>}
  >
    {/* This form is for agencies. Someone who wants to be a guest themselves
        has come to the wrong door, and the right one is a call. */}
    <p className="gp-auth-aside-note">
      Want to be booked on podcasts yourself? That is the done-for-you service:{' '}
      <a href={CALL_URL} target="_blank" rel="noopener noreferrer">book a 30-minute call</a>.
    </p>
    <AccessRequestForm />
  </AuthShell>
)

export default RequestAccess
