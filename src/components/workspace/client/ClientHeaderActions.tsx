import { Link } from 'react-router-dom'
import { Activity, BookOpenCheck, Megaphone, MoreHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  /** The four required host brief sections are approved. */
  briefReady: boolean
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
  briefReady,
}: ClientHeaderActionsProps) => {
  const links: ClientHeaderLink[] = [
    { label: 'Onboarding', href: onboardingHref, icon: BookOpenCheck },
    { label: 'Pipeline', href: pipelineHref, icon: Activity },
    { label: 'Client Campaigns', href: campaignHref, icon: Megaphone },
    { label: 'Podcast Finder', href: finderHref, icon: Search },
  ].filter((link) => link.href !== nextStepHref)

  // A shortlist built before the brief is ready is researched against
  // unapproved context. It stays one click away, only no longer the lead.
  const briefPending = nextStep.action === 'build_shortlist' && !briefReady

  return (
    <div className="flex items-center gap-2">
      {briefPending ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="outline"><Link to={nextStepHref}>{nextStep.label}</Link></Button>
          </TooltipTrigger>
          <TooltipContent>Finish the host brief first</TooltipContent>
        </Tooltip>
      ) : (
        <Button asChild><Link to={nextStepHref}>{nextStep.label}</Link></Button>
      )}
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
