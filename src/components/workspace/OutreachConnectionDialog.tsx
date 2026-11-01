import { useEffect, useRef, useState } from 'react'
import { AlertCircle, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { campaignErrorGuidance, errorCode } from '@/lib/campaignErrorGuidance'
import { integrationProvider, integrationProviderLabel, OUTREACH_PROVIDERS, outreachProviderInfo } from '@/lib/outreachProviders'
import {
  connectWorkspaceInstantly,
  type OutreachProviderKind,
  type WorkspaceInstantlyIntegration,
} from '@/services/workspaceCampaigns'

interface OutreachConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  integration: WorkspaceInstantlyIntegration | null | undefined
  onConnected: (label: string) => Promise<void> | void
  onDisconnect: () => void
  disconnecting: boolean
}

interface ConnectError {
  title: string
  detail: string | null
}

const MIN_KEY_LENGTH = 20

/**
 * Connect, replace or remove the workspace's sending platform.
 *
 * One platform per workspace. The picker shows all three so an agency can see
 * what each supports before pasting a key; switching an already-connected
 * workspace is allowed here and refused by the server while campaigns are
 * mapped, with a message that says so.
 */
/** True when an https address carries a path, query or fragment beyond "/". */
const addressHasPath = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search !== '' || parsed.hash !== ''
  } catch {
    return false
  }
}

