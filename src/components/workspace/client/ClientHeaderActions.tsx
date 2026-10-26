import { Link } from 'react-router-dom'
import { Activity, BookOpenCheck, Megaphone, MoreHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ClientNextStep } from '@/lib/clientNextStep'

export interface ClientHeaderLink {
  label: string
  href: string
  icon: typeof Search
}

interface ClientHeaderActionsProps {
  nextStep: ClientNextStep
  nextStepHref: string
  onboardingHref: string
  pipelineHref: string
  campaignHref: string
  finderHref: string
}

/*
 * One primary action for where the client is, and everything else one click
 * away. The link the primary button already covers is left out of the menu.
 */
export const ClientHeaderActions = ({
  nextStep,
  nextStepHref,
  onboardingHref,
  pipelineHref,
  campaignHref,
  finderHref,
}: ClientHeaderActionsProps) => {
  const links: ClientHeaderLink[] = [
    { label: 'Onboarding', href: onboardingHref, icon: BookOpenCheck },
    { label: 'Pipeline', href: pipelineHref, icon: Activity },
    { label: 'Client Campaigns', href: campaignHref, icon: Megaphone },
    { label: 'Podcast Finder', href: finderHref, icon: Search },
  ].filter((link) => link.href !== nextStepHref)

  return (
    <div className="flex items-center gap-2">
      <Button asChild><Link to={nextStepHref}>{nextStep.label}</Link></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="More client actions">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {links.map(({ label, href, icon: Icon }) => (
            <DropdownMenuItem key={label} asChild>
              <Link to={href}><Icon className="mr-2 h-4 w-4" aria-hidden="true" />{label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
