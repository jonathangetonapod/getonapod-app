import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getWorkspaceBillingOverview, setWorkspaceClientLimit } from '@/services/workspaceStaff'

interface WorkspaceClientLimitProps {
  workspaceId: string
  workspaceName: string | null
}

/**
 * How many clients a workspace may have active at once.
 *
 * The limit lives on the workspace's billing profile and is checked whenever a
 * client is created as, or moved to, active. Without this card the only way to
 * raise it was SQL.
 */
export function WorkspaceClientLimit({ workspaceId, workspaceName }: WorkspaceClientLimitProps) {
  const queryClient = useQueryClient()
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })

  const current = overviewQuery.data?.included_active_clients ?? null
  const [draft, setDraft] = useState('')
  useEffect(() => {
    if (typeof current === 'number') setDraft(String(current))
  }, [current])

  // Digits only, for the same reason as the monthly allowance beside this.
  const parsed = /^\d+$/u.test(draft.trim()) ? Number.parseInt(draft.trim(), 10) : Number.NaN
  const valid = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10_000
  const dirty = valid && parsed !== current

  const saveMutation = useMutation({
    mutationFn: () => setWorkspaceClientLimit(workspaceId, parsed),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] }),
      ])
      toast.success(`${workspaceName || 'This workspace'} can now have ${saved} active ${saved === 1 ? 'client' : 'clients'}.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The active client limit could not be saved.'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Active clients</CardTitle>
        <CardDescription>
          How many clients {workspaceName || 'this workspace'} can have active at once. Paused and archived clients
          don’t count.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:w-56">
            <Label htmlFor="client-limit">Active client limit</Label>
            <Input
              id="client-limit"
              inputMode="numeric"
              value={draft}
              disabled={overviewQuery.isLoading || saveMutation.isPending}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Save limit
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={saveMutation.isPending}
                onClick={() => setDraft(String(current ?? ''))}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
        {/* Both catches said plainly: lowering pauses nobody, and a plan
            change replaces this with the plan's own figure. */}
        <p className="text-xs leading-5 text-muted-foreground">
          {draft.trim() && !valid
            ? <span className="text-destructive">Enter a whole number of clients between 0 and 10,000.</span>
            : 'Takes effect immediately. Lowering it doesn’t pause anyone; it only stops another client being made active. Changing plan resets it to that plan’s number.'}
        </p>
      </CardContent>
    </Card>
  )
}
