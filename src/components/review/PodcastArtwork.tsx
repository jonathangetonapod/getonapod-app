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

/*
 * The placeholder is always underneath and the cover fades in only once it
 * has really loaded. A slow host (some never answer) used to leave a blank
 * tile until the browser gave up, and an empty 1x1 "image" never fires an
 * error at all. No referrer is sent: some feed hosts refuse covers requested
 * from another site's page.
 */
export const PodcastArtwork = ({ podcast, className, decorative = false }: PodcastArtworkProps) => {
  // Keyed by URL rather than a bare flag: the same instance is reused when the
  // focused review moves to the next show, and a sticky flag kept every later
  // cover on the placeholder after one broken image.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const url = podcast.podcast_image_url?.trim() || null
  const showImage = Boolean(url) && failedUrl !== url
  const loaded = showImage && loadedUrl === url

  return (
    <div className={cn('relative overflow-hidden bg-[#e8e0d3]', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#f7f1e8,transparent_36%),linear-gradient(145deg,#d8c6af,#8ca096)] transition-opacity duration-300',
          loaded && 'opacity-0',
        )}
      >
        <div className="flex h-1/2 w-1/2 items-center justify-center rounded-full border border-white/60 bg-[#0d1b2a]/90 shadow-lg">
          <Mic className="h-1/2 w-1/2 text-[#e9b18f]" aria-hidden="true" />
        </div>
      </div>
      {showImage && (
        <img
          key={url}
          src={url!}
          alt={decorative ? '' : `${podcast.podcast_name} cover`}
          className={cn('relative h-full w-full object-cover opacity-0 transition-opacity duration-300', loaded && 'opacity-100')}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            // A tracking pixel or empty file "loads" but shows nothing.
            if (event.currentTarget.naturalWidth <= 1) setFailedUrl(url)
            else setLoadedUrl(url)
          }}
          onError={() => setFailedUrl(url)}
        />
      )}
    </div>
  )
}
