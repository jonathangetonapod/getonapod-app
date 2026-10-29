import { toast } from 'sonner'

export interface BillingRecoveryLinks {
  billingHref?: string
  providerHref?: string
  canManageBilling?: boolean
  canManageProviders?: boolean
}

export function billingRecovery(error: unknown, links: BillingRecoveryLinks = {}) {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
  if (code === 'SUBSCRIPTION_REQUIRED') return {
    description: 'Your workspace subscription needs attention. An owner or administrator can manage it in Billing.',
    label: 'Manage subscription', href: links.canManageBilling === false ? null : links.billingHref ?? '/app/settings/billing',
  }
  if (['PLATFORM_PROVIDER_NOT_CONFIGURED', 'PLATFORM_PROVIDER_ACTION_REQUIRED', 'WINNR_NOT_CONNECTED'].includes(String(code))) return {
    description: 'This service is managed by the platform. Contact support; you do not need another API key.',
    label: '', href: null,
  }
  if (['PROVIDER_KEY_REQUIRED', 'PROVIDER_KEY_REJECTED', 'CLAUDE_KEY_REQUIRED'].includes(String(code))) return {
    description: 'Ask your workspace owner to connect or replace this provider key. The connection is shared by the whole team.',
    label: 'Provider accounts', href: links.canManageProviders === false ? null : links.providerHref ?? '/app/settings/billing#providers',
  }
  if (code === 'PROVIDER_BILLING_REQUIRED') return {
    description: 'Check billing and usage limits in the connected provider account. Provider usage is billed separately from your workspace subscription.',
    label: 'Provider accounts', href: links.canManageProviders === false ? null : links.providerHref ?? '/app/settings/billing#providers',
  }
  if (code === 'PROVIDER_RATE_LIMITED' || code === 'PROVIDER_UNAVAILABLE') return {
    description: 'Wait a moment before retrying. Keep your saved key; this response does not mean it is invalid.',
    label: '', href: null,
  }
  if (code === 'AI_KEY_STORAGE_UNAVAILABLE' || code === 'PROVIDER_CONNECTION_UNAVAILABLE') return {
    description: 'Your saved connection could not be read. Try again or contact support before replacing any keys.',
    label: '', href: null,
  }
  if (code === 'INSUFFICIENT_CREDITS') return {
    description: 'App credit billing has ended. Refresh the app and contact support if this keeps happening.',
    label: 'Billing', href: links.canManageBilling === false ? null : links.billingHref ?? '/app/settings/billing',
  }
  return null
}

export function showOperationError(error: unknown, fallback: string, links?: BillingRecoveryLinks) {
  const message = error instanceof Error ? error.message : fallback
  const recovery = billingRecovery(error, links)
  if (!recovery) { toast.error(message); return }
  toast.error(message, {
    description: recovery.description,
    duration: 10_000,
    ...(recovery.href ? { action: { label: recovery.label, onClick: () => window.location.assign(recovery.href!) } } : {}),
  })
}
