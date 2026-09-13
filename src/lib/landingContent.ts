/**
 * Everything the done-for-you landing page says, in one place.
 *
 * The page has two offers behind one toggle — podcast guesting and stage
 * booking — and most sections change wholesale between them. Keeping the words
 * here and the markup in the page keeps a copy edit from being a layout edit.
 *
 * The copy is the "GetOnAPod Landing v2 copy" design, verbatim, with three
 * exceptions: the design's placeholder client list is empty until there are
 * real names, its "$[X]" is written out, and its "Starting in September" line
 * is computed so it stays true after September.
 */

export type Mode = 'podcasts' | 'stages'

/** Every "book a call" on the page goes here; the footer also offers email. */
export const CALL_URL = 'https://calendly.com/getonapodjg/30min'
export const CONTACT_EMAIL = 'jonathan@getonapod.com'

/** One plan, both offers. Stated so people can self-qualify; nothing is sold on-page. */
export const MONTHLY_PRICE = 500

/**
 * The design scrolls a marquee of client wordmarks under the hero. Its names
 * were placeholders, so the section stays hidden until this has real ones.
 */
export const CLIENT_NAMES: string[] = []

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
    // His video also praises short-form clips, which the offer above does not
    // include, so the quote keeps to podcasts.
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

export const HERO: Record<Mode, Hero> = {
  podcasts: {
    kicker: 'Done-for-you podcast guesting for founders, executives, authors and coaches',
    title: ['We craft your story.', 'Podcasts come calling.'],
    lead: 'GetOnAPod is a done-for-you podcast guesting service. We turn your expertise into a story hosts want on tape, pitch the shows your customers already listen to, and put confirmed recordings on your calendar. You show up and talk.',
  },
  stages: {
    kicker: 'Done-for-you stage booking for founders, executives, authors and coaches',
    title: ['Get in front of rooms', 'full of your ideal clients.'],
    lead: 'We find the conferences, associations and events your buyers attend, pitch you at real volume, and generate the interest. When an organizer replies, the conversation is yours — you take it from there.',
  },
}

export const HERO_CTA = 'Book a 30-minute call'
export const HERO_SECONDARY = 'See how it works'
export const CLOSE_CTA = 'Book a 30-minute call'

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
  { name: 'SaaS & Tech', shows: [
    { name: 'The SaaS Podcast', about: 'Founder interviews on growth and funding', reach: '494 episodes', art: '/shows/the-saas-podcast.webp' },
    { name: 'Indie Hackers', about: 'Bootstrappers and small bets', reach: '290 episodes', art: '/shows/indie-hackers.webp' },
    { name: 'Lenny\'s Podcast', about: 'Product, growth and career interviews', reach: '361 episodes', art: '/shows/lennys-podcast.webp' },
    { name: 'The Changelog', about: 'Software development and open source', reach: '1,014 episodes', art: '/shows/the-changelog.webp' },
  ] },
  { name: 'Marketing', shows: [
    { name: 'Marketing School', about: 'Daily tactics, huge back catalog', reach: '2,000 episodes', art: '/shows/marketing-school.webp' },
    { name: 'Everyone Hates Marketers', about: 'No-BS positioning conversations', reach: '310 episodes', art: '/shows/everyone-hates-marketers.webp' },
    { name: 'Marketing Against the Grain', about: 'HubSpot\'s growth and marketing show', reach: '458 episodes', art: '/shows/marketing-against-the-grain.webp' },
    { name: 'Uncensored CMO', about: 'Marketing leaders, unfiltered', reach: '286 episodes', art: '/shows/uncensored-cmo.webp' },
  ] },
  { name: 'Finance', shows: [
    { name: 'Animal Spirits', about: 'Markets with a practitioner audience', reach: '817 episodes', art: '/shows/animal-spirits.webp' },
    { name: 'Financial Advisor Success', about: 'Advisor practice management, with Michael Kitces', reach: '506 episodes', art: '/shows/financial-advisor-success.webp' },
    { name: 'Fintech Insider', about: 'Fintech operators and news, from 11:FS', reach: '1,134 episodes', art: '/shows/fintech-insider.webp' },
    { name: 'Afford Anything', about: 'Money, work and life, with Paula Pant', reach: '795 episodes', art: '/shows/afford-anything.webp' },
  ] },
  { name: 'Health & Wellness', shows: [
    { name: 'The Dr. Hyman Show', about: 'Functional medicine with Dr. Mark Hyman', reach: '1,273 episodes', art: '/shows/the-dr-hyman-show.webp' },
    { name: 'The Genius Life', about: 'Health, performance and longevity', reach: '598 episodes', art: '/shows/the-genius-life.webp' },
    { name: 'Well Made', about: 'Building consumer brands, from Lumi', reach: '152 episodes', art: '/shows/well-made.webp' },
    { name: 'Therapy Chat', about: 'Trauma-informed therapists and coaches', reach: '545 episodes', art: '/shows/therapy-chat.webp' },
  ] },
  { name: 'Leadership', shows: [
    { name: 'Coaching for Leaders', about: 'Management practice, loyal audience', reach: '807 episodes', art: '/shows/coaching-for-leaders.webp' },
    { name: 'Redefining Work', about: 'HR and people leaders, with Lars Schmidt', reach: '144 episodes', art: '/shows/redefining-work.webp' },
    { name: 'How I Built This', about: 'Founders on how they built it, with Guy Raz', reach: '868 episodes', art: '/shows/how-i-built-this.webp' },
    { name: 'The Next Big Idea', about: 'Authors on the year\'s big nonfiction', reach: '372 episodes', art: '/shows/the-next-big-idea.webp' },
  ] },
]

