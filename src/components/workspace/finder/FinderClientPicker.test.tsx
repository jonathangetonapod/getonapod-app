import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FinderClientPicker } from '@/components/workspace/finder/FinderClientPicker'
import type { WorkspaceClient } from '@/services/clients'

function client(index: number, name: string): WorkspaceClient {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    workspace_id: '11111111-1111-4111-8111-111111111111',
    name,
    email: null,
    contact_person: null,
    linkedin_url: null,
    website: null,
    status: 'active',
    notes: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  }
}

const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>

function renderPicker(clients: WorkspaceClient[], onChange = vi.fn()) {
  const Harness = () => {
    const [open, setOpen] = useState(false)
    return (
      <FinderClientPicker
        clients={clients}
        value=""
        onChange={onChange}
        loading={false}
        disabled={false}
        addClientHref="/app/clients"
        open={open}
        onOpenChange={setOpen}
        highlighted={false}
      />
    )
  }
  render(
    <MemoryRouter initialEntries={['/app/podcast-finder']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Harness />
      <LocationProbe />
    </MemoryRouter>,
  )
  return onChange
}

const names = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds', 'Margaret Hamilton', 'Tim Berners-Lee']

describe('FinderClientPicker', () => {
  it('lists six or fewer clients without a search box, with their initials', () => {
    renderPicker(names.slice(0, 6).map((name, index) => client(index, name)))
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))

    expect(screen.queryByRole('combobox', { name: 'Search clients' })).not.toBeInTheDocument()
    const option = screen.getByRole('option', { name: 'Ada Lovelace' })
    expect(within(option).getByText('AL')).toHaveAttribute('aria-hidden', 'true')
  })

  it('searches once there are more than six clients', () => {
    const onChange = renderPicker(names.map((name, index) => client(index, name)))
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))

    fireEvent.change(screen.getByRole('combobox', { name: 'Search clients' }), { target: { value: 'hopper' } })
    expect(screen.getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Ada Lovelace' })).not.toBeInTheDocument()
    // Still offered when a search narrows the list.
    expect(screen.getByRole('option', { name: 'Add client' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: 'Grace Hopper' }))
    expect(onChange).toHaveBeenCalledWith(client(1, 'Grace Hopper').id)
  })

  it('leads to the client creation flow from the bottom of the list', () => {
    renderPicker([client(0, 'Ada Lovelace')])
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.click(screen.getByRole('option', { name: 'Add client' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })

  it('moves through clients with the arrow keys once open', () => {
    const onChange = renderPicker(names.slice(0, 3).map((name, index) => client(index, name)))
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))

    const list = document.activeElement as HTMLElement
    expect(list).toHaveAttribute('cmdk-root')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(client(1, 'Grace Hopper').id)
  })
})
