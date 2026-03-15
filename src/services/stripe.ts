import { loadStripe } from '@stripe/stripe-js'
import { supabase } from '@/lib/supabase'
import type { CartItem } from '@/stores/cartStore'

// Lazy-initialize Stripe only when needed
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
    if (key) {
      stripePromise = loadStripe(key)
    }
  }
  return stripePromise
}

/**
 * Create a Stripe Checkout Session via Supabase Edge Function
 */
export const createCheckoutSession = async (
  cartItems: CartItem[],
  customerEmail: string,
  customerName: string
): Promise<{ sessionId: string; url: string }> => {
  try {
    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        cartItems,
        customerEmail,
        customerName,
      },
    })

    if (error) {
      console.error('❌ Edge Function error:', error)
      throw new Error(error.message || 'Failed to create checkout session')
    }

    if (!data || !data.sessionId || !data.url) {
      throw new Error('Invalid response from checkout session creation')
    }

    return data
  } catch (error) {
    console.error('❌ Failed to create checkout session:', error)
    throw error
  }
}

/**
 * Redirect to Stripe Checkout
 */
export const redirectToCheckout = async (sessionId: string): Promise<void> => {
  try {
    const stripe = await getStripe()

    if (!stripe) {
      throw new Error('Stripe failed to load')
    }

    const { error } = await stripe.redirectToCheckout({ sessionId })

    if (error) {
      console.error('❌ Redirect error:', error)
      throw error
    }
  } catch (error) {
    console.error('❌ Failed to redirect to checkout:', error)
    throw error
  }
}

/**
 * Retrieve checkout session details
 * (For success page to display order confirmation)
 */
export const getCheckoutSession = async (sessionId: string) => {
  try {
    // Note: In production, you'd call a Supabase Edge Function to retrieve this
    // securely from Stripe's API. For now, we'll just return the sessionId
    // since the webhook handles creating the order.

    return { sessionId }
  } catch (error) {
    console.error('❌ Failed to get checkout session:', error)
    throw error
  }
}

/**
 * Create a Stripe Checkout Session for addon service purchase(s)
 */
export const createAddonCheckoutSession = async (
  addons: Array<{ bookingId: string; serviceId: string }>,
  clientId: string
): Promise<{ sessionId: string; url: string }> => {
  try {
    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-addon-checkout', {
      body: {
        addons,
        clientId,
      },
    })

    if (error) {
      console.error('❌ Edge Function error:', error)
      throw new Error(error.message || 'Failed to create addon checkout session')
    }

    if (!data || !data.sessionId || !data.url) {
      throw new Error('Invalid response from addon checkout session creation')
    }

    return data
  } catch (error) {
    console.error('❌ Failed to create addon checkout session:', error)
    throw error
  }
}
