import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Clapperboard, MessageSquare, Mic, Send, ThumbsUp } from 'lucide-react'

import PageSEO from '@/components/seo/PageSEO'
import Dither from '@/components/landing/Dither'
import HomeVignettes from '@/components/landing/HomeVignettes'
import {
  CALL_LABEL, CALL_NOTE, CALL_PROMISE, CALL_URL, CLIENT_NAMES, CLIENT_QUOTES, CONTACT_EMAIL, FAQ, FOUNDER, HERO, HERO_BUBBLES, HOMEPAGE_META_DESCRIPTION,
  HERO_SECONDARY, HOW_FIRST_RECORDING, HOW_FLOW, HOW_REQUEST, MINIMUM_MONTHS, MONTHLY_PRICE_TEXT, PODCAST_CATALOG, PLAN_INCLUDES,
  PR_AGENCY_NOTE, PRINCIPLES, WEEKLY_MINUTES, initials,
} from '@/lib/landingContent'
import '@/styles/homepage.css'

/*
 * The done-for-you homepage, after the pastel-dither system but held to near
 * monochrome: warm paper, near-black ink, warm-grey ordered-dither art that
 * dissolves into the page, and one accent colour on the last words of the
 * hero's and the closer's headlines.
 * Every class is .hp-*, styled by src/styles/homepage.css.
 */

/** Whether to hold still. Read on use, and safe with no window and no matchMedia. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true

const Brand = () => (
  <><span className="hp-mark" aria-hidden="true" /><span className="hp-wordmark">Get On A Pod</span></>
)

/** A link that leaves the site in a new tab, and says so to a screen reader. */
const NewTab = () => <span className="hp-sr"> (opens in a new tab)</span>

/** The headline's last words take the accent colour: "…already <listen to.>" */
const splitLastWords = (text: string, count: number): [string, string] => {
  const words = text.split(' ')
  return [words.slice(0, -count).join(' '), words.slice(-count).join(' ')]
}

/**
 * A show's artwork when there is one, its initials otherwise — and its initials
 * again if the artwork fails to load, so a bad file never shows a broken image.
 */
const Plate = ({ name, art }: { name: string; art?: string }) => {
  const [failed, setFailed] = useState(false)
  if (!art || failed) return <div className="hp-plate" aria-hidden="true">{initials(name)}</div>
  return (
    <div className="hp-plate hp-plate-art">
      <img src={art} alt={`${name} artwork`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </div>
  )
}

/** A client's face, cut from their video; their initials if there is none or it fails to load. */
const Portrait = ({ name, src }: { name: string; src?: string }) => {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="hp-portrait hp-portrait-initials" aria-hidden="true">{initials(name)}</span>
  return (
    <span className="hp-portrait">
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  )
}

const Hero = () => {
  const [plain, gradient] = splitLastWords(HERO.title[1], 2)
  return (
    <header className="hp-hero">
      <div className="hp-wrap hp-hero-center">
        <h1>
          {HERO.title[0]}{' '}{plain}{' '}<span className="hp-grad">{gradient}</span>
        </h1>
        <p className="hp-lede">{HERO.kicker}.</p>
        <div className="hp-actions">
          <a className="hp-btn hp-btn-primary hp-btn-lg" href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}<NewTab /></a>
          <a className="hp-btn hp-btn-secondary hp-btn-lg" href="#how">{HERO_SECONDARY}</a>
        </div>
        <p className="hp-note">{CALL_PROMISE} {CALL_NOTE}</p>
        {/* The terms, before anyone scrolls to the pricing section that states them. */}
        <p className="hp-facts">
          <span className="hp-badge">{MONTHLY_PRICE_TEXT} a month</span>
          <span className="hp-badge">{MINIMUM_MONTHS}-month minimum</span>
          <span className="hp-badge">about {WEEKLY_MINUTES} minutes a week of your time</span>
          <span className="hp-badge">you approve every show</span>
          <span className="hp-badge">5 clips from every episode</span>
        </p>
        <a className="hp-proof" href="#quotes">
          <span className="hp-proof-faces" aria-hidden="true">
            {CLIENT_QUOTES.map((q) => <Portrait key={q.name} name={q.name} src={q.portrait} />)}
          </span>
          <span>Six founders, on camera, on why it worked</span>
        </a>
      </div>
      <div className="hp-hero-scene" aria-hidden="true">
        <Dither scene="hero" />
        {HERO_BUBBLES.map((bubble, i) => (
          <span key={bubble.text} className={`hp-bub hp-b${i + 1}${bubble.done ? ' hp-bub-done' : ''}`}>{bubble.text}</span>
        ))}
      </div>
    </header>
  )
}

