import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, Copy, ExternalLink, Eye, ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import ClientOnboardingPreview from '@/components/onboarding/ClientOnboardingPreview'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_ONBOARDING_ACCENT, renderOnboardingBrandText } from '@/lib/onboardingBrand'
import type {
  OnboardingClientOption,
  OnboardingInvitationResult,
  OnboardingTemplate,
  StartOnboardingInput,
  WorkspaceOnboardingData,
} from '@/services/workspaceOnboarding'

const NEW_CLIENT = 'new'

interface StartForm {
  template_id: string
  client_choice: string
  client_name: string
  recipient_name: string
  recipient_email: string
  expires_in_days: string
  assigned_membership_ids: string[]
  send_email: boolean
  experience_title: string
  experience_body: string
  experience_completion_message: string
  accent_color: string
  logo_file: File | null
}

export interface CreatedIntake {
  result: OnboardingInvitationResult
  emailRequested: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: WorkspaceOnboardingData
  publishedTemplates: OnboardingTemplate[]
  clients: OnboardingClientOption[]
  clientsLoading: boolean
  /** Preselected when the dialog opens: a row's Send intake, or the working client. */
  initialClientId: string | null
  workspaceBaseHref: string
  agencyLogoUrl: string | null
  submitting: boolean
  /** fillIn: create without emailing and open the form for the operator to complete. */
  onSubmit: (input: StartOnboardingInput, fillIn: boolean) => void
  created: CreatedIntake | null
  onDone: () => void
}

// Named so a screen reader announces a colour rather than a hex code.
const ACCENT_PRESETS = [
  { color: '#665CF2', name: 'Violet' },
  { color: '#2563EB', name: 'Blue' },
  { color: '#0F766E', name: 'Teal' },
  { color: '#C2410C', name: 'Orange' },
  { color: '#BE185D', name: 'Pink' },
  { color: '#334155', name: 'Slate' },
] as const

/*
 * The agency's own accent from Settings when it has one. Every template
 * change used to reset this to the platform violet, so an agency that had
 * already chosen its colour had to pick it again for every client.
 */
function experienceFromTemplate(template: OnboardingTemplate | undefined, workspaceName: string, agencyAccent: string | null) {
  return {
    experience_title: renderOnboardingBrandText(template?.definition.intro_title ?? 'Welcome', workspaceName),
    experience_body: renderOnboardingBrandText(
      template?.definition.intro_body ?? 'Please share a few details so we can prepare your profile.',
      workspaceName,
    ),
    experience_completion_message: renderOnboardingBrandText(
      template?.definition.completion_message
        ?? `Thank you. ${workspaceName || 'Our team'} will review your answers within 2 business days and follow up if anything needs clarification.`,
      workspaceName,
    ),
    accent_color: agencyAccent ?? DEFAULT_ONBOARDING_ACCENT,
  }
}

function clientFields(client: OnboardingClientOption | undefined) {
  if (!client) return { client_choice: NEW_CLIENT, client_name: '', recipient_name: '', recipient_email: '' }
  return {
    client_choice: client.id,
    client_name: client.name,
    recipient_name: client.contact_person || client.name,
    recipient_email: client.email || '',
  }
}

function expiryDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const NewIntakeDialog = ({
  open,
  onOpenChange,
  data,
  publishedTemplates,
  clients,
  clientsLoading,
  initialClientId,
  workspaceBaseHref,
  agencyLogoUrl,
  submitting,
  onSubmit,
  created,
  onDone,
}: Props) => {
  const agencyAccent = data.workspace.client_brand_accent_color
  const emailConfigured = data.email_delivery.configured !== false
  const [form, setForm] = useState<StartForm | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [brandingOpen, setBrandingOpen] = useState(false)
  const [choosingTemplate, setChoosingTemplate] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // One per opening, sent with every attempt from it, so a retry after a lost
  // response cannot create a second intake.
  const startKeyRef = useRef('')

  // The reset reads the lists through a ref so a background refetch while the
  // dialog is open cannot wipe what the operator typed.
  const sourceRef = useRef({ data, publishedTemplates, clients, initialClientId })
  sourceRef.current = { data, publishedTemplates, clients, initialClientId }
  useEffect(() => {
    if (!open) return
    const { data, publishedTemplates, clients, initialClientId } = sourceRef.current
    startKeyRef.current = crypto.randomUUID()
    const defaultTemplate = publishedTemplates.find((template) => template.is_default) ?? publishedTemplates[0]
    const client = clients.find((candidate) => candidate.id === initialClientId)
    setLogoPreviewUrl(null)
    setBrandingOpen(false)
    setChoosingTemplate(false)
    setPreviewOpen(false)
    setForm({
      template_id: defaultTemplate?.id ?? '',
      // Nothing chosen yet when there are clients to choose from: client
      // comes first, and a silent "new client" default hid that list.
      ...(client ? clientFields(client) : { ...clientFields(undefined), client_choice: clients.length ? '' : NEW_CLIENT }),
      expires_in_days: '14',
      assigned_membership_ids: [],
      send_email: data.email_delivery.configured !== false,
      logo_file: null,
      ...experienceFromTemplate(defaultTemplate, data.workspace.name, data.workspace.client_brand_accent_color),
    })
  }, [open])

  // Clients load when the dialog opens, so a preselected client may arrive
  // after it. Fill it in then, unless the operator has already chosen.
  useEffect(() => {
    if (!open || clientsLoading || !initialClientId) return
    const client = sourceRef.current.clients.find((candidate) => candidate.id === initialClientId)
    if (!client) return
    setForm((current) => current && (current.client_choice === '' || (current.client_choice === NEW_CLIENT && !current.client_name.trim() && !current.recipient_email.trim()))
      ? { ...current, ...clientFields(client) }
      : current)
  }, [clientsLoading, initialClientId, open])

  const selectedTemplate = useMemo(
    () => publishedTemplates.find((template) => template.id === form?.template_id),
    [form?.template_id, publishedTemplates],
  )
  const templateDefaults = useMemo(
    () => experienceFromTemplate(selectedTemplate, data.workspace.name, agencyAccent),
    [agencyAccent, data.workspace.name, selectedTemplate],
  )

  if (!form) return null

  const update = (patch: Partial<StartForm>) => setForm((current) => current ? { ...current, ...patch } : current)
  const customized = Boolean(form.logo_file)
    || form.experience_title !== templateDefaults.experience_title
    || form.experience_body !== templateDefaults.experience_body
    || form.experience_completion_message !== templateDefaults.experience_completion_message
    || form.accent_color !== templateDefaults.accent_color
  const expiry = Number(form.expires_in_days)
  const expiryValid = Number.isSafeInteger(expiry) && expiry >= 1 && expiry <= 90
  const sendEmail = form.send_email && emailConfigured
  const firstName = form.recipient_name.trim().split(/\s+/u)[0]
  const typedEmail = form.recipient_email.trim().toLowerCase()
  const duplicateClient = form.client_choice === NEW_CLIENT && typedEmail
    ? clients.find((client) => client.email?.trim().toLowerCase() === typedEmail) ?? null
    : null
  const accentSwatches = agencyAccent && !ACCENT_PRESETS.some((preset) => preset.color === agencyAccent)
    ? [{ color: agencyAccent, name: 'Your brand' }, ...ACCENT_PRESETS]
    : ACCENT_PRESETS

  const chooseClient = (choice: string) => {
    setLogoPreviewUrl(null)
    if (choice === NEW_CLIENT) {
      update({ ...clientFields(undefined), logo_file: null })
      return
    }
    const client = clients.find((candidate) => candidate.id === choice)
    if (client) update({ ...clientFields(client), logo_file: null })
  }

  const chooseTemplate = (templateId: string) => {
    const template = publishedTemplates.find((candidate) => candidate.id === templateId)
    update({ template_id: templateId, ...experienceFromTemplate(template, data.workspace.name, agencyAccent) })
  }

  const chooseLogo = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 2_097_152) {
      toast.error('Choose a PNG, JPEG, or WebP logo up to 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => toast.error('The logo preview could not be opened.')
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setLogoPreviewUrl(reader.result)
      update({ logo_file: file })
    }
    reader.readAsDataURL(file)
  }

  const submit = (fillIn = false) => {
    if (!form.client_choice) {
      toast.error('Choose a client, or add a new one.')
      return
    }
    if (!form.template_id || !form.recipient_name.trim() || !form.recipient_email.trim()) {
      toast.error('Enter the contact name and email.')
      return
    }
    if (!expiryValid) {
      toast.error('Link expiry must be between 1 and 90 days.')
      return
    }
    if (form.client_choice === NEW_CLIENT && !form.client_name.trim()) {
      toast.error('Enter the new client name.')
      return
    }
    if (!form.experience_title.trim() || !form.experience_body.trim() || !form.experience_completion_message.trim()) {
      setBrandingOpen(true)
      toast.error('Complete the welcome and completion messages.')
      return
    }
    onSubmit({
      template_id: form.template_id,
      client_id: form.client_choice === NEW_CLIENT ? null : form.client_choice,
      new_client: form.client_choice === NEW_CLIENT
        ? { name: form.client_name, email: form.recipient_email, contact_person: form.recipient_name }
        : null,
      recipient_name: form.recipient_name,
      recipient_email: form.recipient_email,
      expires_in_days: expiry,
      assigned_membership_ids: form.assigned_membership_ids,
      send_email: fillIn ? false : sendEmail,
      idempotency_key: startKeyRef.current || undefined,
      experience: {
        intro_title: form.experience_title,
        intro_body: form.experience_body,
        completion_message: form.experience_completion_message,
        accent_color: form.accent_color,
        logo_file: form.logo_file,
      },
    }, fillIn)
  }

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied.')
    } catch {
      toast.error('Copy failed. Select and copy the link manually.')
    }
  }

  if (created) {
    const { result, emailRequested } = created
    const delivery = result.delivery
    const previewHref = `${result.onboarding_url}${result.onboarding_url.includes('?') ? '&' : '?'}preview=staff`
    const expires = new Date(result.instance.capability_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) onDone() }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />Intake link created</DialogTitle>
            <DialogDescription>{result.instance.client_name} · {result.instance.template_name} v{result.instance.template_version} · expires {expires}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input aria-label="Private intake link" readOnly value={result.onboarding_url} onFocus={(event) => event.currentTarget.select()} />
              <Button variant="outline" onClick={() => void copyLink(result.onboarding_url)}><Copy className="mr-2 h-4 w-4" />Copy</Button>
            </div>
            {delivery.status === 'sent' && <p className="text-sm text-emerald-800" role="status">Invitation emailed to {result.instance.recipient_email}</p>}
            {emailRequested && delivery.status === 'failed' && <p className="text-sm text-amber-800" role="alert">The invitation email could not be delivered. Share the link yourself.</p>}
            {emailRequested && delivery.status === 'skipped' && <p className="text-sm text-amber-800" role="alert">No email was sent. Share the link yourself.</p>}
            {emailRequested && delivery.status === 'unknown' && <p className="text-sm text-amber-800" role="alert">Email delivery is unknown. Check delivery before sending another message.</p>}
            <p className="text-xs text-muted-foreground">Anyone with this link can complete this client’s intake until it expires or is revoked.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" asChild><a href={previewHref} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Fill in the form</a></Button>
            <Button onClick={onDone}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const definition = selectedTemplate ? {
    ...(selectedTemplate.published_definition ?? selectedTemplate.definition),
    intro_title: form.experience_title,
    intro_body: form.experience_body,
    completion_message: form.experience_completion_message,
  } : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-[96vw]">
        <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
          <DialogTitle>New intake</DialogTitle>
          <DialogDescription>Pick the client, then send them a private link to the form, or fill it in for them.</DialogDescription>
        </DialogHeader>

        {/* Each pane scrolls itself on wide screens. The preview is inert so
            tabbing from the last field reaches the footer, not 28 preview
            inputs. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="min-w-0 space-y-6 px-6 py-5 lg:w-[480px] lg:shrink-0 lg:overflow-y-auto">
            <section className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="start-client">Client</Label>
                <Select value={form.client_choice} onValueChange={chooseClient} disabled={clientsLoading}>
                  <SelectTrigger id="start-client"><SelectValue placeholder={clientsLoading ? 'Loading clients…' : 'Choose a client'} /></SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}{client.email ? ` · ${client.email}` : ''}</SelectItem>)}
                    {clients.length > 0 && <SelectSeparator />}
                    <SelectItem value={NEW_CLIENT}>Add a new client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.client_choice === NEW_CLIENT && (
                <div className="space-y-2"><Label htmlFor="new-client-name">Client or company name</Label><Input id="new-client-name" placeholder="Acme Company" value={form.client_name} onChange={(event) => update({ client_name: event.target.value })} /></div>
              )}
              {form.client_choice && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="recipient-name">Contact name</Label><Input id="recipient-name" placeholder="Jane Smith" value={form.recipient_name} onChange={(event) => update({ recipient_name: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="recipient-email">Contact email</Label><Input id="recipient-email" type="email" placeholder="jane@example.com" value={form.recipient_email} onChange={(event) => update({ recipient_email: event.target.value })} /></div>
                </div>
              )}
              {duplicateClient && (
                <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                  {duplicateClient.name} already uses this email.
                  <button type="button" className="font-medium underline underline-offset-2" onClick={() => chooseClient(duplicateClient.id)}>Use {duplicateClient.name} instead</button>
                </p>
              )}
            </section>

            <section className="space-y-1.5">
              {publishedTemplates.length === 1 && !choosingTemplate && selectedTemplate ? (
                <p className="text-sm">
                  <span className="font-medium">Form:</span> {selectedTemplate.name} v{selectedTemplate.published_version}{selectedTemplate.is_default ? ' (default)' : ''}{' '}
                  <button type="button" className="ml-1 font-medium text-primary underline-offset-2 hover:underline" onClick={() => setChoosingTemplate(true)}>Change</button>
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="start-template">Form</Label>
                  <Select value={form.template_id} onValueChange={chooseTemplate}>
                    <SelectTrigger id="start-template"><SelectValue placeholder="Choose a published form" /></SelectTrigger>
                    <SelectContent>{publishedTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} v{template.published_version}{template.is_default ? ' (default)' : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Questions stay pinned to this version. Publishing a new version later does not change this link.</p>
            </section>

            <section className="space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sendEmail} disabled={!emailConfigured} onCheckedChange={(checked) => update({ send_email: checked === true })} />
                  <span>Email the invitation to {firstName || form.recipient_email.trim() || 'the client'}</span>
                </label>
                {!emailConfigured ? (
                  <p className="pl-6 text-xs text-amber-800">Email sending is not set up, so you will share the link yourself after creating it.</p>
                ) : sendEmail && !data.workspace.client_contact_email ? (
                  <p className="pl-6 text-xs text-muted-foreground">Replies will not reach you until you <Link className="font-medium text-foreground underline underline-offset-2" to={`${workspaceBaseHref}/settings#client-contact-email`}>add a reply-to email</Link>.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry-days">Link expires</Label>
                <div className="flex items-center gap-3">
                  <Input id="expiry-days" type="number" min={1} max={90} className="w-24" value={form.expires_in_days} onChange={(event) => update({ expires_in_days: event.target.value })} />
                  <span className="text-sm text-muted-foreground">{expiryValid ? `${expiry} days (${expiryDate(expiry)})` : 'Between 1 and 90 days'}</span>
                </div>
              </div>
              {data.assignable_members.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium leading-none">Let these teammates view it</legend>
                  <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{data.assignable_members.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.assigned_membership_ids.includes(member.id)} onCheckedChange={(checked) => update({ assigned_membership_ids: checked === true ? [...form.assigned_membership_ids, member.id] : form.assigned_membership_ids.filter((id) => id !== member.id) })} />
                      <span>{member.full_name || member.email}</span>
                    </label>
                  ))}</div>
                </fieldset>
              )}
            </section>

            <section className="rounded-lg border">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-medium">{customized ? 'Branding: customized for this client' : 'Branding: workspace defaults'}</p>
                <Button type="button" variant="ghost" size="sm" aria-expanded={brandingOpen} aria-controls="intake-branding" onClick={() => setBrandingOpen((current) => !current)}>
                  {brandingOpen ? 'Hide' : 'Customize'}<ChevronDown className={`ml-1 h-4 w-4 transition-transform ${brandingOpen ? 'rotate-180' : ''}`} />
                </Button>
              </div>
              {brandingOpen && (
                <div id="intake-branding" className="space-y-4 border-t px-4 py-4">
                  {!data.workspace.logo_path && !form.logo_file && (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      Clients will see {data.workspace.name || 'your workspace name'} with no logo. <Link className="font-medium text-foreground underline underline-offset-2" to={`${workspaceBaseHref}/settings#client-branding`}>Add your logo in Settings</Link>, or upload one for this link below.
                    </p>
                  )}
                  <div className="space-y-2"><Label htmlFor="experience-title">Welcome title</Label><Input id="experience-title" maxLength={300} value={form.experience_title} onChange={(event) => update({ experience_title: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="experience-body">Welcome message</Label><Textarea id="experience-body" rows={4} maxLength={3000} value={form.experience_body} onChange={(event) => update({ experience_body: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="experience-completion">Completion message</Label><Textarea id="experience-completion" rows={3} maxLength={2000} value={form.experience_completion_message} onChange={(event) => update({ experience_completion_message: event.target.value })} /></div>
                  <fieldset className="space-y-2"><legend className="text-sm font-medium leading-none">Accent color</legend><div className="flex flex-wrap items-center gap-2">{accentSwatches.map(({ color, name }) => <button key={color} type="button" aria-label={`${name} accent`} title={`${name} (${color})`} aria-pressed={form.accent_color === color} className="h-8 w-8 rounded-full border-2 border-background shadow ring-ring ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2" style={{ backgroundColor: color, boxShadow: form.accent_color === color ? `0 0 0 2px ${color}` : undefined }} onClick={() => update({ accent_color: color })} />)}<Input aria-label="Custom accent color" type="color" value={form.accent_color} className="h-9 w-12 cursor-pointer p-1" onChange={(event) => update({ accent_color: event.target.value.toUpperCase() })} /></div></fieldset>
                  {/* The file input is visually hidden, so its focus is shown
                      on the button-styled label that follows it. */}
                  <div className="space-y-2"><Label htmlFor="client-onboarding-logo">Client logo override</Label><div className="flex flex-wrap items-center gap-2"><input id="client-onboarding-logo" type="file" accept="image/png,image/jpeg,image/webp" className="peer sr-only" onChange={(event) => { chooseLogo(event.target.files?.[0]); event.currentTarget.value = '' }} /><Button type="button" variant="outline" size="sm" asChild><label htmlFor="client-onboarding-logo" className="cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"><ImagePlus className="mr-2 h-4 w-4" />{form.logo_file ? 'Replace logo' : 'Upload logo'}</label></Button>{form.logo_file && <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoPreviewUrl(null); update({ logo_file: null }) }}><X className="mr-1 h-4 w-4" />Use agency logo</Button>}</div><p className="text-xs text-muted-foreground">PNG, JPEG, or WebP up to 2 MB. Leave empty to use {data.workspace.name}’s logo.</p></div>
                </div>
              )}
            </section>

            <Button type="button" variant="outline" size="sm" className="lg:hidden" aria-expanded={previewOpen} onClick={() => setPreviewOpen((current) => !current)}>
              <Eye className="mr-2 h-4 w-4" />{previewOpen ? 'Hide preview' : 'Show preview'}
            </Button>
          </div>

          <aside
            aria-label="Preview"
            className={`min-w-0 flex-1 border-t bg-muted/20 px-6 py-5 lg:block lg:overflow-y-auto lg:border-l lg:border-t-0 ${previewOpen ? 'block' : 'hidden'}`}
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            {/* inert keeps every preview input out of the tab order. */}
            <div {...({ inert: '' } as Record<string, string>)} aria-hidden="true">
              {definition && selectedTemplate ? (
                <ClientOnboardingPreview
                  key={selectedTemplate.id}
                  definition={definition}
                  workspaceName={data.workspace.name}
                  workspaceLogoUrl={logoPreviewUrl || agencyLogoUrl}
                  accentColor={form.accent_color}
                  recipientName={form.recipient_name}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Choose a form to preview it.</p>
              )}
            </div>
          </aside>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {/* Nothing is emailed: the operator completes the form in a new tab. */}
            <Button variant="outline" disabled={submitting} onClick={() => submit(true)}>Fill it in myself</Button>
            <Button disabled={submitting} onClick={() => submit()}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{sendEmail ? 'Create link and send' : 'Create link'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default NewIntakeDialog
