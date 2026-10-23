import { Link } from 'react-router-dom'
import { AlertCircle, Bot, Loader2, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CLIENT_SDR_PROFILE_FIELD_DEFINITIONS,
  type ClientSdrProfile,
} from '@/lib/clientSdrProfile'
import type { WorkspaceClient, WorkspaceClientSdrContext } from '@/services/clients'

interface ClientSdrContextPanelProps {
  context?: WorkspaceClientSdrContext
  loading: boolean
  error: Error | null
  client: WorkspaceClient
  baseHref: string
  onRetry: () => void
}

export const ClientSdrContextPanel = ({
  context,
  loading,
  error,
  client,
  baseHref,
  onRetry,
}: ClientSdrContextPanelProps) => {
  if (loading) {
    return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  }
  if (error || !context) {
    return (
      <div className="mx-auto flex min-h-96 max-w-lg flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-600" />
        <h2 className="mt-4 text-lg font-semibold">Reply brief unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error?.message || 'The client’s reply brief could not be loaded. Try again.'}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-5 lg:p-7">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{context.client_name} reply brief</h2>
              <Badge
                variant="outline"
                className={context.safe_to_draft
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'}
              >
                {context.client_status !== 'active'
                  ? `${context.client_status[0].toUpperCase()}${context.client_status.slice(1)} — drafting off`
                  : context.safe_to_draft
                    ? 'Ready for review drafts'
                    : `${context.readiness.completed_fields} of ${context.readiness.total_fields}`}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              This is the exact client context the inbox attaches once a reply is matched to {context.client_name}.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}?tab=ai-sdr`}><Bot className="mr-2 h-4 w-4" />Edit reply brief</Link>
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.map((field) => {
          const value = context.ai_sdr_profile[field.id as keyof ClientSdrProfile]
          return (
            <div key={field.id} className={`rounded-xl border p-3.5 text-left ${value ? 'bg-muted/10' : 'border-dashed bg-background'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{field.shortLabel}</p>
                {field.core && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Core</span>}
              </div>
              <p className={`mt-2 line-clamp-3 text-xs leading-5 ${value ? 'text-foreground/80' : 'italic text-muted-foreground'}`}>{value || 'Not set yet.'}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/10 px-4 py-3 text-left">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Delivery authority is off.</span>{' '}
          Loading this profile is read-only. Sending still requires a separate workspace-authorized action after a real conversation is connected.
        </p>
      </div>
    </div>
  )
}
