/**
 * Everything the done-for-you landing page says, in one place.
 *
 * Keeping the words here and the markup in the page keeps a copy edit from
 * being a layout edit.
 *
 * The copy began as the "Landing v2" design and has since been edited for
 * selling: one promise, stated in the headline, and proven with the facts the
 * FAQ already commits to (price, time asked of the client, booking rates,
 * timelines). One rule still holds from the design: the client list carries
 * only real names, each one quoted further down the page.
 */

/**
 * Where "book a call" goes. The buttons name the call's length, so the label
 * follows the link — change them together.
 */
export const CALL_URL = 'https://cal.com/jonathan-garces-x5v8tl/30minutes'
export const CALL_LABEL = 'Book a 30-minute call'
export const CONTACT_EMAIL = 'jonathan@getonapod.com'

/** One plan. Stated so people can self-qualify; nothing is sold on-page. */
export const MONTHLY_PRICE = 1000
export const MONTHLY_PRICE_TEXT = `$${MONTHLY_PRICE.toLocaleString('en-US')}`

/** One plan's terms, as the pricing section below states them. */
export const MINIMUM_MONTHS = 3
export const WEEKLY_MINUTES = 15

/**
 * The design scrolls a marquee of client wordmarks under the hero. These are
 * the companies of the six clients quoted below, so every name here has a
 * face and a recording further down the page.
 */
export const CLIENT_NAMES: string[] = [
  'Relai',
  'North Street Creative',
  'Quirk',
  'Ownify',
  'ShareClub',
  'ScaleUp Valley',
]

export interface ClientQuote {
  quote: string
  name: string
  role: string
  /** The recording the quote is taken from, when it is public. */
  videoUrl?: string
  /** Their face, cropped from that recording and self-hosted under public/testimonials. */
  portrait?: string
}

/**
 * Written testimonials, from what clients said on camera. Each is cut down to
 * its strongest lines with the fillers trimmed, and nothing is added; the
 * design's placeholder pull-quote is not one of them.
 */
export const CLIENT_QUOTES: ClientQuote[] = [
  {
    quote: 'Jonathan is a really cool, approachable guy, and his team is just more of that. They really helped us identify what podcasts would be great for us, and made setting up, scheduling and recording just a breeze.',
    name: 'Miles Mufuka Martin',
    role: 'Co-founder and CEO, Relai',
    videoUrl: 'https://www.youtube.com/watch?v=7mjznMHEeg0',
    portrait: '/testimonials/miles-mufuka-martin.webp',
  },
  {
    quote: 'True to their name, Get On A Pod, they were booking me on podcasts almost immediately. Super easy, super straightforward and super streamlined. I definitely recommend them for any founder, entrepreneur or business owner interested in being a thought leader. It really works.',
    name: 'Tom Conlon',
    role: 'Founder and CEO, North Street Creative',
    videoUrl: 'https://www.youtube.com/watch?v=MG4KENHrge0',
    portrait: '/testimonials/tom-conlon.webp',
  },
  {
    quote: 'They really took time to understand my brand, my areas of expertise and the topics that I not only enjoy speaking about but that will resonate with my core audience. Within my first week of becoming a client, I landed a spot as a guest on a very desirable podcast.',
    name: 'Kate Pozeznik',
    role: 'Founder and CEO, Quirk',
    videoUrl: 'https://www.youtube.com/watch?v=hFcbqL0vrn4',
    portrait: '/testimonials/kate-pozeznik.webp',
  },
  {
    quote: 'We’ve had four podcasts scheduled in the first 10 days, and there’s more coming in. They put them on my calendar, I get the prep work, and we debrief afterwards on what went well, what didn’t go so well and how to improve the pitch.',
    name: 'Frank Rohde',
    role: 'Founder and CEO, Ownify',
    videoUrl: 'https://www.youtube.com/watch?v=dJwV94ymqz8',
    portrait: '/testimonials/frank-rohde.webp',
  },
  {
    quote: 'Our whole goal was to use podcasts as a general exercise for marketing. I can’t recommend working with them more. They were great and easy to work with, and they were able to get us on various media channels and podcasts.',
    name: 'Sam Hollander',
    role: 'Co-founder and CEO, ShareClub',
    videoUrl: 'https://www.youtube.com/watch?v=3PYDap_jSUQ',
    portrait: '/testimonials/sam-hollander.webp',
  },
  {
    quote: 'The experience has been amazing so far. I had two episodes booked in the first month, and it’s really a delight to work with. Jonathan is super nice and super easy to work with.',
    name: 'Mike Dias',
    role: 'Founder and CEO, ScaleUp Valley',
    videoUrl: 'https://www.youtube.com/watch?v=IP6HW42oztc',
    portrait: '/testimonials/mike-dias.webp',
  },
]

