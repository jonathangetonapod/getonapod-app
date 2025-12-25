import { supabase } from '@/lib/supabase'

export interface PricingAnalytics {
  averagePricePerListener: number
  totalInventoryValue: number
  averagePrice: number
  averageAudienceSize: number
  totalReach: number
  priceByAudienceTier: {
    tier: string
    range: string
    avgPrice: number
    avgCPL: number // Cost per listener
    count: number
  }[]
  priceByCategory: {
    category: string
    avgPrice: number
    avgCPL: number
    count: number
  }[]
  topPodcasts: {
    name: string
    price: number
    audience: string
    cpl: number
  }[]
  priceDistribution: {
    range: string
    count: number
  }[]
}

// Parse price string like "$3,500" to number 3500
function parsePrice(priceString: string): number {
  return parseFloat(priceString.replace(/[$,]/g, ''))
}

// Parse audience string like "25,000" to number 25000
function parseAudience(audienceString: string): number {
  return parseFloat(audienceString.replace(/,/g, ''))
}

// Format number to currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export async function getPricingAnalytics(): Promise<PricingAnalytics> {
  try {
    console.log('Starting analytics query...')

    // Fetch all active premium podcasts
    const { data: podcasts, error } = await supabase
      .from('premium_podcasts')
      .select('*')
      .eq('is_active', true)

    console.log('Query result:', { data: podcasts, error })

    if (error) {
      console.error('Analytics query error:', error)
      throw new Error(`Failed to fetch analytics data: ${error.message}`)
    }

    if (!podcasts || podcasts.length === 0) {
      console.log('No podcasts found, returning empty analytics')
      // Return empty analytics if no data
      return {
        averagePricePerListener: 0,
        totalInventoryValue: 0,
        averagePrice: 0,
        averageAudienceSize: 0,
        totalReach: 0,
        priceByAudienceTier: [],
        priceByCategory: [],
        topPodcasts: [],
        priceDistribution: [],
      }
    }

    console.log(`Found ${podcasts.length} podcasts, parsing data...`)

    // Parse all data
    const parsedData = podcasts.map((p) => ({
    name: p.podcast_name,
    price: parsePrice(p.price),
    audience: p.audience_size ? parseAudience(p.audience_size) : 0,
    category: 'Premium Podcast', // All podcasts are in the same category for now
    rating: p.rating || 0,
  }))

  // Overall metrics
  const totalPrice = parsedData.reduce((sum, p) => sum + p.price, 0)
  const totalAudience = parsedData.reduce((sum, p) => sum + p.audience, 0)
  const averagePrice = totalPrice / parsedData.length
  const averageAudienceSize = totalAudience / parsedData.length
  const averagePricePerListener = totalAudience > 0 ? totalPrice / totalAudience : 0

  // Price by audience tier
  const tiers = [
    { name: 'Small', min: 0, max: 25000 },
    { name: 'Medium', min: 25000, max: 50000 },
    { name: 'Large', min: 50000, max: 100000 },
    { name: 'Mega', min: 100000, max: Infinity },
  ]

  const priceByAudienceTier = tiers.map((tier) => {
    const tieredPodcasts = parsedData.filter(
      (p) => p.audience >= tier.min && p.audience < tier.max
    )

    if (tieredPodcasts.length === 0) {
      return {
        tier: tier.name,
        range: `${tier.min.toLocaleString()} - ${tier.max === Infinity ? '∞' : tier.max.toLocaleString()}`,
        avgPrice: 0,
        avgCPL: 0,
        count: 0,
      }
    }

    const avgPrice = tieredPodcasts.reduce((sum, p) => sum + p.price, 0) / tieredPodcasts.length
    const totalAud = tieredPodcasts.reduce((sum, p) => sum + p.audience, 0)
    const totalPr = tieredPodcasts.reduce((sum, p) => sum + p.price, 0)
    const avgCPL = totalAud > 0 ? totalPr / totalAud : 0

    return {
      tier: tier.name,
      range: `${tier.min.toLocaleString()} - ${tier.max === Infinity ? '∞' : tier.max.toLocaleString()}`,
      avgPrice,
      avgCPL,
      count: tieredPodcasts.length,
    }
  })

  // Price by category
  const categoryMap = new Map<string, { prices: number[]; audiences: number[] }>()

  parsedData.forEach((p) => {
    if (!categoryMap.has(p.category)) {
      categoryMap.set(p.category, { prices: [], audiences: [] })
    }
    const cat = categoryMap.get(p.category)!
    cat.prices.push(p.price)
    cat.audiences.push(p.audience)
  })

  const priceByCategory = Array.from(categoryMap.entries())
    .map(([category, data]) => {
      const avgPrice = data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length
      const totalAud = data.audiences.reduce((sum, a) => sum + a, 0)
      const totalPr = data.prices.reduce((sum, p) => sum + p, 0)
      const avgCPL = totalAud > 0 ? totalPr / totalAud : 0

      return {
        category,
        avgPrice,
        avgCPL,
        count: data.prices.length,
      }
    })
    .sort((a, b) => b.avgPrice - a.avgPrice) // Sort by highest price

  // Top 5 most expensive podcasts
  const topPodcasts = parsedData
    .sort((a, b) => b.price - a.price)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      price: p.price,
      audience: p.audience.toLocaleString(),
      cpl: p.audience > 0 ? p.price / p.audience : 0,
    }))

  // Price distribution
  const priceRanges = [
    { label: '$0 - $1,000', min: 0, max: 1000 },
    { label: '$1,000 - $2,500', min: 1000, max: 2500 },
    { label: '$2,500 - $5,000', min: 2500, max: 5000 },
    { label: '$5,000 - $10,000', min: 5000, max: 10000 },
    { label: '$10,000+', min: 10000, max: Infinity },
  ]

  const priceDistribution = priceRanges.map((range) => ({
    range: range.label,
    count: parsedData.filter((p) => p.price >= range.min && p.price < range.max).length,
  }))

    return {
      averagePricePerListener,
      totalInventoryValue: totalPrice,
      averagePrice,
      averageAudienceSize,
      totalReach: totalAudience,
      priceByAudienceTier,
      priceByCategory,
      topPodcasts,
      priceDistribution,
    }
  } catch (err) {
    console.error('Unexpected error in getPricingAnalytics:', err)
    throw err
  }
}
