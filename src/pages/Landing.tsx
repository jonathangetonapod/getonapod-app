import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'

import PageSEO from '@/components/seo/PageSEO'
import {
  CALL_LABEL, CALL_URL, CLIENT_NAMES, CLIENT_QUOTES, CONTACT_EMAIL, FAQ, HERO, HERO_SECONDARY, MONTHLY_PRICE,
  PODCAST_CATALOG, PLAN_INCLUDES, initials,
} from '@/lib/landingContent'
import '@/styles/landing.css'

/** Whether to hold still. Read on use, and safe with no window and no matchMedia. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true

const Brand = () => (
  <>Get<i>on</i>a<i>Pod</i><b>.</b></>
)

const Mark = () => <span className="dfy-list-mark" aria-hidden="true" />

/** A link that leaves the site in a new tab, and says so to a screen reader. */
const NewTab = () => <span className="dfy-sr"> (opens in a new tab)</span>

/**
 * The square in a show's mat: its artwork when there is one, its initials
 * otherwise — and its initials again if the artwork fails to load, so a bad
 * file never shows a broken-image icon on the homepage.
 */
const Plate = ({ name, art }: { name: string; art?: string }) => {
  const [failed, setFailed] = useState(false)
  if (!art || failed) return <div className="dfy-plate" aria-hidden="true">{initials(name)}</div>
  return (
    <div className="dfy-plate dfy-plate-art">
      <img src={art} alt={`${name} artwork`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </div>
  )
}

const Hero = () => (
  <section className="dfy-hero">
    <span className="dfy-kicker">{HERO.kicker}</span>
    <h1>
      <span>{HERO.title[0]}</span>
      <span>{HERO.title[1]}</span>
    </h1>
    <p className="dfy-hero-lead">{HERO.lead}</p>
    <div className="dfy-cta-row">
      <a className="dfy-btn dfy-btn-primary" href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}<NewTab /></a>
      <a className="dfy-btn dfy-btn-ghost" href="#how">{HERO_SECONDARY}</a>
    </div>
  </section>
)

const Wordmarks = () => {
  if (CLIENT_NAMES.length === 0) return null
  // The track is doubled so the loop is seamless; the copy is decorative.
  return (
    <>
      <section className="dfy-section-tight" aria-label="Clients">
        <span className="dfy-kicker dfy-kicker-hero">Clients we've worked with</span>
        <div className="dfy-wordmarks">
          <div className="dfy-wordmarks-track">
            {CLIENT_NAMES.map((name) => <span key={name}>{name}</span>)}
            {CLIENT_NAMES.map((name) => <span key={`${name}-again`} aria-hidden="true">{name}</span>)}
          </div>
        </div>
      </section>
      <hr className="dfy-rule" />
    </>
  )
}

