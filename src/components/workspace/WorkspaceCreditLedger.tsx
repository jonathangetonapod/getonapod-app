import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LEDGER_TYPE_LABELS, ledgerReasonLabel } from '@/lib/creditAdjustments'
import { getWorkspaceCreditLedger, type CreditLedgerType } from '@/services/workspaceStaff'

interface WorkspaceCreditLedgerProps {
  workspaceId: string
}

const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Every credit movement on this workspace, newest first, with who made it and
 * the balance it left. It replaces a list of the grants made in this browser
 * session, which was empty on every visit and never showed anyone else's.
 */
export const WorkspaceCreditLedger = ({ workspaceId }: WorkspaceCreditLedgerProps) => {
  const [type, setType] = useState<CreditLedgerType>('all')
  const [page, setPage] = useState(0)

  const ledgerQuery = useQuery({
    queryKey: ['workspace-credit-ledger', workspaceId, type, page],
    queryFn: () => getWorkspaceCreditLedger(workspaceId, { type, page }),
    // The current page stays on screen while the next one of the same type
    // loads, so paging does not flash an empty table. A new type starts
    // empty: spend rows under a "Grant" filter would be wrong, not stale.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === type ? previous : undefined),
    retry: false,
  })
  const data = ledgerQuery.data
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5" aria-hidden="true" />Credit history</CardTitle>
          <CardDescription>Every grant, removal, allowance, purchase and spend on this workspace.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="credit-ledger-type" className="whitespace-nowrap text-sm">Type</Label>
          <Select value={type} onValueChange={(value: CreditLedgerType) => { setType(value); setPage(0) }}>
            <SelectTrigger id="credit-ledger-type" className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(LEDGER_TYPE_LABELS) as Array<[CreditLedgerType, string]>).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ledgerQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Reading the ledger…
          </p>
        ) : ledgerQuery.isError || !data ? (
          <p className="text-sm text-destructive" role="alert">
            {ledgerQuery.error instanceof Error ? ledgerQuery.error.message : 'The credit ledger could not be loaded.'}
          </p>
        ) : data.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {type === 'all' ? 'No credit movements yet.' : `No ${LEDGER_TYPE_LABELS[type].toLowerCase()} entries.`}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Reason</th>
                    <th className="py-2 pr-3 font-medium">Note</th>
                    <th className="py-2 pr-3 font-medium">Admin</th>
                    <th className="py-2 text-right font-medium">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <tr key={entry.id} className="border-b align-top last:border-0">
                      <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">{when.format(new Date(entry.created_at))}</td>
                      <td className="whitespace-nowrap py-2.5 pr-3">{LEDGER_TYPE_LABELS[entry.type]}</td>
                      <td className={`py-2.5 pr-3 text-right font-medium tabular-nums ${entry.amount < 0 ? 'text-destructive' : 'text-emerald-700'}`}>
                        {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3">{ledgerReasonLabel(entry)}</td>
                      <td className="max-w-[16rem] py-2.5 pr-3 text-muted-foreground">{entry.note ?? ''}</td>
                      {/* Only an admin's own changes. On a spend the actor is the
                          person who ran the operation, not an admin. */}
                      <td className="max-w-[12rem] truncate py-2.5 pr-3" title={entry.actor_email ?? undefined}>
                        {entry.type === 'grant' || entry.type === 'removal' ? entry.actor_email ?? '' : ''}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{entry.balance_after.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground tabular-nums" aria-live="polite">
                {data.total.toLocaleString()} {data.total === 1 ? 'entry' : 'entries'} · page {page + 1} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={page === 0 || ledgerQuery.isFetching} onClick={() => setPage((current) => current - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Newer
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pageCount || ledgerQuery.isFetching} onClick={() => setPage((current) => current + 1)}>
                  Older<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