const Wordmarks = () => {
  if (CLIENT_NAMES.length === 0) return null
  // The track is doubled so the loop is seamless; the copy is decorative.
  return (
    <section className="hp-clients" aria-label="Clients">
      <p className="hp-clients-label">Clients we've worked with</p>
      <div className="hp-marquee">
        <div className="hp-marquee-track">
          {CLIENT_NAMES.map((name) => <span key={name}>{name}</span>)}
          {CLIENT_NAMES.map((name) => <span key={`${name}-again`} aria-hidden="true">{name}</span>)}
        </div>
      </div>
    </section>
  )
}

/** One icon per HOW_FLOW step, in order; the last step is the finished one. */
const FLOW_ICONS = [MessageSquare, Send, ThumbsUp, Mic, Clapperboard]

const PodcastsHow = () => (
  <section id="how" className="hp-section">
    <div className="hp-wrap">
      <h2>From one call to a week of posts.</h2>
      <div className="hp-flowcard">
        <div className="hp-flowcard-head">
          <p>“{HOW_REQUEST}”</p>
          <span className="hp-badge hp-badge-ink">{HOW_FIRST_RECORDING}</span>
        </div>
        <div className="hp-flow-band">
          <ol className="hp-track">
            {HOW_FLOW.map(({ label, when }, i) => {
              const Icon = FLOW_ICONS[i] ?? Clapperboard
              const done = i === HOW_FLOW.length - 1
              return (
              <li className="hp-step" key={label}>
                <span className="hp-tile" aria-hidden="true"><Icon /></span>
                <span className={done ? 'hp-badge hp-badge-ink' : 'hp-badge'}>{label}</span>
                <span className="hp-step-when">{when}</span>
              </li>
              )
            })}
          </ol>
        </div>
      </div>
      <HomeVignettes />
      <p className="hp-more"><Link to="/what-to-expect">See the week-by-week plan</Link></p>
    </div>
  </section>
)

