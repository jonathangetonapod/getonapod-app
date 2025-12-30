import { Link } from 'react-router-dom'
import { X, Trash2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useCartStore } from '@/stores/cartStore'

/**
 * Cart drawer component
 * Slides in from right showing cart contents
 */
export const CartDrawer = () => {
  const { items, isOpen, closeCart, removeItem, getTotalPriceDisplay, getTotalItems } =
    useCartStore()

  const totalItems = getTotalItems()
  const totalPrice = getTotalPriceDisplay()

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        {/* Header */}
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" />
            Shopping Cart
          </SheetTitle>
          <SheetDescription>
            {totalItems === 0
              ? 'Your cart is empty'
              : `${totalItems} ${totalItems === 1 ? 'item' : 'items'} in your cart`}
          </SheetDescription>
        </SheetHeader>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto py-6">
          {items.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Your cart is empty</h3>
              <p className="text-muted-foreground mb-6">
                Add podcast placements or addon services to get started
              </p>
              <Button onClick={closeCart}>
                Continue Browsing
              </Button>
            </div>
          ) : (
            // Cart items list
            <div className="space-y-4">
              {items.map((item) => {
                const isAddon = item.type === 'addon_service'
                const image = isAddon ? item.episodeImage : item.podcastImage
                const title = isAddon
                  ? `${item.serviceName} for ${item.episodeName}`
                  : item.podcastName
                const displayName = isAddon ? item.podcastName : item.podcastName

                return (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
                  >
                    {/* Image */}
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {image ? (
                        <img
                          src={image}
                          alt={displayName || 'Item'}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">
                        {title}
                      </h4>
                      <p className="text-lg font-bold text-primary">{item.priceDisplay}</p>
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                      className="flex-shrink-0 h-10 w-10 hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${title} from cart`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer - Only show if cart has items */}
        {items.length > 0 && (
          <>
            <Separator className="my-4" />

            {/* Total */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-lg">
                <span className="font-semibold">Subtotal:</span>
                <span className="text-2xl font-bold text-primary">{totalPrice}</span>
              </div>

              {/* Checkout Button */}
              <Button asChild size="lg" className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90">
                <Link to="/checkout" onClick={closeCart}>
                  Proceed to Checkout
                </Link>
              </Button>

              {/* Continue Browsing Button */}
              <Button variant="outline" size="lg" className="w-full" onClick={closeCart}>
                Continue Browsing
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
