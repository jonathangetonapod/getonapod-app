import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { SettingsSectionId } from '@/components/workspace/settings/useSettingsSection'

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  icon: LucideIcon
}

export interface SettingsSectionGroup {
  label: string
  sections: SettingsSection[]
}

interface SettingsSectionNavProps {
  groups: SettingsSectionGroup[]
  activeId: SettingsSectionId | null
  hrefFor: (id: SettingsSectionId) => string
}

/**
 * The settings menu. Each entry opens one section in place of the last; it
 * is a link, so the section is in the address and the back button returns
 * to the one before. A column beside the content on a desktop, wrapping
 * rows above it on a phone.
 */
export const SettingsSectionNav = ({ groups, activeId, hrefFor }: SettingsSectionNavProps) => (
  <nav aria-label="Settings sections" className="min-w-0">
    <div className="flex flex-col gap-4 lg:gap-6">
      {groups.map((group) => (
        <div key={group.label} className="min-w-0">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {group.sections.map((section) => {
              const Icon = section.icon
              const active = section.id === activeId
              return (
                <li key={section.id}>
                  <Link
                    to={hrefFor(section.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} aria-hidden="true" />
                    {section.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  </nav>
)
