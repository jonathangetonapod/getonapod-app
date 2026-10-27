import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BrandColorField } from '@/components/workspace/settings/BrandColorField'
import { BrandPreview } from '@/components/workspace/settings/BrandPreview'
import { FieldSaveError, FieldSaveStatus } from '@/components/workspace/settings/FieldSaveStatus'
import { UnsavedChangesBar } from '@/components/workspace/settings/UnsavedChangesBar'
import { useAutoSaveField } from '@/components/workspace/settings/useAutoSaveField'
import { normalizeHexColor, readableColor } from '@/lib/brandColor'
import { notACredentialField } from '@/lib/formAutofill'
import { bookingLinkFromPaste, schedulerName } from '@/lib/schedulerEmbed'
import { cn } from '@/lib/utils'
import { WORKSPACE_LOGO_MIME_TYPES } from '@/lib/workspaceLogo'
import {
  removeWorkspaceLogo,
  updateWorkspaceBookingLink,
  updateWorkspaceClientBranding,
  updateWorkspaceLogo,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

interface ClientBrandingSectionProps {
  workspaceId: string
  view: WorkspaceStaffView
  canManageBranding: boolean
  canManageClientBranding: boolean
  /** The address offered when the reply-to is empty. */
  ownerEmail: string | null
  logoUrl: string | null
  workspaceInitials: string
  /** Reload the page's data after a brand or booking-link save. */
  onSaved: () => Promise<void>
  /** Reload the shell as well, which draws the logo. */
  onLogoChanged: () => Promise<void>
  /** Whether anything here would be lost by leaving the page. */
  onUnsavedChange: (unsaved: boolean) => void
}

interface SavedBrand {
  name: string
  primary: string
  accent: string
  updatedAt: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const trim = (value: string) => value.trim()
const COLOR_FIELDS = [
  { key: 'primary' as const, id: 'client_brand_primary_color', label: 'Primary color' },
  { key: 'accent' as const, id: 'client_brand_accent_color', label: 'Accent color' },
]

export const ClientBrandingSection = ({
  workspaceId,
  view,
  canManageBranding,
  canManageClientBranding,
  ownerEmail,
  logoUrl,
  workspaceInitials,
  onSaved,
  onLogoChanged,
  onUnsavedChange,
}: ClientBrandingSectionProps) => {
  const workspace = view.workspace
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoRemoveOpen, setLogoRemoveOpen] = useState(false)

  /*
   * Agency name, reply-to and both colours are one record on the server,
   * saved with the timestamp it was read at so a stale tab cannot overwrite
   * a newer save. Each field now saves on its own, so saves run one after
   * another, each sending the values the last one left (not this page's
   * drafts of the other fields) and the timestamp it returned.
   */
  const savedBrandRef = useRef<SavedBrand>({
    name: workspace.client_brand_name,
    primary: workspace.client_brand_primary_color,
    accent: workspace.client_brand_accent_color,
    updatedAt: workspace.client_brand_updated_at ?? '',
  })
  useEffect(() => {
    const serverAt = Date.parse(workspace.client_brand_updated_at ?? '')
    if (!(serverAt >= Date.parse(savedBrandRef.current.updatedAt || '0'))) return
    savedBrandRef.current = {
      name: workspace.client_brand_name,
      primary: workspace.client_brand_primary_color,
      accent: workspace.client_brand_accent_color,
      updatedAt: workspace.client_brand_updated_at ?? '',
    }
  }, [workspace.client_brand_name, workspace.client_brand_primary_color, workspace.client_brand_accent_color, workspace.client_brand_updated_at])

  const brandQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const saveBrand = (patch: Partial<Omit<SavedBrand, 'updatedAt'>> & { email?: string }) => {
    const run = brandQueueRef.current.catch(() => undefined).then(async () => {
      const base = savedBrandRef.current
      if (!canManageClientBranding || !base.updatedAt) {
        throw new Error('Client-facing branding controls are not available yet.')
      }
      const result = await updateWorkspaceClientBranding(workspaceId, {
        client_brand_name: patch.name ?? base.name,
        client_brand_primary_color: patch.primary ?? base.primary,
        client_brand_accent_color: patch.accent ?? base.accent,
        client_contact_email: patch.email,
        expected_brand_updated_at: base.updatedAt,
      })
      savedBrandRef.current = {
        name: result.client_brand_name,
        primary: result.client_brand_primary_color,
        accent: result.client_brand_accent_color,
        updatedAt: result.client_brand_updated_at,
      }
    })
    brandQueueRef.current = run
    return run.then(() => { void onSaved() })
  }

  const agencyName = useAutoSaveField({
    serverValue: workspace.client_brand_name,
    normalize: trim,
    validate: (value) => (value ? null : 'Enter the name your clients see.'),
    save: (value) => saveBrand({ name: value }),
  })
  const replyTo = useAutoSaveField({
    serverValue: workspace.client_contact_email ?? '',
    normalize: trim,
    validate: (value) => (!value || EMAIL_PATTERN.test(value) ? null : 'Enter a full email address, like hello@youragency.com.'),
    save: (value) => saveBrand({ email: value }),
  })
  const bookingLink = useAutoSaveField({
    serverValue: workspace.booking_embed_url ?? '',
    // Copying "embed code" from a scheduler gives a block of script, not a
    // URL, so the link is taken out of whatever was pasted.
    normalize: (value) => bookingLinkFromPaste(value) ?? value.trim(),
    validate: (value) => (!value || bookingLinkFromPaste(value)
      ? null
      : 'No booking link found in that. Paste the scheduler address, or the embed code it gives you.'),
    save: async (value) => {
      await updateWorkspaceBookingLink(workspaceId, value || null)
      void onSaved()
    },
  })
  const bookingLinkResolved = bookingLinkFromPaste(bookingLink.value)
  const bookingProvider = schedulerName(bookingLinkResolved)

  // Colours and logo save together from the bar: a brand half-published is
  // worse than one not yet changed.
  const serverColors = { primary: workspace.client_brand_primary_color, accent: workspace.client_brand_accent_color }
  const [colors, setColors] = useState(serverColors)
  const lastServerColorsRef = useRef(`${serverColors.primary}${serverColors.accent}`)
  useEffect(() => {
    const key = `${workspace.client_brand_primary_color}${workspace.client_brand_accent_color}`
    if (key === lastServerColorsRef.current) return
    lastServerColorsRef.current = key
    setColors({ primary: workspace.client_brand_primary_color, accent: workspace.client_brand_accent_color })
  }, [workspace.client_brand_primary_color, workspace.client_brand_accent_color])
  // The fields hold what was typed; the preview and the save use the colour
  // it means, or the saved one while it means none yet.
  const primary = normalizeHexColor(colors.primary)
  const accent = normalizeHexColor(colors.accent)
  const colorsDirty = primary !== serverColors.primary || accent !== serverColors.accent
  const colorsValid = primary !== null && accent !== null
  const shownPrimary = primary ?? serverColors.primary
  const shownAccent = accent ?? serverColors.accent

  // A chosen logo waits for Save, shown in the preview meanwhile.
  const [pendingLogo, setPendingLogo] = useState<{ file: File; url: string } | null>(null)
  useEffect(() => () => { if (pendingLogo) URL.revokeObjectURL(pendingLogo.url) }, [pendingLogo])
  const shownLogoUrl = pendingLogo?.url ?? logoUrl

  const brandDirty = colorsDirty || pendingLogo !== null
  const unsaved = brandDirty || agencyName.unsaved || replyTo.unsaved || bookingLink.unsaved
  useEffect(() => { onUnsavedChange(unsaved) }, [onUnsavedChange, unsaved])

  const discard = () => {
    setColors(serverColors)
    setPendingLogo(null)
  }

  const saveBarMutation = useMutation({
    mutationFn: async () => {
      if (colorsDirty) {
        if (!primary || !accent) throw new Error('Enter both colors as hex values, like #2B4C7E.')
        await saveBrand({ primary, accent })
      }
      if (pendingLogo) {
        if (!canManageBranding) throw new Error('You do not have permission to update workspace branding.')
        await updateWorkspaceLogo(workspaceId, pendingLogo.file, workspace.logo_path)
        setPendingLogo(null)
        await onLogoChanged()
      }
    },
    onSuccess: () => toast.success('Client branding saved.'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Client branding could not be saved.'),
  })

  const removeLogoMutation = useMutation({
    mutationFn: () => {
      if (!workspace.logo_path || !canManageBranding) throw new Error('The workspace logo is unavailable.')
      return removeWorkspaceLogo(workspaceId, workspace.logo_path)
    },
    onSuccess: async () => {
      setLogoRemoveOpen(false)
      await onLogoChanged()
      toast.success('Workspace logo removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace logo could not be removed.'),
  })

  const replyToMissing = !replyTo.value.trim()
  const busy = saveBarMutation.isPending
  const fieldsDisabled = !canManageClientBranding

  return (
    <>
      {/* Form and preview side by side once there is room for both (the app
          sidebar and the section menu take 460px first), the preview pinned
          while the form scrolls past it; stacked, preview second, below
          that. Two panels rather than one card: the card's overflow-hidden,
          there for its rounded corners, would have stopped the preview
          sticking. */}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
          <CardContent className="min-w-0 p-0">
            <div className="min-w-0 space-y-6 p-6 sm:p-7">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="client-brand-name">Agency name shown to clients</Label>
                  <FieldSaveStatus status={agencyName.status} />
                </div>
                <Input
                  id="client-brand-name"
                  {...notACredentialField}
                  maxLength={120}
                  value={agencyName.value}
                  disabled={fieldsDisabled}
                  onChange={(event) => agencyName.setValue(event.target.value)}
                  onBlur={agencyName.onBlur}
                  placeholder={workspace.name}
                  aria-invalid={agencyName.error ? true : undefined}
                  aria-describedby={agencyName.error ? 'client-brand-name-error' : undefined}
                />
                <FieldSaveError id="client-brand-name-error" error={agencyName.error} />
                <p className="text-xs text-muted-foreground">The name your clients recognize, shown on their dashboards, onboarding and portal.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="client-contact-email">Email clients reply to</Label>
                  <FieldSaveStatus status={replyTo.status} />
                </div>
                <Input
                  id="client-contact-email"
                  {...notACredentialField}
                  type="email"
                  maxLength={254}
                  value={replyTo.value}
                  disabled={fieldsDisabled}
                  onChange={(event) => replyTo.setValue(event.target.value)}
                  onBlur={replyTo.onBlur}
                  placeholder="hello@youragency.com"
                  aria-invalid={replyToMissing || replyTo.error ? true : undefined}
                  aria-describedby={replyTo.error ? 'client-contact-email-error' : replyToMissing ? 'client-contact-email-warning' : undefined}
                  className={cn(replyToMissing && 'border-amber-500 focus-visible:ring-amber-500')}
                />
                <FieldSaveError id="client-contact-email-error" error={replyTo.error} />
                {/* Every client email takes its reply-to from here and sends
                    none when it is empty, so the field says so and offers
                    the owner's address. */}
                {replyToMissing ? (
                  <div
                    id="client-contact-email-warning"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Replies to your client emails go nowhere until you add an address.
                    </span>
                    {ownerEmail && canManageClientBranding && (
                      <button
                        type="button"
                        className="font-medium text-foreground underline underline-offset-2"
                        onClick={() => replyTo.setAndSave(ownerEmail)}
                      >
                        Use {ownerEmail}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Set as the reply-to on intake invitations, reminders, shortlist and booking emails, so a client who replies reaches you.</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="workspace-booking-link">Booking link or embed code</Label>
                  <FieldSaveStatus status={bookingLink.status} />
                </div>
                {/* A textarea because "embed code" is a block of script, and
                    that is what a scheduler puts on the clipboard. */}
                <Textarea
                  id="workspace-booking-link"
                  {...notACredentialField}
                  rows={2}
                  maxLength={6_000}
                  value={bookingLink.value}
                  disabled={fieldsDisabled}
                  onChange={(event) => bookingLink.setValue(event.target.value)}
                  onBlur={bookingLink.onBlur}
                  placeholder="https://calendly.com/your-agency/intro or paste the whole embed snippet"
                  className="font-mono text-xs"
                  aria-invalid={bookingLink.error ? true : undefined}
                  aria-describedby={bookingLink.error ? 'workspace-booking-link-error' : undefined}
                />
                <FieldSaveError id="workspace-booking-link-error" error={bookingLink.error} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Which scheduler it is, said back, so a wrong paste is
                      caught here and not by a prospect. */}
                  <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">
                    {bookingLinkResolved && !bookingLink.error
                      ? bookingProvider
                        ? `${bookingProvider} link detected. It loads inline on prospect dashboards.`
                        : 'Link detected. It opens in a new tab from prospect dashboards.'
                      : 'Prospects without their own call-to-action will see this booking link.'}
                  </p>
                  {bookingLinkResolved && !bookingLink.error && (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <a href={bookingLinkResolved} target="_blank" rel="noopener noreferrer">
                        Test link<ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {/* Named for what they do, not where they sit in a palette:
                    "primary" and "accent" mean nothing until you know which
                    one moves. */}
                <p className="text-xs leading-5 text-muted-foreground">
                  Primary is the solid colour behind headers and buttons on a client&rsquo;s pages. Accent
                  marks the active item — the current tab, a selected row. The live preview updates as
                  you change them.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {COLOR_FIELDS.map((field) => (
                    <BrandColorField
                      key={field.key}
                      id={field.id}
                      label={field.label}
                      value={colors[field.key]}
                      disabled={fieldsDisabled || busy}
                      onChange={(value) => setColors((current) => ({ ...current, [field.key]: value }))}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-border/70 pt-6">
                <div>
                  <p className="font-semibold">Agency logo</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">PNG, JPEG, or WebP up to 2 MB. Recommended: square, at least 256×256px.</p>
                </div>
                <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                  {/* On the primary color, which is what it sits on in the
                      client's header, so a dark logo on a dark brand shows
                      up here first. */}
                  <span
                    data-testid="workspace-logo-on-primary"
                    className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl p-3 shadow-sm"
                    style={{ backgroundColor: shownPrimary, color: readableColor(shownPrimary) }}
                  >
                    {shownLogoUrl
                      ? <img src={shownLogoUrl} alt={`${workspace.name} logo`} className="max-h-full max-w-full object-contain" />
                      : <span className="text-lg font-bold">{workspaceInitials}</span>}
                  </span>
                  <div className="min-w-0 space-y-3">
                    {/* A native input, not the styled one: Input's h-10 w-full
                        survive sr-only through tailwind-merge, and the
                        absolutely positioned 774px field stretched the
                        document past the viewport. */}
                    <input
                      ref={logoInputRef}
                      id="workspace-logo"
                      aria-label="Workspace logo file"
                      type="file"
                      className="sr-only"
                      accept={WORKSPACE_LOGO_MIME_TYPES.join(',')}
                      disabled={!canManageBranding || busy || removeLogoMutation.isPending}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        if (file) setPendingLogo({ file, url: URL.createObjectURL(file) })
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canManageBranding || busy || removeLogoMutation.isPending}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {shownLogoUrl ? 'Replace logo' : 'Upload logo'}
                      </Button>
                      {pendingLogo ? (
                        // Not saved yet, so nothing is lost: no confirmation.
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPendingLogo(null)}>
                          Undo new logo
                        </Button>
                      ) : workspace.logo_path && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={!canManageBranding || busy || removeLogoMutation.isPending}
                          onClick={() => setLogoRemoveOpen(true)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />Remove logo
                        </Button>
                      )}
                    </div>
                    {!canManageBranding && (
                      <p className="text-sm text-muted-foreground">Logo controls are not available for your role.</p>
                    )}
                  </div>
                </div>
              </div>

              {!canManageClientBranding ? (
                <p className="text-sm text-muted-foreground">Client-facing brand controls are not available for your role.</p>
              ) : null}
            </div>

          </CardContent>
        </Card>

        <div className="min-w-0 rounded-xl border border-border/70 bg-muted/25 p-4 sm:p-5 xl:sticky xl:top-28">
          <BrandPreview
            name={agencyName.value.trim() || workspace.name}
            primary={shownPrimary}
            accent={shownAccent}
            logoUrl={shownLogoUrl}
            initials={workspaceInitials}
          />
        </div>
      </div>
      {brandDirty && (
        <UnsavedChangesBar
          saving={busy}
          canSave={colorsValid && (canManageClientBranding || !colorsDirty)}
          onDiscard={discard}
          onSave={() => saveBarMutation.mutate()}
        />
      )}

      <AlertDialog
        open={logoRemoveOpen}
        onOpenChange={(open) => !removeLogoMutation.isPending && setLogoRemoveOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove workspace logo?</AlertDialogTitle>
            <AlertDialogDescription>
              Client dashboards, onboarding and the sidebar show your initials until you upload a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeLogoMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeLogoMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                removeLogoMutation.mutate()
              }}
            >
              {removeLogoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove logo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
