import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseOptionalJsonObject,
  requireOnlyKeys,
  requireUuid,
  secretsMatch,
} from '../_shared/workspaceAuth.ts'
import {
  createOnboardingCapability,
  onboardingUrl,
  sendOnboardingEmail,
} from '../_shared/workspaceOnboarding.ts'

const METHODS = ['POST'] as const

function requiredSecret(name: string, minimumLength: number): string {
  const value = Deno.env.get(name)?.trim()
  if (!value || value.length < minimumLength) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The reminder service is not configured')
  }
  return value
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(500, 'INVALID_REMINDER_RESPONSE', 'The reminder claim was invalid')
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new HttpError(500, 'INVALID_REMINDER_RESPONSE', `The reminder ${field} was invalid`)
  }
  return value
}

function integerValue(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(500, 'INVALID_REMINDER_RESPONSE', `The reminder ${field} was invalid`)
  }
  return value
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const expected = requiredSecret('ONBOARDING_REMINDER_SECRET', 32)
    const provided = req.headers.get('x-onboarding-reminder-secret')?.trim() ?? ''
    if (!provided || !(await secretsMatch(provided, expected))) {
      throw new HttpError(401, 'INVALID_REMINDER_SECRET', 'Reminder authentication failed')
    }
    const body = await parseOptionalJsonObject(req)
    requireOnlyKeys(body, ['limit'])
    const limit = body.limit === undefined ? 25 : integerValue(body.limit, 'limit', 1, 50)
    const admin = createAdminClient()
    const claimed = await admin.rpc('claim_workspace_onboarding_reminders_v1', { p_limit: limit })
    if (claimed.error || !Array.isArray(claimed.data)) {
      throw new HttpError(500, 'REMINDER_CLAIM_FAILED', 'Reminders could not be claimed')
    }

    const capabilitySecret = requiredSecret('ONBOARDING_CAPABILITY_SECRET', 32)
    let sent = 0
    let failed = 0
    let skipped = 0
    for (const rawReminder of claimed.data) {
      const reminder = record(rawReminder)
      const notificationId = requireUuid(reminder.notification_id, 'notification_id')
      const instanceId = requireUuid(reminder.instance_id, 'instance_id')
      const generation = integerValue(reminder.capability_generation, 'generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret)
      const delivery = await sendOnboardingEmail({
        kind: 'reminder',
        workspaceName: stringValue(reminder.workspace_name, 'workspace name', 200),
        recipientName: stringValue(reminder.recipient_name, 'recipient name', 200),
        recipientEmail: stringValue(reminder.recipient_email, 'recipient email', 254),
        url: onboardingUrl(capability.token),
        expiresAt: stringValue(reminder.capability_expires_at, 'expiry', 64),
      })
      const completion = await admin.rpc('complete_workspace_onboarding_notification_v1', {
        p_notification_id: notificationId,
        p_status: delivery.status,
        p_provider_message_id: delivery.providerMessageId,
        p_error: delivery.error,
      })
      if (completion.error || completion.data !== true) {
        failed += 1
      } else if (delivery.status === 'sent') {
        sent += 1
      } else if (delivery.status === 'skipped') {
        skipped += 1
      } else {
        failed += 1
      }
    }

    return jsonResponse(req, METHODS, 200, {
      claimed: claimed.data.length,
      sent,
      failed,
      skipped,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