const PodcastsHow = () => (
  <section id="how" className="dfy-how-podcasts">
    <span className="dfy-kicker">How it works</span>
    <div className="dfy-how-row">
      <p className="dfy-how-n dfy-tnum">01</p>
      <h2 className="dfy-how-title">We craft your story</h2>
      <p className="dfy-how-copy">A one-hour positioning interview in week one. From it we write your positioning, a speaker one-sheet and three angles a host can put in front of their audience.</p>
    </div>
    <div className="dfy-how-row">
      <p className="dfy-how-n dfy-tnum">02</p>
      <h2 className="dfy-how-title">We pitch the right shows</h2>
      <p className="dfy-how-copy">Pitches go out in week one, each written for that show, with researched follow-ups. We pitch active podcasts with real audiences in your niche, never paid placements, and you approve every show before we confirm.</p>
    </div>
    <div className="dfy-how-row">
      <p className="dfy-how-n dfy-tnum">03</p>
      <h2 className="dfy-how-title">You show up and talk</h2>
      <p className="dfy-how-copy">Most clients record their first episode within 3–5 weeks. Every booking lands on your calendar with a prep brief: the host, the audience, the angle and the one thing to plug.</p>
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
    <section id="shows" className="dfy-section">
      <span className="dfy-kicker">The shows</span>
      <h2 className="dfy-shows-title">We pitch you to shows like these</h2>
      <div className="dfy-tabs" role="tablist" aria-label="Niche" onKeyDown={onKey}>
        {catalog.map((cat, i) => (
          <button
            type="button"
            role="tab"
            id={`dfy-tab-${i}`}
            aria-controls="dfy-shows-panel"
            key={cat.name}
            ref={(el) => { tabs.current[i] = el }}
            className="dfy-tab"
            aria-selected={i === index}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setCategory(i)}
          >
            {cat.name}
          </button>
        ))}
      </div>
      <div className="dfy-shows-grid" role="tabpanel" id="dfy-shows-panel" aria-labelledby={`dfy-tab-${index}`}>
        {active.shows.map((show) => (
          <figure className="dfy-show" key={show.name}>
            <div className="dfy-mat">
              <Plate name={show.name} art={show.art} />
            </div>
            <figcaption>
              <span className="dfy-show-name">{show.name}</span>
              <span className="dfy-show-about">{show.about}</span>
              <span className="dfy-show-reach dfy-tnum">{show.reach}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="dfy-shows-note">A few samples, not the list — yours is built for your niche on the first call.</p>
    </section>
  )
}

/** "Watch on YouTube", or wherever the testimonial is hosted. */
const watchLabel = (url: string) => (/vimeo\.com/iu.test(url) ? 'Watch on Vimeo' : 'Watch on YouTube')

/** How long a testimonial holds before the carousel moves on by itself. */
const QUOTE_HOLD_MS = 9000

const twoDigits = (n: number) => String(n).padStart(2, '0')

/** A client's face, cut from their video; their initials if there is none or it fails to load. */
const Portrait = ({ name, src }: { name: string; src?: string }) => {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="dfy-portrait dfy-portrait-initials" aria-hidden="true">{initials(name)}</span>
  return (
    <span className="dfy-portrait">
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  )
}

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
    <>
      <section
        className="dfy-section-tight"
        aria-roledescription="carousel"
        aria-label="Testimonials"
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}
      >
        <div className="dfy-carousel-head">
          <span className="dfy-kicker">Clients, in their own words</span>
          {count > 1 ? (
            <div className="dfy-carousel-controls">
              <span className="dfy-carousel-count dfy-tnum" aria-hidden="true">{twoDigits(index + 1)} / {twoDigits(count)}</span>
              <button type="button" className="dfy-carousel-toggle" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
              <button type="button" className="dfy-carousel-arrow" aria-label="Previous testimonial" onClick={() => go(index - 1)}>←</button>
              <button type="button" className="dfy-carousel-arrow" aria-label="Next testimonial" onClick={() => go(index + 1)}>→</button>
            </div>
          ) : null}
        </div>

        <div
          className="dfy-carousel-stage"
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
                className="dfy-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={!active}
                data-active={active}
                // React 18 has no `inert` prop; the empty string is the attribute being present.
                {...(active ? {} : { inert: '' })}
              >
                <span className="dfy-slide-portrait"><Portrait name={q.name} src={q.portrait} /></span>
                <div>
                  <span className="dfy-slide-mark" aria-hidden="true">“</span>
                  <blockquote className="dfy-slide-quote">{q.quote}</blockquote>
                  <figcaption className="dfy-slide-caption">
                    <span className="dfy-quote-name">{q.name}</span>
                    <span className="dfy-quote-role">{q.role}</span>
                    {q.videoUrl ? (
                      <a
                        className="dfy-quote-watch"
                        href={q.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="dfy-quote-play" aria-hidden="true" />
                        <span>{watchLabel(q.videoUrl)}<span className="dfy-sr"> — {q.name}</span><NewTab /></span>
                      </a>
                    ) : null}
                  </figcaption>
                </div>
              </figure>
            )
          })}
        </div>

        {count > 1 ? (
          <>
            <span className="dfy-carousel-progress" aria-hidden="true">
              {moving ? <span key={index} className="dfy-carousel-progress-fill" style={{ animationDuration: `${QUOTE_HOLD_MS}ms` }} /> : null}
            </span>
            <div className="dfy-carousel-picker" role="group" aria-label="Choose a client">
              {CLIENT_QUOTES.map((q, i) => (
                <button
                  key={q.name}
                  type="button"
                  className="dfy-carousel-pick"
                  aria-label={q.name}
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => go(i)}
                >
                  <Portrait name={q.name} src={q.portrait} />
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
      <hr className="dfy-rule" />
    </>
  )
}

const Pricing = () => (
  <section id="pricing" className="dfy-section">
    <span className="dfy-kicker">Pricing</span>
    <div className="dfy-split">
      <div>
        <p className="dfy-price">${MONTHLY_PRICE}<small>/month</small></p>
        <p className="dfy-price-note">One plan. 3-month minimum, then month to month. PR agencies typically charge $2,000–5,000 a month for a service spread across press, awards and everything else.</p>
        <a className="dfy-btn dfy-btn-primary dfy-price-cta" href={CALL_URL} target="_blank" rel="noopener noreferrer">Book a call to start<NewTab /></a>
      </div>
      <ul className="dfy-includes">
        {PLAN_INCLUDES.map((text) => (
          <li key={text}><Mark /><span>{text}</span></li>
        ))}
      </ul>
    </div>
  </section>
)

const Faq = () => (
  <section id="faq" className="dfy-faq">
    <span className="dfy-kicker dfy-kicker-mid">Questions</span>
    {FAQ.map((item) => (
      <details key={item.q}>
        <summary><span className="dfy-faq-plus dfy-tnum" aria-hidden="true" />{item.q}</summary>
        <p className="dfy-faq-a">{item.a}</p>
      </details>
    ))}
  </section>
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
    <div className="dfy-page">
      <PageSEO
        title="Get booked on podcasts your customers listen to | Get On A Pod"
        description={HERO.lead}
        path="/"
        keywords="podcast guesting service, done-for-you podcast booking, podcast guest booking, thought leadership, founder marketing"
      />
      <a className="dfy-skip" href="#main">Skip to content</a>

      <nav className="dfy-nav" aria-label="Site">
        <Link className="dfy-brand" to="/"><Brand /></Link>
        {/* One row on a desk; on a phone the brand and the call take the
            first row and these take the second, so nothing is hidden. */}
        <div className="dfy-nav-links">
          <a className="dfy-nav-link" href="#how">How it works</a>
          <a className="dfy-nav-link" href="#pricing">Pricing</a>
          <a className="dfy-nav-link" href="#faq">FAQ</a>
          <Link className="dfy-nav-link" to="/login">Sign in</Link>
        </div>
        <a className="dfy-btn dfy-btn-primary dfy-nav-cta" href={CALL_URL} target="_blank" rel="noopener noreferrer">Book a call<NewTab /></a>
      </nav>

      <main id="main" className="dfy-wrap">
        <Hero />
        <hr className="dfy-rule" />
        <Wordmarks />
        <PodcastsHow />
        <hr className="dfy-rule" />
        <Shows />
        <hr className="dfy-rule" />
        <Quotes />
        <Pricing />
        <hr className="dfy-rule" />
        <Faq />
      </main>

      <section id="book" className="dfy-book">
        <div className="dfy-book-in">
          <h2><span>Your next customer</span><span>is listening right now.</span></h2>
          <p className="dfy-book-copy">In 30 minutes we show you the kinds of shows we would pitch you to, and tell you honestly how many bookings to expect in your niche — including if the number is lower than you hoped.</p>
          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-ghost" href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}<NewTab /></a>
          </div>
        </div>
      </section>

      <footer className="dfy-footer">
        <div className="dfy-footer-grid">
          <div>
            <span className="dfy-brand"><Brand /></span>
            <p className="dfy-footer-tagline">Done-for-you podcast guesting. You bring the story — we get you on the show.</p>
          </div>
          <div className="dfy-footer-col">
            <span className="dfy-footer-head">Explore</span>
            <a href="#how">How it works</a>
            <a href="#shows">The shows</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </div>
          <div className="dfy-footer-col">
            <span className="dfy-footer-head">Talk to us</span>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <a href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}<NewTab /></a>
            <Link to="/platform">For agencies</Link>
          </div>
        </div>
        <div className="dfy-footer-foot">
          <span>© {new Date().getFullYear()} Get On A Pod</span>
          <span className="dfy-copy-italic">Booked by hand, not by blast.</span>
        </div>
      </footer>
    </div>
  )
}

export default Landing