export const STAGE_CATALOG: ShowCategory[] = [
  { name: 'SaaS & Tech', shows: [
    { name: 'SaaStock', about: 'Annual SaaS founder conference, Dublin', reach: '5,000 attendees' },
    { name: 'Web Summit stages', about: 'Growth and product tracks', reach: '70,000 attendees' },
    { name: 'MicroConf', about: 'Bootstrapped software founders', reach: '800 attendees' },
    { name: 'Regional tech summits', about: 'Keynotes and panels in your metro', reach: '300–2,000' },
  ] },
  { name: 'Marketing', shows: [
    { name: 'Content Marketing World', about: 'The largest content marketing event', reach: '4,000 attendees' },
    { name: 'MozCon', about: 'SEO and digital marketing', reach: '1,500 attendees' },
    { name: 'Marketing association chapters', about: 'AMA and local chapter talks', reach: '100–400' },
    { name: 'Brand & demand summits', about: 'Virtual and hybrid stages', reach: '1,000+ live' },
  ] },
  { name: 'Finance', shows: [
    { name: 'Future Proof', about: 'Wealth management festival', reach: '3,000 attendees' },
    { name: 'FinCon', about: 'Money media creators and advisors', reach: '2,500 attendees' },
    { name: 'CFA society events', about: 'Chapter lunches and panels', reach: '100–500' },
    { name: 'Fintech meetups', about: 'Demo days and founder panels', reach: '150–600' },
  ] },
  { name: 'Health & Wellness', shows: [
    { name: 'Health Optimisation Summit', about: 'Practitioners and performance', reach: '2,000 attendees' },
    { name: 'MindBodyGreen events', about: 'Wellness brand stages', reach: '1,000+ live' },
    { name: 'Hospital grand rounds', about: 'Clinical speaking slots', reach: '50–300' },
    { name: 'Fitness industry expos', about: 'Educator tracks', reach: '5,000+ attendees' },
  ] },
  { name: 'Leadership', shows: [
    { name: 'TEDx stages', about: 'Independently organized TED events', reach: '100–2,000' },
    { name: 'Chief events', about: "Executive women's network", reach: 'By invitation' },
    { name: 'Industry association keynotes', about: 'Annual meetings in your vertical', reach: '500–5,000' },
    { name: 'Corporate offsites', about: 'Paid internal speaking', reach: '50–500' },
  ] },
]

export const CATALOG: Record<Mode, ShowCategory[]> = { podcasts: PODCAST_CATALOG, stages: STAGE_CATALOG }

/** The eleven things booking one stage in-house takes. */
export const DIY_STEPS = [
  'Search for conferences in your industry',
  'Open every event site and check if they take outside speakers',
  'Find the call-for-proposals deadline, or realize it closed last month',
  "Hunt down the program chair's email",
  'Repeat for 200 events',
  'Build the spreadsheet',
  "Verify the emails so you don't burn your domain",
  'Buy and set up sending tools',
  'Write a pitch, then rewrite it per event',
  'Send, follow up, follow up again',
  'Track replies, negotiate dates, send your bio and headshot for the fifth time',
]

export interface Step {
  n: string
  title: string
  copy: string
}

export const STAGE_STEPS: Step[] = [
  { n: '01', title: 'Build', copy: "We scrape the events your buyers attend: conference speaker rosters, association calendars, call-for-proposals platforms, last year's agendas. Then we enrich for the person who actually picks speakers, not the info@ inbox." },
  { n: '02', title: 'Position', copy: 'A messaging workshop produces 3-5 talk angles tied to a problem planners are trying to fill a slot for right now. Specificity gets booked. "Leadership" does not.' },
  { n: '03', title: 'Pitch', copy: 'Daily outreach from our dedicated, warmed sending domains — we pitch you as our client. Personalized at the event level, sequenced, monitored for deliverability. Call-for-proposals submissions in parallel for events that use them.' },
  { n: '04', title: 'Connect', copy: 'When an organizer replies interested, we hand the conversation to you with full context and your kit. You take it from there — the dates, the talk, the relationship.' },
]

