import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { insideRecoveryWindow } from '@/components/workspace/agencies/ownerStatus'
import { daysFromNow, formatDate, formatRelativeDays } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { listDeletedWorkspaces, type DeletedAdminWorkspace } from '@/services/adminWorkspaces'
import { restoreWorkspace } from '@/services/workspaceDeletion'

interface WorkspaceRecoveryCardProps {
  /** The closed workspace's owner email, from their revoked membership. */
  ownerEmailFor?: (workspaceId: string) => string | null
}

/**
 * Closed workspaces, and the only way to bring one back.
 *
 * Closing revokes the owner's access in the same statement that marks the
 * workspace, so the person who did it cannot sign in to undo it. Every recovery
 * request therefore arrives here, by email, from somebody who cannot show you
 * the thing they are asking about, which is why this lists what is still
 * recoverable and how long is left, rather than waiting to be asked.
 *
 * An empty list is the normal state and says so; a queue of rows here would be
 * the unusual thing.
 */
export function WorkspaceRecoveryCard({ ownerEmailFor }: WorkspaceRecoveryCardProps = {}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<DeletedAdminWorkspace | null>(null)

  const deletedQuery = useQuery({
    queryKey: ['platform', 'deleted-workspaces'],
    queryFn: listDeletedWorkspaces,
    retry: false,
  })

  const restore = useMutation({
    mutationFn: (workspace: DeletedAdminWorkspace) => restoreWorkspace(workspace.id),
    onSuccess: async (_result, workspace) => {
      await queryClient.invalidateQueries({ queryKey: ['platform', 'deleted-workspaces'] })
      await queryClient.invalidateQueries({ queryKey: ['platform', 'workspace-users'] })
      setConfirming(null)
      toast.success(`${workspace.name} is restored. Its owner can sign in.`)
    },
    onError: (error) => {
      // Worth showing as given: past the window the answer is a flat no, and
      // saying so plainly is better than a generic failure the reader will
      // assume is retryable.
      toast.error(error instanceof Error ? error.message : 'The workspace could not be restored.')
    },
  })

  const rows = useMemo(
    () => (deletedQuery.data || []).filter((workspace) => insideRecoveryWindow(workspace)).sort((left, right) => {
      const leftDue = left.purge_after || ''
      const rightDue = right.purge_after || ''
      return leftDue.localeCompare(rightDue)
    }),
    [deletedQuery.data],
  )

  return (
    <div className="space-y-4">
      {deletedQuery.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading closed workspaces…
        </p>
      ) : deletedQuery.isError ? (
        <p className="py-6 text-sm text-destructive" role="alert">
          {deletedQuery.error instanceof Error
            ? deletedQuery.error.message
            : 'Closed workspaces could not be loaded.'}
        </p>
      ) : rows.length === 0 ? (
        <div className="py-2">
          <p className="text-sm font-medium">No closed workspaces.</p>
          <p className="text-sm text-muted-foreground">Closed workspaces stay here for 30 days, then they are deleted.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Closed workspaces stay here for 30 days, then they are deleted.</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Closed on</TableHead>
                  <TableHead>Deletes on</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((workspace) => {
                  const left = formatRelativeDays(workspace.purge_after)
                  const remaining = daysFromNow(workspace.purge_after)
                  const urgent = remaining !== null && remaining <= 3
                  return (
                    <TableRow key={workspace.id}>
                      <TableCell>
                        <p className="font-semibold">{workspace.name}</p>
                        <p className="text-xs text-muted-foreground">{ownerEmailFor?.(workspace.id) || workspace.slug}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(workspace.deleted_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {formatDate(workspace.purge_after)}
                        {left && <span className={cn('ml-2 text-muted-foreground', urgent && 'font-medium text-destructive')}>in {left}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => setConfirming(workspace)}>
                          <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog
        open={Boolean(confirming)}
        onOpenChange={(open) => { if (!open && !restore.isPending) setConfirming(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {confirming?.name}?</DialogTitle>
            <DialogDescription>
              The workspace opens again and its owner can sign in. Its subscription and its sending
              accounts ended when it closed, so those have to be set up again.
            </DialogDescription>
          </DialogHeader>
          {confirming?.deletion_reason && (
            <p className="text-sm"><span className="text-muted-foreground">Reason given when it closed: </span>{confirming.deletion_reason}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={restore.isPending}>
              Cancel
            </Button>
            <Button
              disabled={restore.isPending}
              onClick={() => confirming && restore.mutate(confirming)}
            >
              {restore.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
