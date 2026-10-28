import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PodcastContacts } from './PodcastContact'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

const podcast = {
  free_podscan_email: 'inbox@show.fm', email_verification: 'catch_all',
  direct_email: 'host@show.fm', direct_verified_at: '2026-10-28T00:00:00Z',
  direct_linkedin_url: 'https://www.linkedin.com/in/show-host',
} as WorkspacePodcastCatalogItem

function setup(overrides: Partial<WorkspacePodcastCatalogItem> = {}) {
  const onCopy = vi.fn(), onFind = vi.fn()
  render(<TooltipProvider><PodcastContacts podcast={{ ...podcast, ...overrides }} onCopy={onCopy} onFind={onFind} /></TooltipProvider>)
  return { onCopy, onFind }
}

describe('separate podcast contacts', () => {
  it('keeps both addresses and their independent statuses and copy actions', () => {
    const { onCopy } = setup()
    expect(screen.getByText('Catch-all email')).toBeInTheDocument()
    expect(screen.getByText('Verified host email')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy podcast inbox: inbox@show.fm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy host email: host@show.fm' }))
    expect(onCopy.mock.calls).toEqual([['inbox@show.fm'], ['host@show.fm']])
    expect(screen.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute('href', podcast.direct_linkedin_url)
  })
  it('identifies equal addresses without hiding the host verification', () => {
    setup({ direct_email: 'INBOX@show.fm' })
    expect(screen.getByText('Same as podcast inbox')).toBeInTheDocument()
    expect(screen.getByText('Verified host email')).toBeInTheDocument()
  })
  it('offers discovery for missing host contacts and rejects unsafe profile links', () => {
    const { onFind } = setup({ free_podscan_email: null, direct_email: null, direct_linkedin_url: 'https://linkedin.com.evil.test/in/host' })
    expect(screen.getByText('Not available')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Find host email' }))
    expect(onFind).toHaveBeenCalledOnce()
  })
})