export interface Deliverable {
  title: string
  copy: string
}

export const DELIVERABLES: Deliverable[] = [
  { title: 'Outreach volume you can audit.', copy: 'Targeted pitches at volume, reported with sends, replies, and stage-by-stage pipeline.' },
  { title: 'Call-for-proposals coverage.', copy: 'We track open calls for speakers in your niche and submit on your behalf before the window closes.' },
  { title: 'A speaker kit that gets a yes.', copy: 'One-sheet, bio, talk titles, headshot direction. Optional reel.' },
  { title: 'Warm handoffs.', copy: 'Every interested reply lands in your inbox with context — you take the conversation from there.' },
  { title: 'Weekly report.', copy: "What went out, who replied, what's booked, what's next. No guessing." },
  { title: 'Monthly strategy call.', copy: 'Refine angles, reprioritize industries, plan around seasonal cycles.' },
]

export interface TimelineEntry {
  when: string
  title: string
  copy: string
}

export const TIMELINE: TimelineEntry[] = [
  { when: 'Week 1', title: 'Launch', copy: 'Strategy kickoff, positioning workshop, kit built, lists scraped and enriched, domains warmed, pitches approved.' },
  { when: 'Weeks 2–12', title: 'Pipeline', copy: 'Daily outreach live. First replies and conversations. Early wins are usually associations, virtual events and smaller stages that book on shorter cycles.' },
  { when: 'Month 3 onward', title: 'Bookings compound', copy: 'Conferences confirm for the following two quarters. The calendar fills while outreach keeps running.' },
]

export const NOT_FOR = [
  'People who want to be paid $25K to speak and nothing else (a bureau will serve you better)',
  'Anyone selling a $15 book',
  "Anyone who needs a stage next month (see timeline below, we won't lie to you)",
]

export const WHY_NOT_BOOKED = [
  'They only chase the big paid keynotes and ignore the 200 association meetings that book every year',
  'They pitch themselves instead of pitching a session the planner needs',
  'They send 15 emails from their main domain and stop',
  'They miss call-for-proposals windows because nobody is watching them',
  'They rely on directories and referrals, which grow at someone else’s pace',
]

/** Three columns: you, a VA, us. */
export const MATH_ROWS: Array<[string, string, string]> = [
  ['10–20 pitches a month, when you have time', '5–10 pitches a day from one inbox', 'Hundreds of targeted pitches a month from dedicated sending domains'],
  ['Lists built by Googling', 'Static database, last updated who knows when', "Lists scraped from live agendas, call-for-proposals pages and last year's speaker rosters, refreshed monthly"],
  ['No follow-up', 'Manual follow-up', '4-touch sequences with every follow-up individually researched and personalized — interested replies go straight to you'],
  ['One inbox, one reputation', 'One inbox, one reputation', 'Our warmed infrastructure and our name — we pitch you as our client, with zero risk to your main domain'],
]

/** Three columns: channel, what most people use it for, how we use it. */
export const CHANNEL_ROWS: Array<[string, string, string]> = [
  ['Podcasts', 'Low-effort visibility', 'Trust and warm pipeline, plus proof planners watch before saying yes'],
  ['Associations', 'Ignored', "Consistent, recurring stages full of one industry's buyers"],
  ['Conferences', 'Prestige', 'Highest-value rooms, booked 6–12 months out via calls for proposals and direct pitch'],
  ['Virtual events', 'Afterthought', 'Shortest booking cycle, fastest early wins'],
]

export const PODCAST_PLAN_INCLUDES = [
  'Targeted outreach to vetted shows in your niche, every week',
  'Speaker one-sheet, positioning, and pitch angles written for you',
  'You approve every show before we confirm the booking',
  'Prep brief and talking points before every recording',
  'No setup fees, no pay-to-play placements — 3-month minimum, then month to month',
]

export const STAGE_PLAN_INCLUDES = [
  'Targeted pitches to conferences, associations and events, every week',
  'Call-for-proposals submissions before the windows close',
  'Speaker kit, positioning and talk angles written for you',
  'Warm handoffs — interested organizers land in your inbox with context',
  'Weekly report and monthly strategy call',
]

export interface Faq {
  q: string
  a: string
}

