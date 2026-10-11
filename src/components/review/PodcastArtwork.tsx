import { useState } from 'react'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReviewPodcast } from '@/components/review/reviewTypes'

interface PodcastArtworkProps {
  podcast: Pick<ReviewPodcast, 'podcast_name' | 'podcast_image_url'>
  className?: string
  /** True when the show's name is already read out next to the image. */
  decorative?: boolean
}

export const PodcastArtwork = ({ podcast, className, decorative = false }: PodcastArtworkProps) => {
  // Remembers which URL failed rather than a bare flag: the same instance is
  // reused when the focused review moves to the next show, and a sticky flag
  // kept every later cover on the placeholder after one broken image.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const imageFailed = failedUrl !== null && failedUrl === podcast.podcast_image_url

  return (
    <div className={cn('relative overflow-hidden bg-[#e8e0d3]', className)}>
      {podcast.podcast_image_url && !imageFailed ? (
        <img
          src={podcast.podcast_image_url}
          alt={decorative ? '' : `${podcast.podcast_name} cover`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailedUrl(podcast.podcast_image_url)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#f7f1e8,transparent_36%),linear-gradient(145deg,#d8c6af,#8ca096)]">
          <div className="flex h-1/2 w-1/2 items-center justify-center rounded-full border border-white/60 bg-[#0d1b2a]/90 shadow-lg">
            <Mic className="h-1/2 w-1/2 text-[#e9b18f]" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  )
}
