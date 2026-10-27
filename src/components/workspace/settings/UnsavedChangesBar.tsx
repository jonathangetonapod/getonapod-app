import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UnsavedChangesBarProps {
  saving: boolean
  canSave: boolean
  onDiscard: () => void
  onSave: () => void
}

/**
 * Pinned to the foot of the screen while its section is in view and has
 * edits waiting. For the settings that only make sense together (colours and
 * logo), where saving each one as it changes would publish half a brand.
 */
export const UnsavedChangesBar = ({ saving, canSave, onDiscard, onSave }: UnsavedChangesBarProps) => (
  <div
    role="region"
    aria-label="Unsaved changes"
    className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
  >
    <p className="flex items-center gap-2 text-sm font-medium">
      <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
      Unsaved changes
    </p>
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onDiscard}>Discard</Button>
      <Button type="button" size="sm" disabled={saving || !canSave} onClick={onSave}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Save
      </Button>
    </div>
  </div>
)
