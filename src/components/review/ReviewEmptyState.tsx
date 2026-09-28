import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ReviewEmptyStateProps {
  icon: LucideIcon
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}

export const ReviewEmptyState = ({ icon: Icon, title, body, actionLabel, onAction }: ReviewEmptyStateProps) => (
  <Card className="mt-7 border-[#ded5ca] bg-white shadow-sm">
    <CardContent className="px-6 py-14 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0ebe3] text-[#8d6a55]">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 font-editorial text-2xl text-[#102033]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66727c]">{body}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          onClick={onAction}
          className="mt-5 min-h-11 rounded-full bg-[var(--campaign-primary)] px-5 text-[var(--campaign-primary-foreground)] hover:brightness-95"
        >
          {actionLabel}
        </Button>
      ) : null}
    </CardContent>
  </Card>
)
