import type { LucideIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { SECTION_NAV_STATE } from '@/components/workspace/settings/useActiveSection'

export interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
}

export interface SettingsSectionGroup {
  label: string
  sections: SettingsSection[]
}

interface SettingsSectionNavProps {
  groups: SettingsSectionGroup[]
  activeId: string | null
  onSelect: (id: string) => void
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
)

/**
 * One menu, laid out twice by CSS: a sticky column with its group names on a
 * desktop, a sticky row of tabs that scrolls sideways on a phone. One element
 * rather than two, so a screen reader meets the menu once.
 */
export const SettingsSectionNav = ({ groups, activeId, onSelect }: SettingsSectionNavProps) => {
  const navigate = useNavigate()
  const location = useLocation()

  const goTo = (id: string) => {
    const section = document.getElementById(id)
    if (!section) return
    onSelect(id)
    section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    // The heading takes focus so a keyboard user carries on from the
    // section they chose, not from the top of the menu.
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    navigate(
      { pathname: location.pathname, search: location.search, hash: `#${id}` },
      { replace: true, state: SECTION_NAV_STATE },
    )
  }

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        // Phone: a full-bleed tab row under the app header.
        'sticky top-20 z-10 -mx-4 overflow-x-auto border-b border-border/70 bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6',
        // Desktop: a column beside the content, under the app header.
        'lg:top-28 lg:mx-0 lg:overflow-visible lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none',
      )}
    >
      <div className="flex w-max gap-1 py-2 lg:w-auto lg:flex-col lg:gap-5 lg:py-0">
        {groups.map((group) => (
          <div key={group.label} className="flex gap-1 lg:flex-col">
            <p className="hidden px-3 pb-1 text-xs font-medium text-muted-foreground lg:block">{group.label}</p>
            {group.sections.map((section) => {
              const Icon = section.icon
              const active = section.id === activeId
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={active ? 'location' : undefined}
                  onClick={(event) => {
                    event.preventDefault()
                    goTo(section.id)
                  }}
                  className={cn(
                    'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {section.label}
                </a>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
