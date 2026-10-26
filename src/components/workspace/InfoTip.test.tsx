import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { InfoTip } from '@/components/workspace/InfoTip'
import { subscriptionStatusView } from '@/lib/subscriptionStatus'

describe('InfoTip', () => {
  it('is a named button that shows its explanation on keyboard focus', async () => {
    render(<p>One line. <InfoTip topic="monthly credits">They expire at the end of the following month.</InfoTip></p>)

    const button = screen.getByRole('button', { name: 'More about monthly credits' })
    fireEvent.focus(button)
    expect((await screen.findAllByText('They expire at the end of the following month.')).length).toBeGreaterThan(0)
  })
})

// The scoped tokens are what make the billing admin pass WCAG AA; a later
// edit to them would fail contrast without failing anything else.
describe('billing admin contrast', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const scoped = css.slice(css.indexOf('.billing-admin {'))

  it('uses a red and a grey that pass 4.5:1 on white', () => {
    expect(scoped).toMatch(/--destructive: 0 72% 42%;/u)
    expect(scoped).toMatch(/--muted-foreground: 0 0% 40%;/u)
  })

  it('keeps disabled buttons at full opacity with dark text', () => {
    expect(scoped).toMatch(/\.billing-admin button:disabled \{\s*opacity: 1;\s*color: hsl\(0 0% 32%\);/u)
  })
})

describe('billing admin copy', () => {
  it('uses no em dashes in the status notes', () => {
    for (const status of ['active', 'trialing', 'comped', 'past_due', 'paused', 'canceled', 'something_new']) {
      expect(subscriptionStatusView(status).note).not.toContain('—')
    }
  })
})