export const OutreachConnectionDialog = ({
  open,
  onOpenChange,
  workspaceId,
  integration,
  onConnected,
  onDisconnect,
  disconnecting,
}: OutreachConnectionDialogProps) => {
  const connectedKind = integration?.connected ? integrationProvider(integration) : null
  const [kind, setKind] = useState<OutreachProviderKind>(connectedKind ?? 'instantly')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(integration?.provider_base_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ConnectError | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const info = outreachProviderInfo(kind)
  const connectedLabel = integrationProviderLabel(integration)
  const switching = Boolean(connectedKind && connectedKind !== kind)

  // Each opening starts from what is connected, never from a half-typed key.
  useEffect(() => {
    if (!open) return
    setKind(connectedKind ?? 'instantly')
    setBaseUrl(integration?.provider_base_url ?? '')
    setApiKey('')
    setError(null)
  }, [open, connectedKind, integration?.provider_base_url])

  const selectProvider = (next: OutreachProviderKind) => {
    setKind(next)
    // A key pasted for one platform is never right for another, and the field
    // is masked, so it would otherwise go out unnoticed.
    setApiKey('')
    setError(null)
  }

  const trimmedUrl = baseUrl.trim()
  // What is wrong with the address, said before the server refuses it. The
  // server checks again; this only spares a round trip for the common slips.
  const urlProblem = !info.needsBaseUrl || trimmedUrl.length === 0
    ? null
    : !/^https:\/\//i.test(trimmedUrl)
      ? 'Start the address with https://.'
      : addressHasPath(trimmedUrl)
        ? 'Use only the address, without a path such as /dashboard.'
        : null
  const urlLooksWrong = urlProblem !== null
  const blockedReason = saving
    ? null
    : apiKey.trim().length < MIN_KEY_LENGTH
      ? 'Paste the full key to continue.'
      : info.needsBaseUrl && trimmedUrl.length <= 3
        ? 'Enter your Email Bison address to continue.'
        : urlProblem
  const canSave = !saving && blockedReason === null

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await connectWorkspaceInstantly(workspaceId, apiKey.trim(), {
        provider: kind,
        baseUrl: info.needsBaseUrl ? trimmedUrl : null,
      })
      // Cleared only once it worked: a rejected key stays so a typo can be fixed.
      setApiKey('')
      onOpenChange(false)
      await onConnected(info.label)
    } catch (caught) {
      const guidance = campaignErrorGuidance(errorCode(caught))
      const message = caught instanceof Error ? caught.message : `${info.label} could not be connected.`
      setError(guidance
        ? { title: guidance.title, detail: guidance.explanation === message ? null : `${guidance.explanation} ${message}` }
        : { title: `${info.label} could not be connected`, detail: message })
      keyRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>{integration?.connected ? `Manage ${connectedLabel} connection` : 'Connect your sending platform'}</DialogTitle>
          <DialogDescription>
            Campaigns, leads and mailboxes run through one sending platform per workspace. The key is verified, encrypted server-side, and never shown again.
          </DialogDescription>
        </DialogHeader>

        {integration?.connected && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-900">{connectedLabel} · {integration.provider_workspace_name}</p>
            <p className="mt-1 text-emerald-800">
              Key ending {integration.api_key_last_four} · {integration.active_account_count} active sender{integration.active_account_count === 1 ? '' : 's'}
              {integration.provider_base_url ? ` · ${integration.provider_base_url.replace(/^https:\/\//, '')}` : ''}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p id="outreach-provider-legend" className="text-sm font-medium">Sending platform</p>
          <RadioGroup
            value={kind}
            onValueChange={(value) => selectProvider(value as OutreachProviderKind)}
            aria-labelledby="outreach-provider-legend"
            className="grid gap-2 sm:grid-cols-3"
            disabled={saving}
          >
            {OUTREACH_PROVIDERS.map((provider) => {
              const selected = provider.kind === kind
              return (
                <Label
                  key={provider.kind}
                  htmlFor={`outreach-provider-${provider.kind}`}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-left font-normal transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/40'}`}
                >
                  <RadioGroupItem
                    id={`outreach-provider-${provider.kind}`}
                    value={provider.kind}
                    aria-describedby={`outreach-provider-${provider.kind}-desc`}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{provider.label}</span>
                    <span id={`outreach-provider-${provider.kind}-desc`} className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {provider.tagline}
                    </span>
                  </span>
                </Label>
              )
            })}
          </RadioGroup>
        </div>

        {switching && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Connecting {info.label} replaces {connectedLabel} for this whole workspace. It is refused while any client still has a {connectedLabel} campaign mapped or linked; unlink those first.
          </p>
        )}

        {info.needsBaseUrl && (
          <div className="space-y-2">
            <Label htmlFor="outreach-base-url">Email Bison address</Label>
            <Input
              id="outreach-base-url"
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://send.youragency.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={urlLooksWrong}
              aria-describedby="outreach-base-url-help"
              disabled={saving}
            />
            <p id="outreach-base-url-help" className={`text-xs leading-5 ${urlLooksWrong ? 'text-red-700' : 'text-muted-foreground'}`}>
              {urlProblem
                ?? 'The address you sign in to Email Bison at, starting with https://. Leave off any path.'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="outreach-api-key">{integration?.connected && !switching ? 'Replacement key' : info.keyLabel}</Label>
          <Input
            ref={keyRef}
            id="outreach-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void save() }}
            placeholder={info.keyPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'outreach-api-key-help outreach-connect-error' : 'outreach-api-key-help'}
            disabled={saving}
          />
          <p id="outreach-api-key-help" className="text-xs leading-5 text-muted-foreground">{info.keyHelp}</p>
        </div>

        {info.limitations.length > 0 && (
          <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <p className="font-medium text-foreground">What {info.label} does not support here</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {info.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </div>
        )}

        {error && (
          <div id="outreach-connect-error" role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div><p className="font-medium">{error.title}</p>{error.detail && <p className="mt-0.5 text-red-800">{error.detail}</p>}</div>
          </div>
        )}

        <div className="flex gap-3 rounded-xl border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>Staff can use the connected campaign tools, but only the workspace owner can replace or remove the credential.</p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="w-full sm:w-auto">
            {integration?.connected && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive sm:w-auto"
                    disabled={disconnecting || saving}
                  >
                    {disconnecting ? 'Removing…' : 'Disconnect'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect {connectedLabel}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the stored key immediately. Campaigns already running in {connectedLabel} keep sending until they are paused there or reconnected here.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep connected</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={disconnecting}
                      onClick={onDisconnect}
                    >
                      Remove key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="w-full sm:w-auto" disabled={!canSave} onClick={() => void save()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? `Verifying with ${info.label}…` : `Verify and connect ${info.label}`}
            </Button>
          </div>
        </DialogFooter>
        {blockedReason && <p className="-mt-2 text-right text-xs text-muted-foreground" aria-live="polite">{blockedReason}</p>}
      </DialogContent>
    </Dialog>
  )
}
