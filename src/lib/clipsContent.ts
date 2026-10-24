/**
 * Every word on getonapod.com/clips, in page order.
 *
 * The approved copy lives in the design brief's page-copy.txt; this file is
 * that document as data, so a diff between the two is a diff of strings, not of
 * markup. Nothing here is invented: no testimonials, no logos, no view counts.
 */

export const CLIPS_PATH = '/clips'
export const CLIPS_CAL_URL = 'https://cal.com/jonathan-garces-x5v8tl/30minutes'
export const CLIPS_CONTACT_EMAIL = 'jonathan@getonapod.com'
export const CLIPS_CTA = 'Get your free cut'

export const CLIPS_SEO = {
  title: 'Five clips from your last episode, free, in 72 hours | Get On A Pod',
  description:
    'AI-enabled human editors cut five clips and two thumbnails from your latest podcast or YouTube episode in 72 hours, free. Like them? $750 a month, posted for you.',
  image: '/clips-og.png',
  imageAlt: 'Five clips from your last episode. Free. In 72 hours. Get On A Pod clips.',
}

export const CLIPS_NAV = [
  { href: '#work', label: 'Work' },
  { href: '#process', label: 'Process' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export const CLIPS_HERO = {
  badge: 'AI-enabled human editors. For podcasts and long-form video.',
  title: ['Five clips from your last episode.', 'Free. In 72 hours.'],
  lead:
    "Like them? We cut up to three episodes a month and post the clips to your YouTube, LinkedIn, Instagram and TikTok for $750. You record. We do the rest. Don't like them? Keep the clips anyway.",
  secondary: 'AI cut vs our cut',
  credibility:
    'AI does the heavy lifting. Human editors who live in podcasts make every call. Built by the team behind Get On A Pod.',
  badgeRing: 'FREE CUT · 72 HOURS · 5 CLIPS · 2 THUMBNAILS · ',
  stageCaption: 'One episode in. Five clips out. On a loop, like your week.',
  stageLabel: 'One episode frame being cut into five vertical clips',
}

/** The five jobs, in the order they are cut. Shared by the blade stage, the fan and the transcript. */
export interface ClipJob {
  time: string
  label: string
  /** The on-screen caption, with the lime phrase split out where there is one. */
  caption: [string, string?]
  /** The eight-bar waveform on the slab face; bars 3–6 are lime. */
  bars: number[]
  /** Where the slab flies when the blade passes. */
  fly: { dx: number; dy: number; dz: number; ry: number; rx: number }
  /** Progress bar offset on its phone, so no two phones ever sync. */
  delay: string
}

export const CLIPS_JOBS: ClipJob[] = [
  { time: '00:03:41', label: 'THE HOOK', caption: ['Nobody tells you ', 'this part'], bars: [8, 52, 21, 35, 19, 62, 15, 15], fly: { dx: -150, dy: -26, dz: 40, ry: -28, rx: 6 }, delay: '0s' },
  { time: '00:12:04', label: 'THE NUMBER', caption: ['The one number that changed our pricing'], bars: [27, 63, 11, 20, 29, 56, 24, 38], fly: { dx: -70, dy: 12, dz: 90, ry: -12, rx: -4 }, delay: '-2s' },
  { time: '00:24:37', label: 'THE STORY', caption: ['We almost lost the ', 'whole deal'], bars: [25, 43, 36, 49, 15, 26, 44, 53], fly: { dx: 0, dy: -40, dz: 130, ry: 0, rx: 8 }, delay: '-4s' },
  { time: '00:35:50', label: 'THE TAKE', caption: ['Stop listing. ', 'Start owning.'], bars: [15, 8, 45, 49, 32, 23, 39, 38], fly: { dx: 70, dy: 16, dz: 90, ry: 12, rx: -4 }, delay: '-1s' },
  { time: '00:49:12', label: 'THE ASK', caption: ['Link in bio. ', 'Go.'], bars: [47, 33, 27, 24, 57, 36, 9, 10], fly: { dx: 150, dy: -22, dz: 40, ry: 28, rx: 6 }, delay: '-5.5s' },
]

export const CLIPS_WORK = {
  ghost: 'CUT',
  fanLabel: 'Five phones fanned out, one clip on each',
  // The brief's bracketed note is an internal placeholder and is not rendered.
  caption: 'Five jobs. One clip each. Plus two thumbnails for the full episode.',
}

export const CLIPS_MARQUEE = {
  lead: 'Cut for shows in',
  niches: ['Real estate', 'Wealth', 'Trading', 'Wellness', 'Founders', 'Consulting', 'Agencies'],
}

export interface BigNumber {
  /** Where the count lands. */
  value: number
  /** Where the count starts; $0 counts down from 750. */
  from: number
  prefix?: string
  suffix?: string
  label: string
  lime?: boolean
}

export const CLIPS_NUMBERS: BigNumber[] = [
  { value: 5, from: 0, label: 'clips, every episode' },
  { value: 2, from: 0, label: 'thumbnails, every episode' },
  { value: 72, from: 0, suffix: 'h', label: 'from link to inbox', lime: true },
  { value: 4, from: 0, label: "platforms. We post, you don't" },
  { value: 0, from: 750, prefix: '$', label: "to see if we're any good" },
]

export const CLIPS_BENTO = {
  eyebrow: 'AI-enabled human editors',
  title: 'The machine watches every minute. A podcast editor makes the cut.',
  intro:
    'Three years inside podcasts: booking guests, prepping hosts, cutting episodes. We know what a hook sounds like and why the intro is never the clip. The AI hands our editors the whole episode at a glance. The humans decide.',
  transcript: {
    eyebrow: 'AI · reads the whole episode',
    body: 'Pulls the episode from YouTube, transcribes every word and scores every moment for hook, clarity and payoff.',
  },
  waveform: {
    eyebrow: 'AI · lights the candidates',
    body: 'Candidates lit on the timeline. A human confirms or overrules every one.',
  },
  crop: {
    eyebrow: 'AI · follows the speaker',
    label: '9:16 CROP',
    body: 'The vertical crop follows whoever is talking, so no half-faces and no cut-off screens.',
  },
  caption: {
    eyebrow: 'AI drafts · a human checks',
    body: 'The machine drafts every caption. A person reads every one. Every name gets a check.',
  },
  editor: {
    eyebrow: 'What the human editor does',
    title: "Software can find a sentence. It can't tell you which one makes a broker stop scrolling.",
    items: [
      'Picks the five: hook, number, story, take, ask',
      'Cuts to the point, not the intro, and trims the dead air',
      'Writes the on-screen hook and lights the one phrase that stops a stranger',
      'Matches your fonts, colors and caption style from the brand sheet',
      'Checks names, spelling, crop and whether the clip makes the point',
      'Never touches your face or voice. Nothing synthetic, ever',
    ],
  },
}

/** The transcript scroller: time, line, and the job tag when the line is a clip. */
export const CLIPS_TRANSCRIPT: Array<{ time: string; text: string; tag?: string }> = [
  { time: '00:00:12', text: 'welcome back to the show, today we have' },
  { time: '00:01:48', text: 'before we start, quick housekeeping' },
  { time: '00:03:41', text: 'nobody tells you this part', tag: 'hook' },
  { time: '00:07:05', text: 'so walk me through how that works' },
  { time: '00:12:04', text: 'the one number that changed our pricing', tag: 'number' },
  { time: '00:18:30', text: 'yeah, and I think the market' },
  { time: '00:24:37', text: 'we almost lost the whole deal', tag: 'story' },
  { time: '00:31:12', text: "that's a great question, honestly" },
  { time: '00:35:50', text: 'stop listing, start owning', tag: 'take' },
  { time: '00:44:03', text: 'where can people find you' },
  { time: '00:49:12', text: 'link in bio, go', tag: 'ask' },
  { time: '00:52:18', text: 'thanks for listening, see you next week' },
]

export const CLIPS_COMPARE = {
  eyebrow: 'Drag it',
  title: 'Same episode. Two cuts.',
  body:
    'Left: what an AI clip tool hands you on its own. The intro, a crop that loses the face, a typo in your name. Right: the same episode after a human who knows podcasts has been through it.',
  rangeLabel: 'AI tool ← drag → human editor',
  human: { tag: 'HUMAN CUT', time: '00:03:41 · THE HOOK', caption: ['Nobody tells you ', 'this part'] as [string, string], byline: 'YOUR NAME · YOUR SHOW' },
  ai: { tag: 'AI TOOL, RAW', time: '00:00:04 · THE INTRO', caption: 'Welcome back to the show, today we', bylineName: 'YUOR NAME · ', bylineShow: 'YOUR SHWO' },
}

export const CLIPS_PROCESS = {
  eyebrow: 'How it works',
  title: 'From link to posted. You do one step.',
  steps: [
    { kicker: '01 · SEND', title: 'You paste a link', body: 'Your channel or one episode. We pull the video and transcript from YouTube. Nothing to upload. This is your only step.', icon: 'link' },
    { kicker: '02 · CUT', title: 'AI maps it. A human picks five.', body: "Our tools transcribe the episode, score every moment and track who's talking. A podcast editor chooses the hook, the number, the story, the take and the ask, then cuts and captions them.", icon: 'scissors' },
    { kicker: '03 · CHECK', title: 'A second human checks', body: "Your name. Your guest's name. Every caption. The crop. Whether the clip makes the episode's point. Nothing ships that fails.", icon: 'check' },
    { kicker: '04 · POST', title: "We post. You don't log in.", body: 'On the monthly, every clip goes out on your YouTube, LinkedIn, Instagram and TikTok on a schedule you approve once. You never open a scheduler. On the free cut, the clips land in your inbox with the price.', icon: 'send' },
  ] as const,
}

export const CLIPS_TABLE = {
  eyebrow: 'Us vs the alternatives',
  title: 'AI speed. Human judgment. One column has both.',
  columns: ['getonapod.com/clips', 'AI clip tool', 'In-house editor'],
  /** Row label, then the three cells; `dim` marks the muted "no" answers. */
  rows: [
    { label: 'AI transcribes, maps and scores the whole episode in minutes', cells: ['Yes', 'Yes', 'Usually not'], dim: [false, false, true] },
    { label: 'A human who knows what a podcast hook sounds like picks the moments', cells: ['Yes', 'No', 'Depends who you hire'], dim: [false, true, false] },
    { label: 'Names and captions checked by a second person', cells: ['Yes', 'No', 'Sometimes'], dim: [false, true, false] },
    { label: 'Your face and voice left untouched', cells: ['Always', 'Depends on settings', 'Yes'], dim: [false, true, false] },
    { label: 'Posted to four platforms for you', cells: ['Yes', 'You do it', 'If you ask'], dim: [false, true, false] },
    { label: 'Try it on your own episode before paying', cells: ['Yes, free', 'Free tier', 'No'], dim: [false, false, true] },
    { label: 'What it costs you each month', cells: ['$750 for up to 3 episodes, month to month', 'A subscription plus your hours', 'A salary or a contractor'], dim: [false, false, false] },
  ],
}

export const CLIPS_CROSSED = {
  eyebrow: "The complaints don't lie",
  title: 'What hosts say back to clip agencies. And what we do instead.',
  body: 'Every line on the left is something a host has said to somebody selling clips. Every line on the right is a rule we run.',
  pairs: [
    ["The samples were somebody else's show.", 'Your episode or nothing. Every sample is cut from your show.'],
    ['They spelled my name wrong.', "A second person checks your name, your guest's name and every caption."],
    ['I hate what the AI did to my face.', 'AI works the timeline, never your face. Moments, captions, speaker tracking: yes. Filters, retouching, synthetic voice: never.'],
    ['The clip was my intro, not the point.', 'We cut the moment that carries the episode. Send timestamps if you have favorites.'],
    ['Nobody sent the Zoom link.', "No call required. The whole thing runs over email unless you'd rather talk."],
    ['I asked the price and never heard back.', 'The price is in the headline. The free cut costs nothing.'],
    ['Are you a bot?', 'A human, by name, answers the question you actually asked.'],
  ],
}

export const CLIPS_PRICING = {
  eyebrow: 'Pricing',
  title: 'Simple. Month to month. Starts free.',
  tiers: [
    {
      kicker: 'The free cut',
      price: '$0',
      term: 'one episode',
      body: 'See what we do with your show before you spend a dollar.',
      items: ['5 clips and 2 thumbnails from your latest episode', 'In your inbox inside 72 hours', 'Yours to post whatever you decide', 'No call, no card, no upload'],
      cta: { label: 'Get your free cut', href: '#cut', primary: false },
    },
    {
      kicker: 'Clips',
      badge: 'Most hosts',
      price: '$750',
      term: 'per month, up to 3 episodes',
      body: 'Up to three episodes a month, cut, checked and posted to your socials by us. Publish more? Add episodes below.',
      items: [
        '5 clips and 2 thumbnails from each episode, up to 3 a month, within 72 hours of airing',
        'Extra episodes at $225 each, same 72 hours, same editor',
        'Posted for you to YouTube Shorts, LinkedIn, Instagram and TikTok, from your accounts, on your schedule',
        'One Friday email with how the week went',
        'Cancel by replying to any email. Files are yours.',
      ],
      cta: { label: 'Start with the free cut', href: '#cut', primary: true },
    },
    {
      kicker: 'Clips + Guesting',
      price: '$1,500',
      term: 'per month',
      body: "Your show clipped, and you booked as a guest on other people's.",
      items: ['Everything in Clips', 'Pitched to podcasts your buyers already listen to', 'Bookings on your calendar with a prep brief', 'Guest episodes clipped too, so every appearance becomes a week of posts'],
      cta: { label: 'Book a call', href: CLIPS_CAL_URL, primary: false },
    },
  ],
  more: {
    eyebrow: 'Publish more than three a month?',
    title: 'Every episode past three is $225.',
    body: 'Same editor, same 72 hours, same posting. Billed at the end of the month on what you actually published.',
    rows: [
      ['Up to 3 episodes', 'Included in $750'],
      ['Each episode after that', '+$225'],
    ],
    lastRow: ['Daily show, or several shows', 'Book 15 minutes →'],
  },
  guarantee: {
    kicker: 'Guarantee',
    body: 'Not happy with a clip? We recut it until you are. No revision cap, no extra charge.',
  },
}

export const CLIPS_FOUNDER = {
  monogram: 'JG',
  name: 'Jonathan Garces',
  role: 'Founder, Get On A Pod',
  places: 'Miami · Medellín',
  eyebrow: 'A note from the founder',
  title: 'Your audience can spot AI slop in two seconds.',
  paragraphs: [
    "You've seen the clips. Auto-cropped, auto-captioned, a hook that was really the intro, a face that looks a little too smooth. Everyone can tell. The host knows. The audience knows. And it gets exactly the scroll it deserves.",
    'Whether you host a podcast or shoot long-form for YouTube, the old fix was a full-time editor. For most shows that never made sense either: a salary to cut four episodes a month, or a freelancer you brief, chase and check every single week.',
    "So we streamlined it. AI watches every minute, scores every moment, drafts every caption and tracks who's talking. Then a human editor who has lived inside podcasts picks the five, cuts to the point, and reads every word before it ships. The machine does the hours. The human makes the calls.",
    "That's what we mean by AI-enabled short-form editors. Not a tool you babysit. Not a payroll line. Clips that look like your show, every week, at a price a weekly podcast or YouTube channel can actually carry.",
    "If the clips are good, you'll know in the first ten seconds. If they aren't, you've lost nothing, and I'd like to hear why.",
  ],
  signature: 'Jonathan',
}

export const CLIPS_FIT = {
  eyebrow: 'Is this right for your show?',
  title: 'Built for podcast hosts and long-form creators with somewhere to send people.',
  yes: {
    kicker: 'A fit',
    items: [
      'Real estate brokers, team leads, lenders and investors with a show',
      'Financial advisors, tax strategists and trading educators',
      'Wellness practitioners with a program or a practice',
      'Founders, consultants and coaches who sell to the audience',
      "Agencies and production companies, for their own show or their clients'",
    ],
  },
  no: {
    kicker: "Not a fit, and we'll say so",
    items: [
      'Audio-only shows. Clips need video. If you record on Zoom or Riverside, send that file instead.',
      'Shows with no offer behind them. The clips will look good and change nothing.',
      'Anyone who needs a viral guarantee. We promise a week of presence from every episode. Nobody can promise a breakout.',
    ],
  },
}

export const CLIPS_FAQ = {
  eyebrow: 'FAQ',
  title: 'The ones hosts ask first.',
  items: [
    { q: 'Is the free cut really free?', a: "Yes. We cut it from your episode and you keep it whatever you decide. The catch is in the headline: if the clips are good, we'll ask you to buy the monthly. That's the whole pitch." },
    { q: 'Do I have to get on a call?', a: 'No. The sample, the price and the yes can all happen over email. A fifteen-minute call is there if you want one. It is never required.' },
    { q: 'My show is audio only. Can you still clip it?', a: "Not well, and we'd rather say so than send you a static-image clip. If you record on Zoom, Riverside or anything with a camera, send that file and we'll cut from it." },
    { q: 'Who picks the moments?', a: 'Software shortlists. A human editor who watched the episode picks five and cuts them. If you have favorite moments, send timestamps and they jump the queue.' },
    { q: 'Where does the AI come in?', a: 'Everywhere except your face and voice. Our tools pull the episode, transcribe it, map it, score every moment, track the speaker and draft captions. Human editors who know podcasts pick, cut and check. Nothing synthetic ever touches you.' },
    { q: 'I already have an editor.', a: "Keep them. Use the free cut as a benchmark. If ours don't beat theirs, you've lost nothing and gained five clips." },
    { q: 'Who posts?', a: "We do, from your accounts, on a schedule you approve once. If you'd rather post yourself, we send the files and the captions and you're done in ten minutes a week." },
    { q: 'I publish more than three episodes a month.', a: 'Then the plan is $750 plus $225 for each episode past three, billed at the end of the month on what you actually published. A show that does six a month lands at $1,425. Daily shows get their own editor and a quote.' },
    { q: 'Is there a contract?', a: 'Month to month. Cancel by replying to any email from us. The files are yours either way.' },
    { q: 'Already a Get On A Pod guesting client?', a: 'Clips from every booking are already in your plan. This page is for hosts who want the same treatment on their own show.' },
  ],
}

export const CLIPS_FINAL = {
  ghost: '72:00:00',
  eyebrow: 'Get your free cut',
  title: ['Send the link.', 'Clips in 72 hours.', 'Posted by us, not you.'],
  body: 'Five clips, two thumbnails, your name spelled right. Then you decide. We pull the episode from YouTube, so this form is the whole job.',
  form: {
    name: { label: 'Your name', placeholder: 'First name is fine' },
    email: { label: 'Email', placeholder: 'Where the clips go' },
    show: { label: 'Your show on YouTube', placeholder: 'Channel link or one episode' },
    submit: 'Cut my episode',
    note: 'No call. No card. No upload. A human replies, by name.',
    errors: {
      name: 'Add your name so we know who to reply to.',
      email: 'Add the email the clips should go to.',
      show: 'Paste a YouTube channel or episode link',
      failed: 'Something broke on our side. Email jonathan@getonapod.com and we\'ll start the clock by hand.',
    },
    success: {
      title: 'The clock is running.',
      body: (email: string) => `Five clips and two thumbnails, in ${email}, within 72 hours. Reply to the confirmation with timestamps if you have favorites.`,
      link: 'Book fifteen minutes anyway',
    },
  },
}

export const CLIPS_FOOTER = {
  tagline: 'Clips for hosts. Guesting for founders. AI-enabled human editors.',
  places: 'Miami · Medellín · Remote',
  explore: { kicker: 'Explore', links: [{ href: '#work', label: 'Work' }, { href: '#process', label: 'Process' }, { href: '#pricing', label: 'Pricing' }, { href: '/', label: 'Podcast guesting' }] },
  talk: { kicker: 'Talk to us', links: [{ href: `mailto:${CLIPS_CONTACT_EMAIL}`, label: CLIPS_CONTACT_EMAIL }, { href: CLIPS_CAL_URL, label: 'Book fifteen minutes' }] },
  also: { kicker: 'Also', links: [{ href: '/portal/login', label: 'Client sign-in' }, { href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }] },
  copyright: '© 2026 Get On A Pod LLC',
  motto: 'Your episode or nothing.',
}

/** Whether a link is a YouTube channel or episode. Mirrors the edge function's rule. */
export function isYouTubeUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, '')
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be')
}

/** 72:00:00 minus the time since `startedAt`, never below zero. */
export function countdownLabel(startedAt: number, now: number): string {
  const remaining = Math.max(0, SEVENTY_TWO_HOURS_MS - (now - startedAt))
  const totalSeconds = Math.floor(remaining / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000
