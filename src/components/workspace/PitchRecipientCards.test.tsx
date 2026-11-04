import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PitchRecipientCards, type VerifiedSearchState } from './PitchRecipientCards'
import { PitchSendingToPanel } from './PitchSendingToPanel'
import { chooseRecipient, type PitchRecipient, type RecipientContext } from '@/lib/pitchRecipients'

const context: RecipientContext = { podscanEmails: ['show@pod.fm'], verifiedEmail: null }
const idle: VerifiedSearchState = { email: null, stale: false, running: false, noResult: false, message: null, linkedinUrl: null, steps: [] }

const Harness = ({ verified = idle, onStartSearch = vi.fn(), initial = chooseRecipient(context, 'show@pod.fm', 'podscan') }: {
  verified?: VerifiedSearchState
  onStartSearch?: () => void
  initial?: PitchRecipient[]
}) => {
  const [recipients, setRecipients] = useState<PitchRecipient[]>(initial)
  const [verifiedOpen, setVerifiedOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  return (
    <TooltipProvider>
      <PitchRecipientCards
        recipient={recipients[0] ?? null}
        context={context}
        onChange={setRecipients}
        verified={verified}
        verifiedOpen={verifiedOpen}
        onVerifiedOpenChange={setVerifiedOpen}
        manualOpen={manualOpen}
        onManualOpenChange={setManualOpen}
        disabled={false}
        canSearch
        byoAi
        onStartSearch={onStartSearch}
      />
      <PitchSendingToPanel recipient={recipients[0] ?? null} verifiedPlaceholder={null} />
    </TooltipProvider>
  )
}

describe('PitchRecipientCards', () => {
  it('is one radio group whose whole cards choose, and the Sending to strip follows', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Who receives this pitch' })
    expect(group).toBeInTheDocument()
    const inbox = screen.getByRole('radio', { name: 'Use free podcast inbox' })
    const manual = screen.getByRole('radio', { name: 'Use an email you found' })
    expect(inbox).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()

    fireEvent.click(manual)
    expect(manual).toHaveAttribute('aria-checked', 'true')
    expect(inbox).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('No address selected yet.')).toBeInTheDocument()

    const field = screen.getByLabelText('Email address')
    fireEvent.change(field, { target: { value: 'host@pod.fm' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.getByLabelText('Pitch recipient')).toHaveTextContent('host@pod.fm')
    expect(screen.getByLabelText('Pitch recipient')).toHaveTextContent('Manual')
  })

  it('moves the choice with the arrow keys and keeps one card in the tab order', () => {
    render(<Harness />)
    const inbox = screen.getByRole('radio', { name: 'Use free podcast inbox' })
    const verified = screen.getByRole('radio', { name: 'Use verified host email' })
    expect(inbox).toHaveAttribute('tabindex', '0')
    expect(verified).toHaveAttribute('tabindex', '-1')

    inbox.focus()
    fireEvent.keyDown(inbox, { key: 'ArrowRight' })
    expect(verified).toHaveAttribute('aria-checked', 'true')
    expect(verified).toHaveFocus()
    expect(verified).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(verified, { key: 'ArrowLeft' })
    expect(inbox).toHaveAttribute('aria-checked', 'true')
  })

  it('never spends on choosing the verified card; only its button searches', () => {
    const onStartSearch = vi.fn()
    render(<Harness onStartSearch={onStartSearch} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Use verified host email' }))
    expect(onStartSearch).not.toHaveBeenCalled()
    expect(screen.getByText('Not searched')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Find verified email' }))
    expect(onStartSearch).toHaveBeenCalledTimes(1)
  })

  it('shows a found verified email with no cost and uses it in one click', () => {
    render(<Harness verified={{ ...idle, email: 'jamie@pod.fm' }} />)
    expect(screen.getByText('None. Already found.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use verified email' }))
    expect(screen.getByRole('radio', { name: 'Use verified host email' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Pitch recipient')).toHaveTextContent('jamie@pod.fm')
  })
})
