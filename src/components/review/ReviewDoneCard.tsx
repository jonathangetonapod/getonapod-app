import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'

interface ReviewDoneCardProps {
  total: number
  picks: number
  brandName: string
  /** Replaces the default "You have reviewed all N shows" heading. */
  title?: string
  /** A call to action under the copy, such as a booking button. */
  children?: ReactNode
}

/*
 * The last decision is a state of the page, not a toast that disappears. This
 * card sits where the list starts and says what happens next.
 */
export const ReviewDoneCard = ({ total, picks, brandName, title, children }: ReviewDoneCardProps) => (
  <div
    role="status"
    className="mt-7 rounded-3xl border border-[#9ab4a7] bg-[#edf4ef] px-6 py-6 shadow-sm sm:px-8"
  >
    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#476b59]">
      <CheckCircle2 className="h-4 w-4" />
      Done for now
    </p>
    <h3 className="mt-2 font-editorial text-2xl text-[#102033] sm:text-3xl">
      {title ?? `You have reviewed all ${total} shows`}
    </h3>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4f5f5a] sm:text-base">
      {brandName} will start outreach on your {picks} {picks === 1 ? 'pick' : 'picks'}.
      There is nothing to submit. You will hear from us when the first host replies.
    </p>
    {children ? <div className="mt-5">{children}</div> : null}
  </div>
)
