import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { podcastArtworkOriginal, podcastArtworkThumbnail, podcastInitials } from '@/lib/podcastCatalogDisplay'
import { cn } from '@/lib/utils'

/*
 * A show's cover as a small thumbnail. The resized copy comes first; if the
 * proxy cannot serve it, the original cover is tried, and the initials stay
 * when neither loads.
 */
export const PodcastArtwork = ({
  imageUrl,
  name,
  displaySize,
  className,
  fallbackClassName,
}: {
  imageUrl: string | null
  name: string
  /** The rendered size in px, so the thumbnail is fetched at twice that. */
  displaySize: number
  className?: string
  fallbackClassName?: string
}) => {
  const thumbnail = podcastArtworkThumbnail(imageUrl, displaySize)
  const original = podcastArtworkOriginal(imageUrl)
  const [useOriginal, setUseOriginal] = useState(false)
  // A row reused for another show starts again from the thumbnail.
  useEffect(() => setUseOriginal(false), [imageUrl])
  const src = useOriginal ? original : thumbnail ?? original

  return (
    <Avatar className={className}>
      {src && (
        <AvatarImage
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="object-cover"
          onLoadingStatusChange={(status) => {
            if (status === 'error' && !useOriginal && original && src !== original) setUseOriginal(true)
          }}
        />
      )}
      <AvatarFallback className={cn(fallbackClassName)}>{podcastInitials(name)}</AvatarFallback>
    </Avatar>
  )
}
