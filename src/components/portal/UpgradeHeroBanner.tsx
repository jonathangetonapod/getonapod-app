import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Video, FileText, Package, Users, ExternalLink, Check } from 'lucide-react'
import type { Booking } from '@/services/bookings'
import type { AddonService, BookingAddon } from '@/services/addonServices'
import { formatPrice } from '@/services/addonServices'

interface UpgradeHeroBannerProps {
  publishedBookings: Booking[]
  services: AddonService[]
  existingAddons: BookingAddon[]
  onPurchaseClick: (booking: Booking, service: AddonService) => void
}

export function UpgradeHeroBanner({
  publishedBookings,
  services,
  existingAddons,
  onPurchaseClick
}: UpgradeHeroBannerProps) {
  const [selectedService, setSelectedService] = useState<AddonService | null>(null)

  // Count unique episodes that have at least one addon purchased
  const episodesWithAddons = new Set(existingAddons.map(addon => addon.booking_id))
  const availableEpisodesCount = publishedBookings.length - episodesWithAddons.size

  if (availableEpisodesCount === 0 || services.length === 0) {
    return null
  }

  // Get icon for service
  const getServiceIcon = (serviceName: string) => {
    if (serviceName.toLowerCase().includes('clip')) return Video
    if (serviceName.toLowerCase().includes('blog') || serviceName.toLowerCase().includes('seo')) return FileText
    if (serviceName.toLowerCase().includes('bundle') || serviceName.toLowerCase().includes('complete')) return Package
    return Sparkles
  }

  // Get gradient colors for service
  const getServiceGradient = (index: number) => {
    const gradients = [
      'from-purple-600 to-pink-600',
      'from-blue-600 to-cyan-600',
      'from-orange-600 to-red-600',
    ]
    return gradients[index % gradients.length]
  }

  // Filter episodes available for a specific service
  const getAvailableEpisodes = (service: AddonService) => {
    return publishedBookings.filter(booking =>
      !existingAddons.some(addon =>
        addon.booking_id === booking.id && addon.service_id === service.id
      )
    )
  }

  return (
    <>
      {/* Compact Upgrade Banner */}
      <div className="mb-4 rounded-lg border border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 p-4 shadow-md">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5" />
            <div>
              <h3 className="text-base font-bold">Upgrade Your Episodes</h3>
              <p className="text-xs text-white/80">
                {availableEpisodesCount} {availableEpisodesCount === 1 ? 'episode' : 'episodes'} available
              </p>
            </div>
          </div>
        </div>

        {/* Compact Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {services.map((service, index) => {
              const Icon = getServiceIcon(service.name)
              const gradient = getServiceGradient(index)
              const availableForService = getAvailableEpisodes(service)
              const isBestValue = service.name.toLowerCase().includes('bundle')

              return (
                <Card key={service.id} className="relative overflow-hidden hover:shadow-md transition-all p-3">
                  {isBestValue && (
                    <Badge className="absolute top-2 right-2 bg-green-600 text-white border-0 text-[10px] px-1.5 py-0.5">
                      Best Value
                    </Badge>
                  )}

                  <div className="flex items-start gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-md bg-gradient-to-r ${gradient} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold truncate">{service.name}</h4>
                      <p className="text-[10px] text-muted-foreground">{service.short_description}</p>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-xl font-bold">{formatPrice(service.price_cents)}</div>
                    <div className="text-[10px] text-muted-foreground">{service.delivery_days}d delivery</div>
                  </div>

                  <Button
                    onClick={() => setSelectedService(service)}
                    disabled={availableForService.length === 0}
                    size="sm"
                    className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90 text-white h-8 text-xs`}
                  >
                    {availableForService.length === 0 ? 'No Episodes' : 'Select'}
                  </Button>
                </Card>
              )
            })}
          </div>
      </div>

      {/* Episode Selection Sheet */}
      <Sheet open={!!selectedService} onOpenChange={() => setSelectedService(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedService && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-6 w-6 text-purple-600" />
                  Add {selectedService.name}
                </SheetTitle>
                <SheetDescription>
                  Select an episode to add {selectedService.name} ({formatPrice(selectedService.price_cents)})
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {getAvailableEpisodes(selectedService).map((booking) => (
                  <Card key={booking.id} className="p-4 hover:shadow-lg transition-shadow">
                    <div className="flex gap-4">
                      {booking.podcast_image_url && (
                        <img
                          src={booking.podcast_image_url}
                          alt={booking.podcast_name}
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg mb-1 truncate">
                          {booking.podcast_name}
                        </h3>

                        {booking.host_name && (
                          <p className="text-sm text-muted-foreground mb-2">
                            Host: {booking.host_name}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          {booking.audience_size && (
                            <Badge variant="secondary" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {booking.audience_size.toLocaleString()} listeners
                            </Badge>
                          )}
                          {booking.publish_date && (
                            <Badge variant="secondary" className="text-xs">
                              Published {new Date(booking.publish_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Badge>
                          )}
                        </div>

                        {booking.episode_url && (
                          <a
                            href={booking.episode_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mb-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Listen to Episode
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}

                        <Button
                          onClick={() => {
                            onPurchaseClick(booking, selectedService)
                            setSelectedService(null)
                          }}
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Purchase {selectedService.name} - {formatPrice(selectedService.price_cents)}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
