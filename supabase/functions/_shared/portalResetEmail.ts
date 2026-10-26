// White-labeled client portal invite and password reset emails. Mirrors the
// onboarding email's fail-soft delivery semantics: missing delivery config
// skips the send instead of failing the reset request. The wording lives in
// the n8n email workflow; these functions hand over the facts.

import { sendAppEmail } from './appEmail.ts'
import { platformOrigin } from './workspaceOrigin.ts'

export interface PortalResetEmailResult {
  status: 'sent' | 'failed' | 'skipped'
  providerMessageId: string | null
  error: string | null
}

export function portalResetUrl(token: string, origin?: string): string {
  const url = new URL('/portal/reset', origin ?? platformOrigin())
  url.searchParams.set('token', token)
  return url.toString()
}

export async function sendPortalInviteEmail(input: {
  workspaceName: string
  recipientName: string
  recipientEmail: string
  url: string
  loginUrl: string
}): Promise<PortalResetEmailResult> {
  const delivery = await sendAppEmail({
    event: 'portal.invite',
    to: [input.recipientEmail],
    senderName: input.workspaceName,
    data: {
      workspace_name: input.workspaceName,
      recipient_name: input.recipientName,
      setup_url: input.url,
      login_url: input.loginUrl,
    },
  })
  return { status: delivery.status, providerMessageId: delivery.providerMessageId, error: delivery.error }
}

export function portalLoginUrl(brandingSlug: string | null, origin?: string): string {
  const url = new URL('/portal/login', origin ?? platformOrigin())
  if (brandingSlug) url.searchParams.set('b', brandingSlug)
  return url.toString()
}

export async function sendPortalResetEmail(input: {
  workspaceName: string
  recipientName: string
  recipientEmail: string
  url: string
}): Promise<PortalResetEmailResult> {
  const delivery = await sendAppEmail({
    event: 'portal.password_reset',
    to: [input.recipientEmail],
    senderName: input.workspaceName,
    data: {
      workspace_name: input.workspaceName,
      recipient_name: input.recipientName,
      reset_url: input.url,
    },
  })
  return { status: delivery.status, providerMessageId: delivery.providerMessageId, error: delivery.error }
}
