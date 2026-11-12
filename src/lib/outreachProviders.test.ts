import { describe, expect, it } from 'vitest'
import { providerCampaignUrl } from '@/lib/outreachProviders'

describe('providerCampaignUrl', () => {
  it('links each platform to its own campaign page', () => {
    expect(providerCampaignUrl({ provider: 'instantly' }, 'a1b2')).toBe('https://app.instantly.ai/app/campaign/a1b2/analytics')
    expect(providerCampaignUrl({ provider: 'reachinbox' }, '104757')).toBe('https://app.reachinbox.ai/campaign/104757/analytics')
    expect(providerCampaignUrl({ provider: 'emailbison', provider_base_url: 'https://send.example.com' }, '12'))
      .toBe('https://send.example.com/campaigns/12')
  })

  it('has nothing to link to before the platform campaign exists', () => {
    expect(providerCampaignUrl({ provider: 'instantly' }, null)).toBeNull()
  })

  it('never builds an href from an unusable Email Bison address', () => {
    expect(providerCampaignUrl({ provider: 'emailbison', provider_base_url: null }, '12')).toBeNull()
    expect(providerCampaignUrl({ provider: 'emailbison', provider_base_url: 'javascript:alert(1)' }, '12')).toBeNull()
    expect(providerCampaignUrl({ provider: 'emailbison', provider_base_url: 'http://send.example.com' }, '12')).toBeNull()
  })

  it('escapes the id so it stays one path segment', () => {
    expect(providerCampaignUrl({ provider: 'instantly' }, '../x?y')).toBe('https://app.instantly.ai/app/campaign/..%2Fx%3Fy/analytics')
  })
})
