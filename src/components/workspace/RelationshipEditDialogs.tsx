import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** yyyy-mm-dd for a date input, in local time. */
function dateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

interface SnoozeUntilDialogProps {
  title: string | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  /** The row wakes at local midnight at the start of this date. */
  onSave: (wakeAt: Date) => void
}

/** "Snooze until…": park a row until a date of the operator's choosing. */
export const SnoozeUntilDialog = ({ title, saving, onOpenChange, onSave }: SnoozeUntilDialogProps) => {
  const tomorrow = new Date(Date.now() + 86_400_000)
  const [date, setDate] = useState(dateInputValue(tomorrow))
  useEffect(() => {
    if (title) setDate(dateInputValue(new Date(Date.now() + 7 * 86_400_000)))
  }, [title])
  const wakeAt = date ? new Date(`${date}T00:00:00`) : null
  const valid = Boolean(wakeAt && !Number.isNaN(wakeAt.getTime()) && wakeAt.getTime() > Date.now())

  return (
    <Dialog open={Boolean(title)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (valid && wakeAt) onSave(wakeAt)
          }}
        >
          <DialogHeader>
            <DialogTitle>Snooze {title}</DialogTitle>
            <DialogDescription>
              It stays in the list but leaves Needs attention and Follow-up overdue until this date.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="relationship-snooze-date">Snooze until</Label>
            <Input
              id="relationship-snooze-date"
              type="date"
              value={date}
              min={dateInputValue(tomorrow)}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Snooze
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface ShowDetails {
  podcastName: string
  hostName: string
  contactEmail: string
}

interface EditShowDetailsDialogProps {
  /** The details being edited, or null when the dialog is closed. */
  initial: ShowDetails | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (details: ShowDetails) => void
}

/** "Edit show details…": the show, its host and the address we write to. */
export const EditShowDetailsDialog = ({ initial, saving, onOpenChange, onSave }: EditShowDetailsDialogProps) => {
  const [details, setDetails] = useState<ShowDetails>({ podcastName: '', hostName: '', contactEmail: '' })
  useEffect(() => {
    if (initial) setDetails(initial)
  }, [initial])
  const set = (key: keyof ShowDetails) => (event: { target: { value: string } }) => (
    setDetails((current) => ({ ...current, [key]: event.target.value }))
  )
  // A row needs a show or an address to stay findable, as when it was added.
  const valid = Boolean(details.podcastName.trim() || details.contactEmail.trim())

  return (
    <Dialog open={Boolean(initial)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) onSave(details)
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit show details</DialogTitle>
            <DialogDescription>Fix the show name, the host, or the address you reach them at.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-relationship-show">Show name</Label>
              <Input id="edit-relationship-show" value={details.podcastName} onChange={set('podcastName')} maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-relationship-host">Host name</Label>
              <Input id="edit-relationship-host" value={details.hostName} onChange={set('hostName')} maxLength={300} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-relationship-email">Host email</Label>
              <Input
                id="edit-relationship-email"
                type="email"
                value={details.contactEmail}
                onChange={set('contactEmail')}
                maxLength={254}
              />
            </div>
          </div>
          {!valid && <p className="mt-3 text-xs text-muted-foreground">Keep a show name or a host email.</p>}
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
