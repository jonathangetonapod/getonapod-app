import { BarChart3, CalendarCheck, Check, Globe, Info, Sparkles, Star, Target, TrendingUp, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useReviewBrandStyle } from '@/components/review/reviewBrand'

interface AudienceEstimatesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SOURCES = [
  { icon: BarChart3, label: 'Chart rankings' },
  { icon: Star, label: 'Review volume' },
  { icon: Users, label: 'Social following' },
  { icon: TrendingUp, label: 'Engagement signals' },
  { icon: Target, label: 'Category performance' },
  { icon: CalendarCheck, label: 'Publishing frequency' },
]

const STEPS = [
  'Audience estimates combine public chart, review, social, and publishing signals from major podcast platforms.',
  'Our models compare those signals with shows whose performance is already known.',
  'Known audience figures are used as benchmarks whenever they are available.',
]

const USES = [
  'Identify high-reach podcast opportunities',
  'Compare shows within similar categories',
  'Balance audience relevance with potential reach',
  'Track growth trends over time',
]

/** What the listener numbers mean, where they come from, and how to use them. */
export const AudienceEstimatesSheet = ({ open, onOpenChange }: AudienceEstimatesSheetProps) => {
  const brandStyle = useReviewBrandStyle()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full overflow-hidden border-l-[#ded5ca] bg-[#fbf8f3] p-0 sm:!max-w-lg" style={brandStyle}>
        <div className="flex h-full flex-col">
          <div className="border-b border-[#ded5ca] bg-[var(--campaign-primary)] p-6 text-[var(--campaign-primary-foreground)]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-editorial text-2xl text-[var(--campaign-primary-foreground)]">
                <BarChart3 className="h-5 w-5 text-[var(--campaign-accent)]" />
                Understanding the estimates
              </SheetTitle>
            </SheetHeader>
            <p className="mt-2 text-sm opacity-70">What the numbers mean, where they come from, and how to use them.</p>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              <div className="rounded-2xl border border-[#d8dfda] bg-[#edf4ef] p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[#668b78]/15 p-2">
                    <Info className="h-5 w-5 text-[#476b59]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#355745]">Directional, responsibly labeled</p>
                    <p className="mt-1 text-sm leading-6 text-[#557164]">
                      Audience numbers are <span className="font-medium">estimated listeners per episode</span>. They are most useful for comparing opportunities, not as exact download counts.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-[#102033]">
                  <Globe className="h-4 w-4 text-[var(--campaign-accent)]" />
                  Data sources
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {SOURCES.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 rounded-xl border border-[#e5ded5] bg-white p-2.5 text-sm text-[#344455]">
                      <item.icon className="h-4 w-4 shrink-0 text-[var(--campaign-accent)]" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-[#102033]">
                  <Sparkles className="h-4 w-4 text-[var(--campaign-accent)]" />
                  How it works
                </h3>
                <ol className="space-y-3">
                  {STEPS.map((text, index) => (
                    <li key={text} className="flex gap-3">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#f0ebe3] text-xs font-bold text-[#7b685a]">{index + 1}</span>
                      <p className="text-sm text-[#5f6b76]">{text}</p>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-[#102033]">
                  <Target className="h-4 w-4 text-[var(--campaign-accent)]" />
                  What these numbers help with
                </h3>
                <ul className="space-y-2">
                  {USES.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[#5f6b76]">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#668b78]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Important:</span> Only a podcast publisher can see exact downloads. Treat these figures as directional benchmarks alongside topic fit, host style, and guest quality.
                </p>
              </div>
            </div>
          </ScrollArea>

          <div className="border-t border-[#ded5ca] bg-white p-4">
            <Button
              type="button"
              className="min-h-12 w-full rounded-xl bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
