import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Video, FileText, Package, Users, ExternalLink, Check, ShoppingCart, Info } from 'lucide-react'
import type { Booking } from '@/services/bookings'
import type { AddonService, BookingAddon } from '@/services/addonServices'
import { formatPrice } from '@/services/addonServices'
import { useCartStore } from '@/stores/cartStore'
import { toast } from 'sonner'

interface UpgradeHeroBannerProps {
  publishedBookings: Booking[]
  services: AddonService[]
  existingAddons: BookingAddon[]
  clientId: string
}

export function UpgradeHeroBanner({
  publishedBookings,
  services,
  existingAddons,
  clientId
}: UpgradeHeroBannerProps) {
  const [selectedService, setSelectedService] = useState<AddonService | null>(null)
  const [serviceDetailsModal, setServiceDetailsModal] = useState<AddonService | null>(null)
  const { addAddonItem, openCart, isAddonInCart } = useCartStore()

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                      <div className="flex items-center gap-1">
                        <h4 className="text-sm font-semibold truncate">{service.name}</h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 hover:bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            setServiceDetailsModal(service)
                          }}
                        >
                          <Info className="h-3 w-3 text-muted-foreground hover:text-primary" />
                        </Button>
                      </div>
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
                    {availableForService.length === 0 ? 'Sold Out' : 'Add to Cart'}
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
                            // Check if already in cart
                            if (isAddonInCart(booking.id, selectedService.id)) {
                              toast.info('Already in cart')
                              openCart()
                              setSelectedService(null)
                              return
                            }

                            // Add to cart
                            addAddonItem(booking, selectedService, clientId)
                            toast.success('Added to cart!')
                            openCart()
                            setSelectedService(null)
                          }}
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Add to Cart - {formatPrice(selectedService.price_cents)}
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

      {/* Service Details Modal */}
      <Dialog open={!!serviceDetailsModal} onOpenChange={() => setServiceDetailsModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {serviceDetailsModal && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = getServiceIcon(serviceDetailsModal.name)
                    const index = services.findIndex(s => s.id === serviceDetailsModal.id)
                    const gradient = getServiceGradient(index)
                    return (
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${gradient} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                    )
                  })()}
                  <div>
                    <DialogTitle className="text-2xl">{serviceDetailsModal.name}</DialogTitle>
                    <DialogDescription className="text-base">
                      {serviceDetailsModal.short_description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 pt-4">
                {/* Price and Delivery */}
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Price</p>
                    <p className="text-3xl font-bold text-primary">{formatPrice(serviceDetailsModal.price_cents)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Delivery Time</p>
                    <p className="text-2xl font-semibold">{serviceDetailsModal.delivery_days} days</p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">About This Service</h3>
                  <p className="text-muted-foreground leading-relaxed">{serviceDetailsModal.description}</p>
                </div>

                {/* Features */}
                {serviceDetailsModal.features && serviceDetailsModal.features.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">What's Included</h3>
                    <div className="grid gap-2">
                      {serviceDetailsModal.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA Button */}
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  onClick={() => {
                    setServiceDetailsModal(null)
                    setSelectedService(serviceDetailsModal)
                  }}
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Add to Cart - {formatPrice(serviceDetailsModal.price_cents)}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Select an episode to add this service to your cart
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
