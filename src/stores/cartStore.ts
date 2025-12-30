import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PremiumPodcast } from '@/services/premiumPodcasts'
import type { AddonService } from '@/services/addonServices'
import type { Booking } from '@/services/bookings'

// Cart item interface
export interface CartItem {
  id: string // Unique cart item ID
  type: 'premium_podcast' | 'addon_service' // Type of item

  // Premium podcast fields
  podcastId?: string // premium_podcast.id
  podcastName?: string
  podcastImage?: string

  // Addon service fields
  bookingId?: string // booking.id (episode to add service to)
  serviceId?: string // addon_service.id
  serviceName?: string
  episodeName?: string // podcast episode name
  episodeImage?: string
  clientId?: string // Required for addon checkout

  // Common fields
  price: number // Price in dollars (e.g., 3500 or 149)
  priceDisplay: string // Formatted price string (e.g., "$3,500" or "$149")
  quantity: number // Always 1, but kept for extensibility
}

// Cart store interface
interface CartStore {
  items: CartItem[]
  isOpen: boolean // Controls cart drawer visibility

  // Actions
  addItem: (podcast: PremiumPodcast) => void
  addAddonItem: (booking: Booking, service: AddonService, clientId: string) => void
  removeItem: (id: string) => void
  clearCart: () => void
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void

  // Computed values
  getTotalItems: () => number
  getTotalPrice: () => number
  getTotalPriceDisplay: () => string
  isInCart: (podcastId: string) => boolean
  isAddonInCart: (bookingId: string, serviceId: string) => boolean
}

/**
 * Parse price string to number
 * Handles formats like: "$3,500", "$3500", "3500", etc.
 */
export const parsePrice = (priceStr: string): number => {
  // Remove dollar sign, commas, and any spaces
  const cleaned = priceStr.replace(/[$,\s]/g, '')
  const parsed = parseFloat(cleaned)

  // Return 0 if parsing fails
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Format number to price display string
 * Example: 3500 => "$3,500"
 */
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

/**
 * Cart store with Zustand
 * Persisted to localStorage under key "podcast-cart"
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      // Add premium podcast to cart
      addItem: (podcast: PremiumPodcast) => {
        const { items } = get()

        // Check if already in cart
        const existingItem = items.find((item) => item.type === 'premium_podcast' && item.podcastId === podcast.id)
        if (existingItem) {
          // Already in cart, don't add duplicate
          console.log('Item already in cart:', podcast.podcast_name)
          return
        }

        // Parse price
        const price = parsePrice(podcast.price)

        // Create cart item
        const cartItem: CartItem = {
          id: `cart-${Date.now()}-${podcast.id}`,
          type: 'premium_podcast',
          podcastId: podcast.id,
          podcastName: podcast.podcast_name,
          podcastImage: podcast.podcast_image_url,
          price,
          priceDisplay: podcast.price,
          quantity: 1,
        }

        // Add to cart
        set({ items: [...items, cartItem] })
        console.log('Added to cart:', podcast.podcast_name, price)
      },

      // Add addon service to cart
      addAddonItem: (booking: Booking, service: AddonService, clientId: string) => {
        const { items } = get()

        // Check if already in cart
        const existingItem = items.find(
          (item) => item.type === 'addon_service' && item.bookingId === booking.id && item.serviceId === service.id
        )
        if (existingItem) {
          console.log('Addon already in cart:', service.name, 'for', booking.podcast_name)
          return
        }

        // Convert price from cents to dollars
        const price = service.price_cents / 100

        // Create cart item
        const cartItem: CartItem = {
          id: `cart-addon-${Date.now()}-${booking.id}-${service.id}`,
          type: 'addon_service',
          bookingId: booking.id,
          serviceId: service.id,
          serviceName: service.name,
          episodeName: booking.podcast_name,
          episodeImage: booking.podcast_image_url || undefined,
          clientId,
          price,
          priceDisplay: formatPrice(price),
          quantity: 1,
        }

        // Add to cart
        set({ items: [...items, cartItem] })
        console.log('Added addon to cart:', service.name, 'for', booking.podcast_name, price)
      },

      // Remove item from cart
      removeItem: (id: string) => {
        const { items } = get()
        set({ items: items.filter((item) => item.id !== id) })
        console.log('Removed from cart:', id)
      },

      // Clear entire cart
      clearCart: () => {
        set({ items: [] })
        console.log('Cart cleared')
      },

      // Toggle cart drawer
      toggleCart: () => {
        const { isOpen } = get()
        set({ isOpen: !isOpen })
      },

      // Open cart drawer
      openCart: () => {
        set({ isOpen: true })
      },

      // Close cart drawer
      closeCart: () => {
        set({ isOpen: false })
      },

      // Get total number of items
      getTotalItems: () => {
        const { items } = get()
        return items.reduce((total, item) => total + item.quantity, 0)
      },

      // Get total price (numeric)
      getTotalPrice: () => {
        const { items } = get()
        return items.reduce((total, item) => total + item.price * item.quantity, 0)
      },

      // Get total price (formatted string)
      getTotalPriceDisplay: () => {
        const totalPrice = get().getTotalPrice()
        return formatPrice(totalPrice)
      },

      // Check if podcast is in cart
      isInCart: (podcastId: string) => {
        const { items } = get()
        return items.some((item) => item.podcastId === podcastId)
      },

      // Check if addon service is in cart
      isAddonInCart: (bookingId: string, serviceId: string) => {
        const { items } = get()
        return items.some(
          (item) => item.type === 'addon_service' && item.bookingId === bookingId && item.serviceId === serviceId
        )
      },
    }),
    {
      name: 'podcast-cart', // localStorage key
      // Only persist items, not the isOpen state
      partialize: (state) => ({ items: state.items }),
    }
  )
)
