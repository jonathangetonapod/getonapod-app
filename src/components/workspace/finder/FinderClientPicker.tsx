import { forwardRef, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { initials } from '@/components/workspace/pipeline/pipelineRollup'
import { cn } from '@/lib/utils'
import type { WorkspaceClient } from '@/services/clients'

/** Past this many clients the list gets a search box. */
export const CLIENT_SEARCH_THRESHOLD = 6

interface FinderClientPickerProps {
  clients: WorkspaceClient[]
  value: string
  onChange: (clientId: string) => void
  loading: boolean
  disabled: boolean
  /** Where "+ Add client" leads: the Clients page, which owns the create dialog. */
  addClientHref: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Drawn when a scan was asked for with no client chosen. */
  highlighted: boolean
}

const ClientInitials = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
  >
    {initials(name)}
  </span>
)

export const FinderClientPicker = forwardRef<HTMLButtonElement, FinderClientPickerProps>(({
  clients,
  value,
  onChange,
  loading,
  disabled,
  addClientHref,
  open,
  onOpenChange,
  highlighted,
}, ref) => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const commandRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selected = clients.find((client) => client.id.toLowerCase() === value) ?? null
  const searchable = clients.length > CLIENT_SEARCH_THRESHOLD

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Client"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between gap-2 px-3 font-normal sm:max-w-sm',
            highlighted && 'border-primary ring-2 ring-primary/30',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <ClientInitials name={selected.name} />}
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.name ?? (loading ? 'Loading clients…' : 'Choose a client')}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-64 p-0"
        // Radix would focus the popover itself, which sits outside the list's
        // key handling, so arrow keys did nothing until something was clicked.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(searchRef.current ?? commandRef.current)?.focus()
        }}
      >
        <Command ref={commandRef} shouldFilter={searchable} label="Search clients">
          {searchable && (
            <CommandInput
              ref={searchRef}
              value={search}
              onValueChange={setSearch}
              placeholder="Search clients"
            />
          )}
          <CommandList aria-label="Clients">
            {searchable && <CommandEmpty>No client matches that search.</CommandEmpty>}
            {clients.length > 0 && (
              <CommandGroup>
                {clients.map((client) => {
                  const isSelected = client.id.toLowerCase() === value
                  return (
                    <CommandItem
                      key={client.id}
                      value={`${client.name} ${client.id}`}
                      onSelect={() => {
                        onChange(client.id.toLowerCase())
                        onOpenChange(false)
                        setSearch('')
                      }}
                      aria-selected={isSelected}
                      className="gap-2"
                    >
                      <ClientInitials name={client.name} />
                      <span className="min-w-0 flex-1 truncate">{client.name}</span>
                      <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            <CommandSeparator alwaysRender />
            {/* Always offered, so a search that finds nobody still has a way forward. */}
            <CommandGroup forceMount>
              <CommandItem value="add-client" forceMount onSelect={() => navigate(addClientHref)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add client
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
})

FinderClientPicker.displayName = 'FinderClientPicker'
