import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  Star,
  Radio,
  Tag,
  Sparkles,
} from 'lucide-react'

interface PodcastCategory {
  category_id: string
  category_name: string
}

interface PitchAngle {
  title: string
  description: string
}

interface CachedPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories: PodcastCategory[] | null
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: PitchAngle[] | null
  demographics: Record<string, unknown> | null
}

interface PodcastOutreachSwiperProps {
  podcasts: CachedPodcast[]
  currentIndex: number
  onCheckmark: (podcast: CachedPodcast) => void
  onSkip: (podcast: CachedPodcast) => void
  onNext: () => void
  onPrevious: () => void
  sendingWebhook: boolean
  alreadyActioned: Set<string>
}

export function PodcastOutreachSwiper({
  podcasts,
  currentIndex,
  onCheckmark,
  onSkip,
  onNext,
  onPrevious,
  sendingWebhook,
  alreadyActioned,
}: PodcastOutreachSwiperProps) {
  const currentPodcast = podcasts[currentIndex]
  const [showAiModal, setShowAiModal] = useState(false)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentPodcast || sendingWebhook) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (currentIndex > 0) onPrevious()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (currentIndex < podcasts.length - 1) onNext()
          break
        case ' ':
        case 'Enter':
          e.preventDefault()
          onCheckmark(currentPodcast)
          break
        case 'Escape':
        case 'x':
        case 'X':
          e.preventDefault()
          onSkip(currentPodcast)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPodcast, currentIndex, podcasts.length, sendingWebhook, onCheckmark, onSkip, onNext, onPrevious])

  if (!currentPodcast) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎉</div>
          <h3 className="text-2xl font-bold">All Podcasts Reviewed!</h3>
          <p className="text-base text-muted-foreground">
            You've reviewed all available podcasts for outreach.
          </p>
        </div>
      </div>
    )
  }

  const isAlreadyActioned = alreadyActioned.has(currentPodcast.podcast_id)
  // Calculate total podcasts processed (including those already actioned + current filtered list)
  const totalPodcasts = podcasts.length + alreadyActioned.size
  const reviewedCount = alreadyActioned.size

  return (
    <div className="relative min-h-[500px] flex items-center justify-center px-2 md:px-0">
      {/* Progress Counter */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <Badge variant="secondary" className="text-sm px-4 py-1">
          {reviewedCount} of {totalPodcasts} reviewed
        </Badge>
      </div>

      {/* Main Card */}
      <Card className="w-full max-w-3xl shadow-2xl">
        <CardContent className="p-6 space-y-6">
          {/* Header with Podcast Image and Title */}
          <div className="flex items-start gap-4">
            {currentPodcast.podcast_image_url && (
              <img
                src={currentPodcast.podcast_image_url}
                alt={currentPodcast.podcast_name}
                className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-2xl font-bold flex-1">{currentPodcast.podcast_name}</h3>
                <Button
                  type="button"
                  variant={currentPodcast.ai_fit_reasons && currentPodcast.ai_fit_reasons.length > 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAiModal(true)}
                  className={currentPodcast.ai_fit_reasons && currentPodcast.ai_fit_reasons.length > 0
                    ? "flex-shrink-0 bg-purple-600 hover:bg-purple-700"
                    : "flex-shrink-0"}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  {currentPodcast.ai_fit_reasons && currentPodcast.ai_fit_reasons.length > 0
                    ? 'View AI Analysis'
                    : 'No AI Analysis'}
                </Button>
              </div>
              {currentPodcast.publisher_name && (
                <p className="text-sm text-muted-foreground mb-2">
                  by {currentPodcast.publisher_name}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {currentPodcast.itunes_rating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span>{currentPodcast.itunes_rating.toFixed(1)}</span>
                  </div>
                )}
                {currentPodcast.episode_count && (
                  <div className="flex items-center gap-1">
                    <Radio className="h-4 w-4" />
                    <span>{currentPodcast.episode_count} episodes</span>
                  </div>
                )}
                {currentPodcast.audience_size && (
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{currentPodcast.audience_size.toLocaleString()} audience</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Categories */}
          {Array.isArray(currentPodcast.podcast_categories) && currentPodcast.podcast_categories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-4 w-4 text-muted-foreground" />
              {currentPodcast.podcast_categories.slice(0, 3).map((cat) => (
                <Badge key={cat.category_id} variant="outline" className="text-xs">
                  {cat.category_name}
                </Badge>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              About This Podcast
            </h4>
            <div className="bg-muted/30 rounded-lg p-4 max-h-[200px] overflow-y-auto">
              <p className="text-sm leading-relaxed">
                {currentPodcast.podcast_description || 'No description available'}
              </p>
            </div>
          </div>

          {/* Already Actioned Warning */}
          {isAlreadyActioned && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ This podcast has already been reviewed (sent or skipped)
              </p>
            </div>
          )}

          {/* AI Analysis Reminder */}
          {currentPodcast.ai_fit_reasons && currentPodcast.ai_fit_reasons.length > 0 && !isAlreadyActioned && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
              <p className="text-sm text-purple-800 dark:text-purple-200">
                <Sparkles className="h-4 w-4 inline mr-1" />
                AI analysis available - Click "View AI Analysis" above to see why this is a great fit
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onSkip(currentPodcast)}
              disabled={sendingWebhook}
              className="flex flex-col gap-2 h-auto py-6 border-red-200 hover:bg-red-50 hover:border-red-300"
            >
              <X className="h-8 w-8 text-red-500" />
              <span className="text-sm font-semibold">Skip</span>
              <span className="text-xs text-muted-foreground">Press X or Esc</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onCheckmark(currentPodcast)}
              disabled={sendingWebhook}
              className="flex flex-col gap-2 h-auto py-6 border-green-200 hover:bg-green-50 hover:border-green-300"
            >
              {sendingWebhook ? (
                <>
                  <Loader2 className="h-8 w-8 text-green-500 animate-spin" />
                  <span className="text-sm font-semibold">Sending...</span>
                </>
              ) : (
                <>
                  <Check className="h-8 w-8 text-green-500" />
                  <span className="text-sm font-semibold">Send to Outreach</span>
                  <span className="text-xs text-muted-foreground">Press Space or Enter</span>
                </>
              )}
            </Button>
          </div>

          {/* Navigation Hint */}
          <div className="text-center text-xs text-muted-foreground pt-2 border-t">
            💡 Use ← → arrow keys to navigate, Space/Enter to approve, X/Esc to skip
          </div>
        </CardContent>
      </Card>

      {/* Navigation Arrows */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={currentIndex === 0 || sendingWebhook}
        className="absolute left-4 top-1/2 transform -translate-y-1/2 h-12 w-12 rounded-full"
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={currentIndex === podcasts.length - 1 || sendingWebhook}
        className="absolute right-4 top-1/2 transform -translate-y-1/2 h-12 w-12 rounded-full"
      >
        <ChevronRight className="h-6 w-6" />
      </Button>

      {/* AI Fit Analysis Modal */}
      <Dialog open={showAiModal} onOpenChange={setShowAiModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Fit Analysis: {currentPodcast?.podcast_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            {/* AI Fit Reasons */}
            {currentPodcast?.ai_fit_reasons && currentPodcast.ai_fit_reasons.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-base">Why This Is A Great Fit</h4>
                <ul className="space-y-3">
                  {currentPodcast.ai_fit_reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <Check className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Pitch Angles */}
            {currentPodcast?.ai_pitch_angles && currentPodcast.ai_pitch_angles.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-base">Pitch Angles</h4>
                <div className="space-y-3">
                  {currentPodcast.ai_pitch_angles.map((angle, idx) => (
                    <div key={idx} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h5 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">
                        {angle.title}
                      </h5>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {angle.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!currentPodcast?.ai_fit_reasons || currentPodcast.ai_fit_reasons.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No AI analysis available for this podcast yet.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
