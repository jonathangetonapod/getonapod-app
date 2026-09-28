import { useState } from 'react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { ArrowRight, ChevronLeft, ChevronRight, ListChecks, MousePointerClick, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useReviewBrandStyle } from '@/components/review/reviewBrand'

interface ReviewTutorialProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandName: string
}

/*
 * Three steps and no more, none of which opens on its own. The page explains
 * itself; this waits behind "How it works" for anyone who wants it.
 */
export const ReviewTutorial = ({ open, onOpenChange, brandName }: ReviewTutorialProps) => {
  const brandStyle = useReviewBrandStyle()
  const [step, setStep] = useState(0)

  const steps = [
    {
      icon: MousePointerClick,
      iconClass: 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)]',
      title: 'Open a show to see why it fits',
      body: 'Every card says why the show made your list. Open it for the audience, the recent episodes, and what you could talk about.',
    },
    {
      icon: ListChecks,
      iconClass: 'bg-[#668b78] text-white',
      title: 'Mark it Interested or Not a fit',
      body: 'One tap on each show. Not a fit is as useful as Interested; it sharpens the next set. Add a note if there is something your team should know.',
    },
    {
      icon: Rocket,
      iconClass: 'bg-[var(--campaign-accent)] text-[var(--campaign-accent-foreground)]',
      title: `${brandName} pitches the shows you picked`,
      body: 'There is nothing to submit. Your picks go straight to outreach, and you hear from us when the first host replies.',
    },
  ]
  const last = steps.length - 1
  const current = steps[Math.min(step, last)]

  const close = () => {
    onOpenChange(false)
    setStep(0)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-[28px] border-[#ded5ca] bg-[#fbf8f3] p-0" style={brandStyle}>
        <VisuallyHidden>
          <DialogTitle>How this works</DialogTitle>
          <DialogDescription>A short introduction to reviewing and choosing podcast opportunities.</DialogDescription>
        </VisuallyHidden>

        <div className="relative">
          <div className="p-5 text-center sm:p-8">
            <div className={cn('mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl sm:mb-4 sm:h-16 sm:w-16', current.iconClass)}>
              <current.icon className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h2 className="mb-2 font-editorial text-2xl text-[#102033] sm:text-3xl">{current.title}</h2>
            <p className="text-sm text-[#5f6b76] sm:text-base">{current.body}</p>
          </div>

          <div className="flex justify-center gap-2 pb-4">
            {steps.map((entry, position) => (
              <button
                key={entry.title}
                type="button"
                aria-label={`Go to step ${position + 1}`}
                onClick={() => setStep(position)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  step === position ? 'w-6 bg-[var(--campaign-primary)]' : 'w-2 bg-[#102033]/25 hover:bg-[#102033]/45',
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#e3dbd2] bg-[#f4efe8] p-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
              className="min-h-11 gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {step < last ? (
                <>
                  <Button type="button" variant="ghost" onClick={close} className="min-h-11 text-[#66727c]">
                    Skip
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setStep((value) => Math.min(last, value + 1))}
                    className="min-h-11 gap-1 bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={close} className="min-h-11 gap-1 bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95">
                  Start reviewing
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
