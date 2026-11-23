import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { AiStepTestState } from '@/components/workspace/useAiStepTests'

interface AiStepTestStatusProps {
  test?: AiStepTestState
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** One step's test outcome, under its label. Nothing until the step is tested. */
export const AiStepTestStatus = ({ test }: AiStepTestStatusProps) => {
  if (!test) return null
  if (test.status === 'running') {
    return <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Testing…</p>
  }
  if (test.status === 'error' || !test.result) {
    return <p className="mt-1 text-xs text-destructive" role="status">Test could not run: {test.error}</p>
  }
  const { ok, model, ms, detail } = test.result
  return ok ? (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400" role="status">
      <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Works on {model} · {seconds(ms)}<span className="block text-muted-foreground">{detail}</span></span>
    </p>
  ) : (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive" role="status">
      <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Doesn't work on {model}: {detail}</span>
    </p>
  )
}
