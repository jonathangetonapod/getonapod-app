import { Check, Loader2 } from 'lucide-react'
import type { AutoSaveStatus } from '@/components/workspace/settings/useAutoSaveField'

/**
 * "Saving…" then "Saved", beside a field's label. Errors are not shown here:
 * they go under the field, where the thing to fix is.
 */
export const FieldSaveStatus = ({ status }: { status: AutoSaveStatus }) => (
  <span aria-live="polite" className="inline-flex min-h-5 items-center text-xs text-muted-foreground">
    {status === 'saving' && (
      <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />Saving…</>
    )}
    {status === 'saved' && (
      <span className="inline-flex items-center text-emerald-700 dark:text-emerald-400">
        <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Saved
      </span>
    )}
  </span>
)

export const FieldSaveError = ({ id, error }: { id: string; error: string | null }) => (
  error ? <p id={id} role="alert" className="text-xs text-destructive">{error}</p> : null
)