export interface Hero {
  kicker: string
  title: [string, string]
  lead: string
}

export const HERO: Hero = {
  kicker: 'Done-for-you podcast guesting and clips for tech founders and SaaS owners',
  title: ['Get booked on the podcasts', 'your buyers already listen to.'],
  lead: 'Get On A Pod pitches you to the SaaS, startup, AI and B2B shows your buyers, investors and future hires listen to, puts confirmed recordings on your calendar and sends a prep brief before each one. Then every episode comes back as 5 captioned vertical clips, ready to post on LinkedIn, Instagram, TikTok and YouTube Shorts. You approve every show, which takes about 15 minutes a week. Most clients have 2–4 bookings a month once outreach ramps up.',
}

export const HERO_SECONDARY = 'See how it works'

/** What the call is, said the same way under the hero and in the closing band. */
export const CALL_PROMISE = '30 minutes on video with Jonathan Garces, who runs the outreach. You leave with a list of the kinds of shows we would pitch you to, whether or not you sign up.'
export const CALL_NOTE = 'Opens Cal.com in a new tab.'

export interface Show {
  name: string
  about: string
  reach: string
  /**
   * Artwork under public/shows, fetched from the Apple Podcasts directory. Every
   * podcast has one; without one the mat shows the show's initials.
   */
  art?: string
}

export interface ShowCategory {
  name: string
  shows: Show[]
}

export const PODCAST_CATALOG: ShowCategory[] = [
  { name: 'SaaS & Startups', shows: [
    { name: 'The SaaS Podcast', about: 'Founder interviews on growth and funding', reach: '494 episodes', art: '/shows/the-saas-podcast.webp' },
    { name: 'The Official SaaStr Podcast', about: 'SaaS founders, operators and investors', reach: '888 episodes', art: '/shows/saastr.webp' },
    { name: 'Startups For the Rest of Us', about: 'Bootstrapped and mostly bootstrapped SaaS, with Rob Walling', reach: '329 episodes', art: '/shows/startups-for-the-rest-of-us.webp' },
    { name: 'Indie Hackers', about: 'Bootstrappers and small bets', reach: '290 episodes', art: '/shows/indie-hackers.webp' },
  ] },
  { name: 'AI', shows: [
    { name: 'Latent Space', about: 'The AI engineer podcast', reach: '233 episodes', art: '/shows/latent-space.webp' },
    { name: 'Practical AI', about: 'Making AI work in real products', reach: '377 episodes', art: '/shows/practical-ai.webp' },
    { name: 'The TWIML AI Podcast', about: 'Machine learning research and practice', reach: '797 episodes', art: '/shows/twiml-ai.webp' },
    { name: 'Eye On A.I.', about: 'Builders and researchers, with Craig S. Smith', reach: '386 episodes', art: '/shows/eye-on-ai.webp' },
  ] },
  { name: 'Product & Engineering', shows: [
    { name: 'Lenny\'s Podcast', about: 'Product, growth and career interviews', reach: '361 episodes', art: '/shows/lennys-podcast.webp' },
    { name: 'The Changelog', about: 'Software development and open source', reach: '1,014 episodes', art: '/shows/the-changelog.webp' },
    { name: 'The Product Podcast', about: 'Product leaders, from Product School', reach: '854 episodes', art: '/shows/the-product-podcast.webp' },
    { name: 'Product Thinking', about: 'Product management, with Melissa Perri', reach: '265 episodes', art: '/shows/product-thinking.webp' },
  ] },
  { name: 'Growth & GTM', shows: [
    { name: 'Marketing Against the Grain', about: 'HubSpot\'s growth and marketing show', reach: '458 episodes', art: '/shows/marketing-against-the-grain.webp' },
    { name: 'The Dave Gerhardt Show', about: 'B2B marketing, from Exit Five', reach: '412 episodes', art: '/shows/the-dave-gerhardt-show.webp' },
    { name: 'Everyone Hates Marketers', about: 'Positioning, argued plainly', reach: '310 episodes', art: '/shows/everyone-hates-marketers.webp' },
    { name: 'Revenue Builders', about: 'Sales leaders on building revenue teams', reach: '383 episodes', art: '/shows/revenue-builders.webp' },
  ] },
  { name: 'Founders & Funding', shows: [
    { name: 'The Twenty Minute VC', about: 'Venture capital and startup funding, with Harry Stebbings', reach: '1,519 episodes', art: '/shows/twenty-minute-vc.webp' },
    { name: 'How I Built This', about: 'Founders on how they built it, with Guy Raz', reach: '868 episodes', art: '/shows/how-i-built-this.webp' },
    { name: 'Masters of Scale', about: 'How companies grow, from WaitWhat', reach: '747 episodes', art: '/shows/masters-of-scale.webp' },
    { name: 'Acquired', about: 'The stories behind great tech companies', reach: '217 episodes', art: '/shows/acquired.webp' },
  ] },
]

