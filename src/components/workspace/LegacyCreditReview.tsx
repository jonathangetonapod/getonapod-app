import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PLATFORM_SUPPORT_EMAIL } from '@/lib/config'
import { getLegacyCreditOverview, listLegacyCreditReviews, requestLegacyCreditReview, updateLegacyCreditReview } from '@/services/workspaceStaff'

interface LegacyCreditReviewProps { workspaceId: string; admin?: boolean }

export function LegacyCreditReview({ workspaceId, admin = false }: LegacyCreditReviewProps) {
  // Approval and the resolution draft belong to one workspace and permission
  // context. Never carry them into another tenant's review.
  return <LegacyCreditReviewPanel key={`${workspaceId}:${admin}`} workspaceId={workspaceId} admin={admin} />
}

function LegacyCreditReviewPanel({ workspaceId, admin = false }: LegacyCreditReviewProps) {
  const client = useQueryClient()
  const key = ['legacy-credit-review', workspaceId]
  const query = useQuery({ queryKey: key, queryFn: () => getLegacyCreditOverview(workspaceId), enabled: Boolean(workspaceId), retry: false })
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useMutation({
    mutationFn: (status: 'request' | 'reviewing' | 'resolved') => status === 'request'
      ? requestLegacyCreditReview(workspaceId) : updateLegacyCreditReview(workspaceId, status, note.trim()),
    onSuccess: (data) => {
      client.setQueryData(key, data)
      void client.invalidateQueries({ queryKey: ['legacy-credit-review-queue'] })
      setNote(''); setConfirmed(false)
      toast.success('Balance review updated. No payment was moved by this action.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The review could not be saved.'),
  })
  if (query.isLoading) return <p role="status" className="text-xs text-muted-foreground">Checking historical purchases…</p>
  if (query.isError) return <div className="rounded-xl border p-4 text-sm" role="alert"><p>Your historical purchased balance could not be loaded.</p><Button variant="link" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry balance history</Button></div>
  const data = query.data
  if (!data || data.purchased_remaining === 0 && !data.review) return null
  const review = data.review
  return <Card><CardContent className="space-y-4 p-6">
    <div><h2 className="font-semibold">Previous credit purchases</h2><p className="mt-2 text-sm text-muted-foreground">{data.purchased_remaining.toLocaleString()} unspent purchased credits remain in your historical records. These are separate from your subscription and provider balances.</p></div>
    <p className="text-sm text-muted-foreground">We review previous purchases individually. No refund or subscription credit is applied automatically.</p>
    {review ? <div className="rounded-lg bg-muted/50 p-4 text-sm" role="status"><p className="font-medium">{review.status === 'requested' ? 'Review requested' : review.status === 'reviewing' ? 'Review in progress' : 'Review completed'}</p>{review.resolution_note && <p className="mt-2 whitespace-pre-wrap">{review.resolution_note}</p>}</div>
      : <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate('request')}>{mutation.isPending ? 'Requesting…' : 'Request a balance review'}</Button>}
    {admin && review && review.status !== 'resolved' && <div className="space-y-3 border-t pt-4">
      {review.status === 'requested' && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate('reviewing')}>Start review</Button>}
      <Label htmlFor="credit-review-note">Outcome shared with the workspace</Label>
      <Textarea id="credit-review-note" maxLength={1000} value={note} onChange={(event) => { setNote(event.target.value); setConfirmed(false) }} placeholder="Record the verified outcome and relevant reference. Do not include private payment details." disabled={mutation.isPending} />
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={mutation.isPending} /><span>I verified the outcome, including any refund or subscription credit, separately. This action only records the review.</span></label>
      <Button disabled={mutation.isPending || !confirmed || note.trim().length < 10} onClick={() => mutation.mutate('resolved')}>Record completed review</Button>
    </div>}
    <a className="inline-block text-sm text-primary underline underline-offset-4" href={`mailto:${PLATFORM_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Purchased credit review — ${workspaceId}`)}`}>Contact billing support</a>
  </CardContent></Card>
}

export function LegacyCreditReviewQueue({ workspaceId }: { workspaceId: string }) {
  const query = useQuery({ queryKey: ['legacy-credit-review-queue', workspaceId], queryFn: () => listLegacyCreditReviews(workspaceId), enabled: Boolean(workspaceId), retry: false })
  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">Loading purchased-credit reviews…</p>
  if (query.isError) return <p className="text-sm text-destructive" role="alert">Credit review requests could not be loaded. <button className="underline" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry reviews</button></p>
  if (!query.data?.length) return null
  return <Card><CardContent className="space-y-3 p-6"><h2 className="font-semibold">Purchased-credit reviews</h2><p className="text-sm text-muted-foreground">Requests needing manual reconciliation. Completing a review does not move money.</p><ul className="divide-y">{query.data.map((review) => <li key={review.workspace_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><Link to={`/app/platform/billing/${review.workspace_id}`} className="font-medium text-primary underline underline-offset-4">{review.workspace_name}</Link><span className="text-sm text-muted-foreground">{review.purchased_remaining_at_request.toLocaleString()} purchased credits · {review.status === 'requested' ? 'Requested' : 'In review'}</span></li>)}</ul></CardContent></Card>
}