export const PODCAST_FAQ: Faq[] = [
  { q: 'How many shows will I get booked on?', a: "It depends on your niche and how bookable your story is, but most clients see 2–4 confirmed bookings a month once outreach ramps up (usually by week three). We tell you the honest number for your niche on the first call — including if it's lower." },
  { q: 'What kinds of podcasts do you pitch?', a: 'Vetted, active shows with real audiences in your space — not pay-to-play placements or dormant feeds. You see every show before we pitch it, and you approve every booking before we confirm.' },
  { q: 'When do I record my first episode?', a: 'Pitches go out in week one. Most clients have their first recording on the calendar within 3–5 weeks, and episodes typically publish 2–8 weeks after recording, depending on the show.' },
  { q: 'Is there a contract?', a: "A 3-month minimum to start — that's how long it takes outreach to ramp and bookings to land. After that it's month to month, cancel anytime. If we're not putting you on shows worth your time, you shouldn't be paying us." },
  { q: 'What do you need from me?', a: 'About an hour up front for the positioning interview, then roughly 15 minutes a week to approve shows. After that, just show up to the recordings — we handle everything else.' },
  { q: 'What if a host says no?', a: "Most do — that's the nature of outreach, and it's priced into the volume. Every pitch is personalized to the show, every follow-up is researched, and a no this quarter often becomes a yes next season when your proof gets stronger." },
  { q: 'How is this different from a PR agency?', a: 'PR agencies charge $2,000–5,000 a month, spread across press, awards, and everything else. We do exactly one thing — podcast guesting — and we do it every week.' },
]

export const STAGE_FAQ: Faq[] = [
  { q: 'What exactly am I paying for?', a: 'The pipeline, not the placement. We research the events, build the lists, write and send the pitches, submit to calls for proposals, and hand you every organizer who replies interested — with full context. You take the conversation from there and close the booking.' },
  { q: 'How many conversations will I get?', a: "We don't guarantee a number, and anyone who does is guessing. We guarantee the work: the pitch volume, the call-for-proposals coverage, the personalized follow-up, and a report you can audit. Put in front of enough of the right organizers, positioned correctly, the math works." },
  { q: 'How long until something lands?', a: "Organizers book speakers 2 to 6 months out; major conferences 6 to 12. Expect first interested replies within the first several weeks — usually associations and virtual events — and conference conversations to compound from month 3. That's why the plan has a 3-month minimum." },
  { q: 'How is this different from a speakers bureau?', a: 'Bureaus represent established names to planners who already have budget, and take a commission from the fee. We work the other direction: proactive outreach to get you into rooms, a flat monthly rate, and no cut of anything you earn.' },
  { q: 'How is this different from a VA with a database?', a: 'Volume and infrastructure. A VA sends a handful of templated emails a day from one inbox off a stale database. We pitch from dedicated warmed domains, off lists scraped from live event data, with every follow-up researched and personalized — and you get a report showing exactly what went out.' },
  { q: 'Do I need to be an experienced speaker?', a: 'No. You need a point of view on a specific problem and the willingness to deliver it. Positioning matters more than credits — we start with associations and virtual events to build the reel and the proof, then move up.' },
  { q: 'Are these paid stages?', a: 'Some. Corporate and larger conference stages usually pay; associations and community events often offer an honorarium or nothing. We target by audience fit first, because a free stage full of your buyers beats a paid one full of strangers.' },
  { q: 'Is this pay-to-play?', a: "No. We pitch earned stages only. If a sponsored slot genuinely fits, we'll flag it — but we never buy your way on." },
  { q: 'What do you need from me?', a: 'A kickoff call, a positioning workshop, and approval on pitch angles — about a week one effort. After launch, you take the conversations with interested organizers; we keep generating them.' },
  { q: 'Can I cancel?', a: "After the initial 3 months, yes — month to month from there, no notice period games. We'd rather earn the renewal than lock you in." },
]

export const FAQ: Record<Mode, Faq[]> = { podcasts: PODCAST_FAQ, stages: STAGE_FAQ }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * "Starting in September means your Q1–Q2 2027 calendar." The design wrote
 * that for the month it was made; stages book four-plus months out, so the
 * window the reader is filling is the two quarters that begin four months
 * from now.
 */
export const startingLine = (now: Date): string => {
  const first = new Date(now.getFullYear(), now.getMonth() + 4, 1)
  const second = new Date(first.getFullYear(), first.getMonth() + 3, 1)
  const quarter = (d: Date) => `Q${Math.floor(d.getMonth() / 3) + 1}`
  const window = first.getFullYear() === second.getFullYear()
    ? `${quarter(first)}–${quarter(second)} ${first.getFullYear()}`
    : `${quarter(first)} ${first.getFullYear()}–${quarter(second)} ${second.getFullYear()}`
  return `Starting in ${MONTHS[now.getMonth()]} means your ${window} calendar. That's the reason to start now, not a reason to wait.`
}

/** "The SaaS Podcast" → "SP": what stands in the artwork mat until there is art. */
export const initials = (name: string): string =>
  name
    .split(/\s+/u)
    .filter((word) => word && !/^(the|of|and|&)$/iu.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
