import type { KeyboardEvent } from 'react'
import type { PodcastPrimaryActionState } from '@/components/workspace/catalog/PodcastPrimaryAction'
import type { RelationshipBadge } from '@/lib/relationshipLabels'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

/** What a row and a card both need to show one show and offer its actions. */
export interface PodcastResultProps {
  podcast: WorkspacePodcastCatalogItem
  relationship: RelationshipBadge | null
  selectable: boolean
  selected: boolean
  onSelectedChange: (checked: boolean) => void
  action: PodcastPrimaryActionState
  onOpenDetails: () => void
  onFindHostEmail?: () => void
  onCopyEmail: (email: string) => void
}

/** Enter on the row itself (not on a control inside it) opens the details. */
export function openOnEnter(event: KeyboardEvent<HTMLElement>, open: () => void) {
  if (event.key === 'Enter' && event.target === event.currentTarget) {
    event.preventDefault()
    open()
  }
}

/** Column widths, shared with the header so the labels sit over their values. */
export const ROW_COLUMNS = {
  select: 'w-4 shrink-0',
  artwork: 'w-10 shrink-0',
  show: 'min-w-0 flex-1',
  categories: 'hidden w-40 shrink-0 xl:flex',
  audience: 'hidden w-16 shrink-0 text-right md:block',
  rating: 'hidden w-20 shrink-0 md:block',
  reach: 'hidden w-14 shrink-0 text-right lg:block',
  lastEpisode: 'hidden w-20 shrink-0 lg:block',
  email: 'w-36 shrink-0',
  action: 'shrink-0 md:flex md:w-36 md:justify-end',
  menu: 'hidden w-8 shrink-0 md:block',
} as const

/** The row's padding and gaps, shared by the header and the loading rows so nothing shifts. */
export const ROW_LAYOUT = 'flex items-center gap-3 px-3 md:min-w-[1280px]'
