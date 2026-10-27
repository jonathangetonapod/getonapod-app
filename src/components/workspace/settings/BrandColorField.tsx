import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { contrastRatio, MIN_TEXT_CONTRAST, normalizeHexColor } from '@/lib/brandColor'
import { notACredentialField } from '@/lib/formAutofill'

interface BrandColorFieldProps {
  id: string
  label: string
  /** What the person typed, which may not be a colour yet. */
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

/**
 * A colour typed or picked. Accepts what people paste (with or without the
 * #, three digits or six) and shows it back in the stored form once the
 * field loses focus. White text is what the portal and the buttons put on
 * these colours, so a colour too light for it says so here, not after a
 * client squints at it.
 */
export const BrandColorField = ({ id, label, value, disabled, onChange }: BrandColorFieldProps) => {
  // Half a colour is normal while typing one; it is wrong only once the
  // person moves on.
  const [editing, setEditing] = useState(false)
  const normalized = normalizeHexColor(value)
  const invalid = !normalized && !editing
  const ratio = normalized ? contrastRatio('#FFFFFF', normalized) : null
  const lowContrast = ratio !== null && ratio < MIN_TEXT_CONTRAST
  const errorId = `${id}-error`
  const warningId = `${id}-contrast`

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 gap-2">
        <Input
          aria-label={`${label} picker`}
          type="color"
          value={normalized ?? '#0D1B2A'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 shrink-0 cursor-pointer p-1"
        />
        <Input
          id={id}
          {...notACredentialField}
          value={value}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false)
            if (normalized && normalized !== value) onChange(normalized)
          }}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : lowContrast ? warningId : undefined}
          className="min-w-0 flex-1 font-mono uppercase"
        />
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">Enter a hex color, like #2B4C7E.</p>
      ) : lowContrast ? (
        <p id={warningId} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Text on this color may be hard to read. White text scores {ratio.toFixed(1)}:1; aim for {MIN_TEXT_CONTRAST}:1.</span>
        </p>
      ) : null}
    </div>
  )
}
