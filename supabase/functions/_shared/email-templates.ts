/**
 * Email templates for client portal
 *
 * The recipient is an agency's client, so the email speaks in the agency's
 * (workspace's) name, never the platform's. When the workspace is unknown it
 * stays neutral rather than falling back to a platform brand.
 */

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

const NEUTRAL_SENDER_NAME = 'Your podcast team'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function singleLine(value: string | null | undefined, fallback: string, max: number): string {
  const cleaned = (value ?? '').replace(/[\r\n]+/gu, ' ').trim().slice(0, max)
  return cleaned || fallback
}

/**
 * Portal invitation email template
 */
export function getPortalInvitationEmail(
  clientName: string,
  portalUrl: string,
  workspaceName?: string | null,
): EmailTemplate {
  const sender = singleLine(workspaceName, NEUTRAL_SENDER_NAME, 120)
  const hasWorkspace = sender !== NEUTRAL_SENDER_NAME
  const recipient = singleLine(clientName, 'there', 160)
  const subject = hasWorkspace ? `Your ${sender} client portal is ready` : 'Your client portal is ready'
  const portalLabel = hasWorkspace ? `${sender} client portal` : 'client portal'
  const signOff = hasWorkspace ? `The ${sender} team` : NEUTRAL_SENDER_NAME
  const help = hasWorkspace
    ? `Contact your ${sender} team with any questions.`
    : 'Contact the team that invited you with any questions.'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #171827; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${escapeHtml(sender)}</h1>
  </div>

  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">Hi ${escapeHtml(recipient)},</h2>

    <p style="color: #4b5563; font-size: 16px;">
      You've been invited to your <strong>${escapeHtml(portalLabel)}</strong>, where you can view all your podcast bookings and episodes in one place.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(portalUrl)}" style="display: inline-block; background: #171827; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Access your portal
      </a>
    </div>

    <div style="background: #f9fafb; border-left: 4px solid #171827; padding: 16px; margin: 24px 0; border-radius: 4px;">
      <p style="margin: 0; color: #4b5563; font-size: 14px;"><strong>Your portal gives you real-time access to:</strong></p>
      <ul style="color: #6b7280; font-size: 14px; margin: 8px 0 0 0; padding-left: 20px;">
        <li>All your podcast bookings</li>
        <li>Recording and publish dates</li>
        <li>Episode links once they're live</li>
        <li>Status updates on each placement</li>
      </ul>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      ${escapeHtml(help)}
    </p>

    <p style="color: #4b5563; margin-bottom: 0;">
      Best,<br>
      <strong>${escapeHtml(signOff)}</strong>
    </p>
  </div>
</body>
</html>
  `.trim()

  const text = `
Hi ${recipient},

You've been invited to your ${portalLabel}, where you can view all your podcast bookings and episodes in one place.

Access your portal here: ${portalUrl}

Your portal gives you real-time access to:
- All your podcast bookings
- Recording and publish dates
- Episode links once they're live
- Status updates on each placement

${help}

Best,
${signOff}
  `.trim()

  return { subject, html, text }
}
