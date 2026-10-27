import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, Trash2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AiKeyProvider } from '@/lib/aiKeyUsage'
import { notACredentialField } from '@/lib/formAutofill'
import { plural } from '@/lib/plural'
import {
  testWorkspaceAiKey,
  type WorkspaceAiKeyStatus,
  type WorkspaceAiKeyTestResult,
} from '@/services/workspaceStaff'

export interface AiKeyProviderInfo {
  id: AiKeyProvider
  label: string
  /** What the provider's keys start with, for showing a saved one masked. */
  keyPrefix: string
  usedFor: string
  /** The work it pays for, as it reads after "credits on". */
  workName: string
  consoleUrl: string
}

interface AiKeyRowProps {
  workspaceId: string
  provider: AiKeyProviderInfo
  status: WorkspaceAiKeyStatus | null
  /** Platform credits this month on work this key would pay for. */
  creditsThisMonth: number
  busy: boolean
  saving: boolean
  onSave: (apiKey: string) => Promise<void>
  onRemove: () => void
}

type TestOutcome = WorkspaceAiKeyTestResult | 'unavailable'

const TEST_COPY: Record<TestOutcome, string> = {
  valid: 'Valid. The provider accepted this key.',
  invalid: 'Invalid. The provider rejected this key. Replace it, or remove it to use platform credits.',
  unreachable: 'The provider did not answer, so the key could not be checked. Try again in a minute.',
  unavailable: 'Testing a saved key is not available yet.',
}

/**
 * One provider's key. A saved key shows masked with Replace, Test and Remove,
 * not an empty box that reads as if nothing were saved; the box appears to
 * replace it. Every change is still an explicit save: these are credentials.
 */
export const AiKeyRow = ({
  workspaceId,
  provider,
  status,
  creditsThisMonth,
  busy,
  saving,
  onSave,
  onRemove,
}: AiKeyRowProps) => {
  const configured = status?.configured === true
  const [replacing, setReplacing] = useState(false)
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const editing = !configured || replacing
  const inputId = `ai-key-${provider.id}`

  const testMutation = useMutation({
    mutationFn: () => testWorkspaceAiKey(workspaceId, provider.id),
    onMutate: () => setOutcome(null),
    onSuccess: (result) => setOutcome(result),
    // A server without the test action yet answers INVALID_ACTION; anything
    // else is a failure to ask, not an answer about the key.
    onError: (error) => setOutcome((error as { code?: string }).code === 'INVALID_ACTION' ? 'unavailable' : 'unreachable'),
  })

  const save = async () => {
    await onSave(draft.trim())
    setDraft('')
    setReplacing(false)
    setRevealed(false)
    setOutcome(null)
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{provider.label}</p>
        {configured
          ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Your key</Badge>
          : <Badge variant="outline">Using platform credits</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {provider.usedFor}{' '}
        <a
          href={provider.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          Get a key<ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
      {!configured && creditsThisMonth > 0 && (
        <p className="text-sm">
          Used {plural(creditsThisMonth, 'platform credit')} on {provider.workName} this month.
        </p>
      )}

      {configured && !replacing && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm" aria-label={`Saved ${provider.label} key`}>
            {provider.keyPrefix}…{status?.last_four ?? '????'}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setReplacing(true)}>Replace</Button>
            <Button type="button" variant="outline" disabled={busy || testMutation.isPending} onClick={() => testMutation.mutate()}>
              {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Test key
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onRemove}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Remove
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Label htmlFor={inputId} className="sr-only">{provider.label} API key</Label>
            {/* A provider key, not this person's password: kept out of
                password managers so they neither fill nor save it. */}
            <Input
              id={inputId}
              type={revealed ? 'text' : 'password'}
              {...notACredentialField}
              spellCheck={false}
              placeholder={`${provider.keyPrefix}…`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
              className="pr-10 font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-10 w-10 text-muted-foreground"
              aria-label={revealed ? `Hide ${provider.label} key` : `Show ${provider.label} key`}
              aria-pressed={revealed}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Button type="button" disabled={busy || !draft.trim()} onClick={() => void save().catch(() => undefined)}>
            {saving ? 'Verifying…' : 'Save key'}
          </Button>
          {replacing && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setReplacing(false)
                setDraft('')
                setRevealed(false)
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {outcome && configured && !replacing && (
        <p
          role="status"
          className={outcome === 'valid'
            ? 'flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400'
            : outcome === 'invalid'
              ? 'flex items-start gap-1.5 text-sm text-destructive'
              : 'flex items-start gap-1.5 text-sm text-muted-foreground'}
        >
          {outcome === 'valid'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            : outcome === 'invalid' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          {TEST_COPY[outcome]}
        </p>
      )}
    </div>
  )
}