/** Sample podcasts by niche. */
const Shows = () => {
  const catalog = PODCAST_CATALOG
  const [category, setCategory] = useState(0)
  const index = Math.min(category, catalog.length - 1)
  const active = catalog[index]
  const tabs = useRef<Array<HTMLButtonElement | null>>([])

  // One tab stop for the strip; the arrow keys walk the niches and the
  // selection follows focus, as the tabs pattern expects.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: catalog.length - 1 - index }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = (index + step + catalog.length) % catalog.length
    setCategory(next)
    tabs.current[next]?.focus()
  }

  return (
    <section id="shows" className="hp-section hp-section-top0">
      <div className="hp-wrap">
        <h2>We pitch you to shows like these.</h2>
        <div className="hp-tabs" role="tablist" aria-label="Niche" onKeyDown={onKey}>
          {catalog.map((cat, i) => (
            <button
              type="button"
              role="tab"
              id={`hp-tab-${i}`}
              aria-controls="hp-shows-panel"
              key={cat.name}
              ref={(el) => { tabs.current[i] = el }}
              className="hp-tab"
              aria-selected={i === index}
              tabIndex={i === index ? 0 : -1}
              onClick={() => setCategory(i)}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="hp-shows" role="tabpanel" id="hp-shows-panel" aria-labelledby={`hp-tab-${index}`}>
          {active.shows.map((show) => (
            <figure className="hp-show" key={show.name}>
              <div className="hp-viz hp-viz-center"><Plate name={show.name} art={show.art} /></div>
              <figcaption>
                <span className="hp-show-name">{show.name}</span>
                <span className="hp-show-about">{show.about}</span>
                <span className="hp-show-reach">{show.reach}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="hp-more hp-muted">A few samples, not the list — yours is built for your niche on the first call.</p>
      </div>
    </section>
  )
}

const Principles = () => (
  <section className="hp-dark-band" aria-labelledby="hp-principles">
    <Dither scene="band" className="hp-band-art" ground="--band" clearBand />
    <div className="hp-wrap">
      <h2 id="hp-principles">Booked by hand, not by blast.</h2>
      <ul className="hp-chips">
        {PRINCIPLES.map((text) => <li key={text} className="hp-chip">{text}</li>)}
      </ul>
    </div>
  </section>
)

/** "Watch on YouTube", or wherever the testimonial is hosted. */
const watchLabel = (url: string) => (/vimeo\.com/iu.test(url) ? 'Watch on Vimeo' : 'Watch on YouTube')

/** How long a testimonial holds before the carousel moves on by itself. */
const QUOTE_HOLD_MS = 9000

const twoDigits = (n: number) => String(n).padStart(2, '0')

/**
 * One client at a time, their face beside their words. It moves on by itself —
 * never for a reader who asked for less motion — holds while pointed at or
 * focused, and stops for good once the reader takes the controls. Every slide
 * stays mounted in one grid cell, so the section is as tall as the longest
 * quote and nothing below it jumps as they change.
 */
const Quotes = () => {
  const count = CLIENT_QUOTES.length
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(() => count > 1 && !prefersReducedMotion())
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const moving = playing && !hovered && !focused

  useEffect(() => {
    if (!moving) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), QUOTE_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [moving, index, count])

  if (count === 0) return null

  const go = (next: number) => {
    setPlaying(false)
    setIndex((next + count) % count)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    go(index + (event.key === 'ArrowRight' ? 1 : -1))
  }

  // Touch and pen only: a mouse drag across a quote is someone selecting it.
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    swipe.current = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY }
  }
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = event.clientX - start.x
    // Written so that a missing coordinate (NaN) fails it: no swipe, not a step back.
    const swiped = Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(event.clientY - start.y)
    if (!swiped) return
    go(index + (dx < 0 ? 1 : -1))
  }

  return (
    <section
      id="quotes"
      className="hp-section"
      aria-roledescription="carousel"
      aria-label="Testimonials"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}
    >
      <div className="hp-wrap">
        <div className="hp-carousel-head">
          <h2>Founders, in their own words.</h2>
          {count > 1 ? (
            <div className="hp-carousel-controls">
              <span className="hp-carousel-count" aria-hidden="true">{twoDigits(index + 1)} / {twoDigits(count)}</span>
              <button type="button" className="hp-btn hp-btn-secondary hp-btn-sm" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
              <button type="button" className="hp-icon-btn" aria-label="Previous testimonial" onClick={() => go(index - 1)}>←</button>
              <button type="button" className="hp-icon-btn" aria-label="Next testimonial" onClick={() => go(index + 1)}>→</button>
            </div>
          ) : null}
        </div>

        <div className="hp-quote-card">
          <div
            className="hp-carousel-stage"
            aria-live={moving ? 'off' : 'polite'}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { swipe.current = null }}
          >
            {CLIENT_QUOTES.map((q, i) => {
              const active = i === index
              return (
                <figure
                  key={q.name}
                  className="hp-slide"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  aria-hidden={!active}
                  data-active={active}
                  // React 18 has no `inert` prop; the empty string is the attribute being present.
                  {...(active ? {} : { inert: '' })}
                >
                  <span className="hp-slide-portrait"><Portrait name={q.name} src={q.portrait} /></span>
                  <div className="hp-slide-body">
                    <blockquote className="hp-slide-quote">{q.quote}</blockquote>
                    <figcaption className="hp-slide-caption">
                      <span className="hp-quote-name">{q.name}</span>
                      <span className="hp-quote-role">{q.role}</span>
                      {q.videoUrl ? (
                        <a className="hp-quote-watch" href={q.videoUrl} target="_blank" rel="noopener noreferrer">
                          <span className="hp-quote-play" aria-hidden="true" />
                          <span>{watchLabel(q.videoUrl)}<span className="hp-sr"> — {q.name}</span><NewTab /></span>
                        </a>
                      ) : null}
                    </figcaption>
                  </div>
                </figure>
              )
            })}
          </div>

          {count > 1 ? (
            <div className="hp-carousel-foot">
              <div className="hp-carousel-picker" role="group" aria-label="Choose a client">
                {CLIENT_QUOTES.map((q, i) => (
                  <button
                    key={q.name}
                    type="button"
                    className="hp-carousel-pick"
                    aria-label={q.name}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => go(i)}
                  >
                    <Portrait name={q.name} src={q.portrait} />
                  </button>
                ))}
              </div>
              <span className="hp-carousel-progress" aria-hidden="true">
                {moving ? <span key={index} className="hp-carousel-progress-fill" style={{ animationDuration: `${QUOTE_HOLD_MS}ms` }} /> : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

const Pricing = () => (
  <section id="pricing" className="hp-section hp-section-top0">
    <div className="hp-wrap">
      <h2>One plan.</h2>
      <div className="hp-pricing">
        <div className="hp-plan">
          <p className="hp-amount">{MONTHLY_PRICE_TEXT}<small>/month</small></p>
          <p className="hp-plan-note">{MINIMUM_MONTHS}-month minimum, then month to month.</p>
          <a className="hp-btn hp-btn-invert hp-btn-lg" href={CALL_URL} target="_blank" rel="noopener noreferrer">Book a call to start<NewTab /></a>
          <Dither scene="plan" className="hp-plan-art" ground="--ink" />
        </div>
        <div className="hp-includes">
          <ul>
            {PLAN_INCLUDES.map((text) => (
              <li key={text}><span className="hp-check" aria-hidden="true">✓</span><span>{text}</span></li>
            ))}
          </ul>
          <p className="hp-muted">{PR_AGENCY_NOTE}</p>
        </div>
      </div>
    </div>
  </section>
)

const Faq = () => (
  <section id="faq" className="hp-section hp-section-top0">
    <div className="hp-wrap hp-faq">
      <h2>Questions.</h2>
      <div className="hp-faq-list">
        {FAQ.map((item) => (
          <details key={item.q}>
            <summary><span>{item.q}</span><span className="hp-faq-plus" aria-hidden="true" /></summary>
            <p className="hp-faq-a">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
)

const Closer = () => (
  <section id="book" className="hp-closer">
    <div className="hp-wrap hp-closer-center">
      <h2>See the shows we would <span className="hp-grad">pitch you to.</span></h2>
      <p className="hp-closer-copy">{CALL_PROMISE} We also tell you honestly how many bookings to expect in your niche, including if the number is lower than you hoped.</p>
      <div className="hp-actions">
        <a className="hp-btn hp-btn-primary hp-btn-lg" href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}<NewTab /></a>
      </div>
      <p className="hp-note">{CALL_NOTE}</p>
      <figure className="hp-host">
        <img src={FOUNDER.photo} alt={FOUNDER.photoAlt} width={480} height={480} loading="lazy" decoding="async" />
        <figcaption>
          <span className="hp-muted">Your call is with</span>
          <b>{FOUNDER.name}</b>
          <span className="hp-muted">{FOUNDER.role}</span>
        </figcaption>
      </figure>
    </div>
    <div className="hp-closer-scene" aria-hidden="true"><Dither scene="closer" /></div>
  </section>
)

const Footer = () => (
  <footer className="hp-footer">
    <div className="hp-wrap">
      <div className="hp-footer-grid">
        <div>
          <span className="hp-brand"><Brand /></span>
          <p className="hp-muted hp-footer-tagline">Done-for-you podcast guesting for tech founders and SaaS owners. You bring the story — we get you on the show.</p>
        </div>
        <div className="hp-footer-col">
          <span className="hp-footer-head">Explore</span>
          <a href="#how">How it works</a>
          <a href="#shows">The shows</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">Questions</a>
        </div>
        <div className="hp-footer-col">
          <span className="hp-footer-head">Talk to us</span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}<NewTab /></a>
          <Link to="/platform">For agencies</Link>
        </div>
        <div className="hp-footer-col">
          <span className="hp-footer-head">Also</span>
          <Link to="/what-to-expect">What to expect</Link>
          <Link to="/portal/login">Client sign-in</Link>
          <Link to="/login">Agency sign-in</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
      <div className="hp-footer-foot">
        <span>© {new Date().getFullYear()} Get On A Pod</span>
        <span>Booked by hand, not by blast.</span>
      </div>
    </div>
  </footer>
)

const Landing = () => {
  const { hash, key } = useLocation()

  // The router changes the URL without moving the page. `key` changes on every
  // navigation, including one to the hash already in the address bar, so
  // pressing a nav link while already at its section still scrolls there.
  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [hash, key])

  return (
    <div className="hp-page">
      <PageSEO
        title="Podcast booking for tech founders and SaaS owners | Get On A Pod"
        description={HOMEPAGE_META_DESCRIPTION}
        path="/"
        keywords="podcast booking for SaaS founders, tech founder podcast guesting, B2B SaaS podcast marketing, done-for-you podcast booking, founder-led marketing"
      />
      <a className="hp-skip" href="#main">Skip to content</a>

      <aside className="hp-announce" aria-label="New offer">
        <span className="hp-announce-tag">New</span>
        <span className="hp-announce-text">Host a show? Five clips from your last episode, free, in 72 hours.</span>
        <Link className="hp-announce-link" to="/clips">Get your free cut<span aria-hidden="true">{' →'}</span></Link>
      </aside>

      <nav className="hp-nav" aria-label="Site">
        <div className="hp-wrap hp-nav-in">
          <Link className="hp-brand" to="/"><Brand /></Link>
          <div className="hp-nav-links">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <Link to="/portal/login">Client sign-in</Link>
          </div>
          <a className="hp-btn hp-btn-primary" href={CALL_URL} target="_blank" rel="noopener noreferrer">Book a call<NewTab /></a>
        </div>
      </nav>

      <main id="main">
        <Hero />
        <Wordmarks />
        <PodcastsHow />
        <Shows />
        <Principles />
        <Quotes />
        <Pricing />
        <Faq />
        <Closer />
      </main>

      <Footer />
    </div>
  )
}

export default Landing
