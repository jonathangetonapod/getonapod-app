import { describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { billingRecovery, showOperationError } from './billingRecovery'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('billing recovery', () => {
  it('distinguishes provider funds from the workspace subscription', () => {
    expect(billingRecovery({ code: 'PROVIDER_BILLING_REQUIRED' })?.description).toContain('connected provider account')
    expect(billingRecovery({ code: 'SUBSCRIPTION_REQUIRED' })?.label).toBe('Manage subscription')
    expect(billingRecovery({ code: 'INSUFFICIENT_CREDITS' })?.description).toContain('credit billing has ended')
  })

  it('keeps recovery within the selected workspace and respects permissions', () => {
    expect(billingRecovery({ code: 'PROVIDER_KEY_REJECTED' }, { providerHref: '/workspace/b/settings' })?.href).toBe('/workspace/b/settings')
    expect(billingRecovery({ code: 'PROVIDER_BILLING_REQUIRED' }, { canManageProviders: false })?.href).toBeNull()
    expect(billingRecovery({ code: 'SUBSCRIPTION_REQUIRED' }, { canManageBilling: false })?.href).toBeNull()
  })

  it.each(['PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'AI_KEY_STORAGE_UNAVAILABLE', 'PROVIDER_CONNECTION_UNAVAILABLE'])('does not send users to replace a key for %s', (code) => {
    expect(billingRecovery({ code })?.href).toBeNull()
    expect(billingRecovery({ code })?.description).not.toContain('connect or replace')
  })

  it('preserves ordinary errors without a billing action', () => {
    expect(billingRecovery(new Error('Bad input'))).toBeNull()
    showOperationError(new Error('Bad input'), 'Failed')
    expect(toast.error).toHaveBeenLastCalledWith('Bad input')
  })
})