export const PLAN_INCLUDES = [
  'Targeted outreach to vetted SaaS, startup, AI and B2B shows, every week',
  'Speaker one-sheet, positioning and pitch angles written around your product and market',
  'You approve every show before we confirm the booking',
  'Prep brief and talking points before every recording',
  '5 captioned vertical clips from every episode, sized for LinkedIn, Reels, TikTok and Shorts — the files are yours',
  'No setup fees and no paid placements — 3-month minimum, then month to month',
]

export interface Faq {
  q: string
  a: string
}

export const FAQ: Faq[] = [
  { q: 'How many shows will I get booked on?', a: "It depends on your niche and how bookable your story is, but most clients see 2–4 confirmed bookings a month once outreach ramps up (usually by week three). We tell you the honest number for your niche on the first call — including if it's lower." },
  { q: 'Who is this for?', a: 'Founders and executives at software, SaaS and tech companies, from bootstrapped to venture-backed. It works best when you sell to businesses, have a story about the problem your product solves, and want your buyers, investors and future hires to hear it from you.' },
  { q: 'What kinds of podcasts do you pitch?', a: 'Vetted, active SaaS, startup, AI, product and B2B shows with real audiences — not pay-to-play placements or dormant feeds. You see every show before we pitch it, and you approve every booking before we confirm.' },
  { q: 'When do I record my first episode?', a: 'Pitches go out in week one. Most clients have their first recording on the calendar within 3–5 weeks, and episodes typically publish 2–8 weeks after recording, depending on the show.' },
  { q: 'Do I get clips from my episodes?', a: 'Yes, clipping is included. When an episode publishes, we get the full recording from the host and cut 5 vertical clips from its strongest moments, captioned so they work with the sound off and sized for LinkedIn, Instagram Reels, TikTok and YouTube Shorts. At 2–4 bookings a month, that is roughly 10–20 clips a month to post. The files are yours to keep and reuse.' },
  { q: 'Is there a contract?', a: "A 3-month minimum to start — that's how long it takes outreach to ramp and bookings to land. After that it's month to month, cancel anytime. If we're not putting you on shows worth your time, you shouldn't be paying us." },
  { q: 'What do you need from me?', a: 'About an hour up front for the positioning interview, then roughly 15 minutes a week to approve shows. After that, just show up to the recordings — we handle everything else.' },
  { q: 'What if a host says no?', a: "Most do — that's the nature of outreach, and it's priced into the volume. Every pitch is personalized to the show, every follow-up is researched, and a no this quarter often becomes a yes next season when your proof gets stronger." },
  { q: 'How is this different from a PR agency?', a: 'PR agencies charge $2,000–5,000 a month, spread across press, awards, and everything else. We do one thing — podcast guesting, from the first pitch to the clips you post afterwards — and we do it every week.' },
]

/** "The SaaS Podcast" → "SP": what stands in the artwork mat until there is art. */
export const initials = (name: string): string =>
  name
    .split(/\s+/u)
    .filter((word) => word && !/^(the|of|and|&)$/iu.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
