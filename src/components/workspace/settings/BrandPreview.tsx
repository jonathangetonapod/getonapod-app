import { Check } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableColor } from '@/lib/brandColor'

interface BrandPreviewProps {
  name: string
  primary: string
  accent: string
  logoUrl: string | null
  initials: string
}

const BrandMark = ({ logoUrl, initials, name }: Pick<BrandPreviewProps, 'logoUrl' | 'initials'> & { name: string }) => (
  <div className="flex min-w-0 items-center gap-3">
    {logoUrl ? (
      <span className="flex h-11 w-16 shrink-0 items-center justify-center p-1">
        <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    ) : (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-bold ring-1 ring-white/20">
        {initials}
      </span>
    )}
    <p className="truncate font-semibold">{name}</p>
  </div>
)

/** The shared dashboard a prospect or client opens: primary behind, accent on the call to action. */
const DashboardPreview = ({ name, primary, accent, logoUrl, initials }: BrandPreviewProps) => (
  <div
    className="relative min-h-80 overflow-hidden rounded-2xl border border-white/10 p-6 shadow-sm"
    style={{ background: `linear-gradient(135deg, ${primary} 0%, #102033 140%)`, color: readableColor(primary) }}
    aria-label="Client dashboard brand preview"
  >
    <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
    <div className="relative">
      <BrandMark logoUrl={logoUrl} initials={initials} name={name} />
      <p className="mt-0.5 pl-14 text-xs opacity-65">Private podcast campaign</p>
    </div>
    <div className="relative mt-10 max-w-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Prepared for your client</p>
      <p className="mt-3 text-2xl font-semibold leading-tight">The right rooms for their next big ideas.</p>
      <span
        className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-semibold shadow-sm"
        style={{ backgroundColor: accent, color: readableColor(accent) }}
      >
        Review top matches
      </span>
    </div>
  </div>
)

/**
 * The intake a client fills in. The real one draws its header from dark to
 * the accent and marks progress and the next step in the accent, so this
 * does the same at a glance rather than rendering a whole template.
 */
const OnboardingPreview = ({ name, accent, logoUrl, initials }: BrandPreviewProps) => (
  <div className="overflow-hidden rounded-2xl border border-border/70 bg-white text-slate-900 shadow-sm" aria-label="Onboarding brand preview">
    <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, #111827 0%, ${accent} 100%)` }}>
      <BrandMark logoUrl={logoUrl} initials={initials} name={name} />
    </div>
    <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}99, ${accent}55)` }} />
    <div className="space-y-4 p-5">
      <p className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: accent }}>Section 1</p>
      <p className="text-lg font-bold">Tell us about your expertise</p>
      <div className="space-y-2">
        {['Leadership', 'Growth marketing'].map((option, index) => (
          <div key={option} className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2.5 text-sm">
            <span
              className="flex h-4 w-4 items-center justify-center rounded border"
              style={index === 0 ? { backgroundColor: accent, borderColor: accent, color: readableColor(accent) } : undefined}
            >
              {index === 0 && <Check className="h-3 w-3" />}
            </span>
            {option}
          </div>
        ))}
      </div>
      <span
        className="inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: accent, color: readableColor(accent) }}
      >
        Continue
      </span>
    </div>
  </div>
)

/**
 * What a client will see, beside the controls that change it. An email
 * preview would be a follow-up: the email copy lives in the n8n workflow,
 * not here, so this page has nothing true to draw it from.
 */
export const BrandPreview = (props: BrandPreviewProps) => (
  <Tabs defaultValue="dashboard">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium text-muted-foreground">Live preview</p>
      <TabsList className="h-8">
        <TabsTrigger value="dashboard" className="h-6 px-2.5 text-xs">Client dashboard</TabsTrigger>
        <TabsTrigger value="onboarding" className="h-6 px-2.5 text-xs">Onboarding</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="dashboard" className="mt-0"><DashboardPreview {...props} /></TabsContent>
    <TabsContent value="onboarding" className="mt-0"><OnboardingPreview {...props} /></TabsContent>
  </Tabs>
)
