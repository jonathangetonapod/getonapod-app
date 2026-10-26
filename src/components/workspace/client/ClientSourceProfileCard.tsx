import { useState } from 'react'
import { CalendarDays, ExternalLink, Globe2, Linkedin, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ClientSourceProfileCardProps {
  bio: string | null
  websiteUrl: string | null
  linkedInUrl: string | null
  calendarUrl: string | null
  canManage: boolean
  onEdit: () => void
}

const LINK_CLASS = 'inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'

/*
 * The input the host brief is drafted from. It is shown collapsed: the brief
 * below is what the AI works from, and the source is there to check against.
 */
export const ClientSourceProfileCard = ({
  bio,
  websiteUrl,
  linkedInUrl,
  calendarUrl,
  canManage,
  onEdit,
}: ClientSourceProfileCardProps) => {
  const [expanded, setExpanded] = useState(false)
  const text = bio?.trim() || ''
  // Roughly two lines at the narrowest card width; shorter text has nothing to expand.
  const expandable = text.length > 160 || text.includes('\n')

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-lg">Source profile</CardTitle>
          <CardDescription className="mt-1">The bio the host brief is generated from.</CardDescription>
        </div>
        {canManage && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />{text ? 'Edit' : 'Add'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {text ? (
          <div>
            <p
              id="client-source-profile-text"
              className={`whitespace-pre-wrap text-sm leading-6 text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}
            >
              {text}
            </p>
            {expandable && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls="client-source-profile-text"
                className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No source profile yet. Add a short bio so the host brief can be generated from it.</p>
        )}
        {(websiteUrl || linkedInUrl || calendarUrl) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}><Globe2 className="h-3.5 w-3.5" />Website<ExternalLink className="h-3 w-3" /></a>}
            {linkedInUrl && <a href={linkedInUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}><Linkedin className="h-3.5 w-3.5" />LinkedIn<ExternalLink className="h-3 w-3" /></a>}
            {calendarUrl && <a href={calendarUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}><CalendarDays className="h-3.5 w-3.5" />Calendar<ExternalLink className="h-3 w-3" /></a>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
