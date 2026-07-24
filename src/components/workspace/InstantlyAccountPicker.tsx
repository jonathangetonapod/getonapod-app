import { Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { InstantlySendingAccount } from '@/services/workspaceCampaigns'

interface InstantlyAccountPickerProps {
  accounts: InstantlySendingAccount[]
  connected: boolean
  selected: Set<string>
  onChange: (accounts: Set<string>) => void
  disabled?: boolean
  className?: string
}

function accountName(account: InstantlySendingAccount): string {
  return [account.first_name, account.last_name].filter(Boolean).join(' ').trim()
}

export function InstantlyAccountPicker({
  accounts,
  connected,
  selected,
  onChange,
  disabled = false,
  className = 'max-h-64',
}: InstantlyAccountPickerProps) {
  const sortedAccounts = [...accounts].sort((left, right) => (
    Number(right.status === 1) - Number(left.status === 1)
    || left.email.localeCompare(right.email)
  ))
  const accountEmails = new Set(sortedAccounts.map((account) => account.email))
  const missingSelections = Array.from(selected)
    .filter((email) => !accountEmails.has(email))
    .sort((left, right) => left.localeCompare(right))
  const activeAccounts = sortedAccounts.filter((account) => account.status === 1)
  const selectedCapacity = activeAccounts.reduce((total, account) => (
    selected.has(account.email) ? total + (account.daily_limit || 0) : total
  ), 0)

  const setAccount = (email: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(email)
    else next.delete(email)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Label>Accounts to use</Label>
          <p className="mt-1 text-xs text-muted-foreground">Select one or more accounts to send emails from.</p>
        </div>
        {connected && sortedAccounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected.size} selected</Badge>
            {selectedCapacity > 0 && <Badge variant="outline">{selectedCapacity.toLocaleString()}/day</Badge>}
          </div>
        )}
      </div>

      {!connected ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          Connect Instantly to choose campaign mailboxes.
        </div>
      ) : sortedAccounts.length === 0 && missingSelections.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          No mailboxes were found in the connected Instantly workspace. Refresh the connection after adding an account.
        </div>
      ) : (
        <div className={`overflow-y-auto rounded-xl border ${className}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-3 py-2 backdrop-blur">
            <p className="text-xs font-medium text-muted-foreground">{sortedAccounts.length} mailbox{sortedAccounts.length === 1 ? '' : 'es'}</p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled || activeAccounts.length === 0}
                onClick={() => onChange(new Set(activeAccounts.map((account) => account.email)))}
              >
                Select all active
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled || selected.size === 0}
                onClick={() => onChange(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="divide-y">
            {sortedAccounts.map((account) => {
              const active = account.status === 1
              const checked = selected.has(account.email)
              const name = accountName(account)
              return (
                <label
                  key={account.email}
                  className={`flex items-center gap-3 px-3 py-3 transition-colors ${active ? 'cursor-pointer hover:bg-muted/30' : checked ? 'cursor-pointer bg-amber-50/40' : 'cursor-not-allowed bg-muted/15 text-muted-foreground'}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => setAccount(account.email, value === true)}
                    disabled={disabled || (!active && !checked)}
                    aria-label={`Use ${account.email}`}
                  />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Mail className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{name || account.email}</p>
                    {name && <p className="truncate text-xs text-muted-foreground">{account.email}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline" className={active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{active ? 'Active' : 'Unavailable'}</Badge>
                    {account.daily_limit !== null && <span className="text-[11px] text-muted-foreground">{account.daily_limit.toLocaleString()}/day</span>}
                  </div>
                </label>
              )
            })}

            {missingSelections.map((email) => (
              <label key={email} className="flex cursor-pointer items-center gap-3 bg-amber-50/40 px-3 py-3">
                <Checkbox checked onCheckedChange={(value) => setAccount(email, value === true)} disabled={disabled} aria-label={`Use ${email}`} />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Mail className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{email}</p><p className="text-xs text-amber-800">No longer returned by Instantly</p></div>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Remove</Badge>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
