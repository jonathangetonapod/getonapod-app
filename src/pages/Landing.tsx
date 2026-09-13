import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import PageSEO from '@/components/seo/PageSEO'
import {
  CALL_LABEL, CALL_URLS, CHANNEL_ROWS, CLIENT_NAMES, CLIENT_QUOTES, CONTACT_EMAIL, DELIVERABLES, DIY_STEPS,
  FAQ, HERO, HERO_SECONDARY, MATH_ROWS, MONTHLY_PRICE, NOT_FOR, PODCAST_CATALOG, PODCAST_PLAN_INCLUDES,
  STAGE_PLAN_INCLUDES, STAGE_STEPS, TIMELINE, WHY_NOT_BOOKED, initials, startingLine, type Mode,
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

const Hero = ({ mode }: { mode: Mode }) => {
  const hero = HERO[mode]
  return (
    <section className="dfy-hero">
      <span className="dfy-kicker">{hero.kicker}</span>
      <h1>
        <span>{hero.title[0]}</span>
        <span>{hero.title[1]}</span>
      </h1>
      <p className="dfy-hero-lead">{hero.lead}</p>
      <div className="dfy-cta-row">
        <a className="dfy-btn dfy-btn-primary" href={CALL_URLS[mode]} target="_blank" rel="noopener noreferrer">{CALL_LABEL[mode]}<NewTab /></a>
        <a className="dfy-btn dfy-btn-ghost" href="#how">{HERO_SECONDARY}</a>
      </div>
    </section>
  )
}

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

const StagesCase = () => (
  <>
    <section className="dfy-section">
      <span className="dfy-kicker">The math nobody tells you</span>
      <h2 className="dfy-h2 dfy-measure">Getting booked is a numbers problem before it's a talent problem.</h2>
      <p className="dfy-copy dfy-copy-after">Across professional speaking businesses, the working ratio is roughly 150 targeted contacts to get 15 real conversations, 3 strong fits, and 1 confirmed booking.</p>
      <p className="dfy-copy dfy-copy-lead-out">Most speakers send 15 emails, hear nothing, and decide outreach doesn't work. What doesn't work is the sample size.</p>
      <table className="dfy-table">
        <thead><tr><th>You, doing it yourself</th><th>A VA with a database</th><th>Get On A Pod</th></tr></thead>
        <tbody>
          {MATH_ROWS.map(([you, va, us]) => (
            <tr key={you}>
              <td data-label="You, doing it yourself">{you}</td>
              <td data-label="A VA with a database">{va}</td>
              <td data-label="Get On A Pod">{us}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
    <hr className="dfy-rule" />

    <section className="dfy-section">
      <span className="dfy-kicker">Do it yourself</span>
      <h2 className="dfy-h2 dfy-measure-wide dfy-h2-lead-out">Here's what booking a single stage looks like in-house.</h2>
      <ol className="dfy-steps">
        {DIY_STEPS.map((text, i) => (
          <li key={text}>
            <span className="dfy-steps-n dfy-tnum">{String(i + 1).padStart(2, '0')}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <p className="dfy-copy dfy-copy-tail">Then do it again next month, because bookings are 2 to 6 months out and the calendar needs constant feeding.</p>
      <p className="dfy-statement">Our clients do step zero: tell us who they want in the room.</p>
    </section>
    <hr className="dfy-rule" />

    <section className="dfy-section">
      <span className="dfy-kicker">Who this is for</span>
      <h2 className="dfy-h2">Built for people who sell expertise, not tickets.</h2>
      <p className="dfy-copy dfy-copy-after">If you're a consultant, advisor, coach, agency owner or founder selling high-ticket services, and you already know a stage full of your buyers is worth more than any ad, this is for you.</p>
      <p className="dfy-copy dfy-copy-after dfy-copy-intro">It is not for:</p>
      <ul className="dfy-list dfy-list-narrow">
        {NOT_FOR.map((text) => <li key={text}><Mark /><span>{text}</span></li>)}
      </ul>
    </section>
    <hr className="dfy-rule" />

    <section id="how" className="dfy-section">
      <span className="dfy-kicker">How it works</span>
      <h2 className="dfy-h2 dfy-h2-tight">One system. Four steps. Runs every week.</h2>
      {STAGE_STEPS.map((step) => (
        <div className="dfy-how-row dfy-how-row-tight" key={step.n}>
          <p className="dfy-how-n dfy-how-n-accent dfy-tnum">{step.n}</p>
          <h3 className="dfy-how-title dfy-how-title-tall">{step.title}</h3>
          <p className="dfy-how-copy">{step.copy}</p>
        </div>
      ))}
    </section>
    <hr className="dfy-rule" />

    <section className="dfy-section">
      <span className="dfy-kicker dfy-kicker-loose">What you get every month</span>
      <div className="dfy-deliverables">
        {DELIVERABLES.map((d) => (
          <div className="dfy-deliverable" key={d.title}>
            <p className="dfy-deliverable-title">{d.title}</p>
            <p className="dfy-deliverable-copy">{d.copy}</p>
          </div>
        ))}
      </div>
    </section>
    <hr className="dfy-rule" />

    <section id="timeline" className="dfy-section">
      <span className="dfy-kicker">Timeline</span>
      <h2 className="dfy-h2 dfy-measure-wide">Honest timeline, because stages don't book next week.</h2>
      <p className="dfy-copy dfy-copy-after dfy-copy-lead-out">Over half of organizers book speakers 2 to 6 months in advance. Major conferences pick speakers 6 to 12 months out. Anyone promising you a keynote in 30 days is selling something else.</p>
      {TIMELINE.map((t) => (
        <div className="dfy-timeline-row" key={t.when}>
          <p className="dfy-timeline-when">{t.when}</p>
          <div>
            <p className="dfy-timeline-title">{t.title}</p>
            <p className="dfy-timeline-copy">{t.copy}</p>
          </div>
        </div>
      ))}
      <p className="dfy-copy dfy-copy-tail dfy-copy-italic">{startingLine(new Date())}</p>
    </section>
    <hr className="dfy-rule" />

    <section className="dfy-section">
      <span className="dfy-kicker">Why most speakers don't get booked</span>
      <ul className="dfy-list dfy-list-mid">
        {WHY_NOT_BOOKED.map((text) => <li key={text}><Mark /><span>{text}</span></li>)}
      </ul>
      <p className="dfy-statement dfy-statement-far">We fixed each one with a process, not a pep talk.</p>
    </section>
    <hr className="dfy-rule" />

    <section className="dfy-section">
      <span className="dfy-kicker">ROI from one client</span>
      <h2 className="dfy-h2">One room can pay for the year.</h2>
      <p className="dfy-copy dfy-copy-after">A year of the plan is ${(MONTHLY_PRICE * 12).toLocaleString('en-US')}. If your average client is worth $10,000, one client won from one room of 150 of your buyers covers the year with room to spare.</p>
      <p className="dfy-copy">Every stage after that is working for you, not paying off the program.</p>
    </section>
    <hr className="dfy-rule" />

    <section className="dfy-section">
      <span className="dfy-kicker dfy-kicker-loose">What each channel does in our system</span>
      <table className="dfy-table">
        <thead><tr><th>Channel</th><th>What most people use it for</th><th>How we use it</th></tr></thead>
        <tbody>
          {CHANNEL_ROWS.map(([channel, most, us]) => (
            <tr key={channel}>
              <td data-label="Channel" className="dfy-td-lead">{channel}</td>
              <td data-label="What most people use it for">{most}</td>
              <td data-label="How we use it">{us}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>
)

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

/**
 * Sample podcasts by niche. The stage offer has no counterpart: events do not
 * publish artwork the way shows do, and a grid of initials said nothing.
 */
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
          <span className="dfy-kicker">Six founders, in their own words</span>
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

const Pricing = ({ mode }: { mode: Mode }) => {
  const stages = mode === 'stages'
  return (
    <section id="pricing" className="dfy-section">
      <span className={`dfy-kicker${stages ? ' dfy-kicker-loose' : ''}`}>Pricing</span>
      <div className="dfy-split">
        <div>
          <p className="dfy-price">${MONTHLY_PRICE}<small>/month</small></p>
          <p className="dfy-price-note">
            {stages
              ? 'One plan. 3-month minimum, then month to month — a fraction of what building this in-house costs.'
              : 'One plan. 3-month minimum, then month to month. PR agencies typically charge $2,000–5,000 a month for a service spread across press, awards and everything else.'}
          </p>
          <a className="dfy-btn dfy-btn-primary dfy-price-cta" href={CALL_URLS[mode]} target="_blank" rel="noopener noreferrer">Book a call to start<NewTab /></a>
        </div>
        <ul className="dfy-includes">
          {(stages ? STAGE_PLAN_INCLUDES : PODCAST_PLAN_INCLUDES).map((text) => (
            <li key={text}><Mark /><span>{text}</span></li>
          ))}
        </ul>
      </div>
      {stages ? (
        <>
          <p className="dfy-price-aside">We're not a bureau. We don't take a cut of your speaking fees. Flat monthly rate, that's it.</p>
          <p className="dfy-price-fine">Building this yourself: a research VA (~$3,000/mo), cold email infrastructure (~$300), scraping and enrichment (~$400), deliverability monitoring (~$100), a pitch copywriter (~$600), and someone managing replies and logistics (~$1,200) — about $5,600/mo, and you're the one managing all of it.</p>
        </>
      ) : null}
    </section>
  )
}

const Faq = ({ mode }: { mode: Mode }) => (
  <section id="faq" className="dfy-faq">
    <span className="dfy-kicker dfy-kicker-mid">Questions</span>
    {FAQ[mode].map((item) => (
      <details key={item.q}>
        <summary><span className="dfy-faq-plus dfy-tnum" aria-hidden="true" />{item.q}</summary>
        <p className="dfy-faq-a">{item.a}</p>
      </details>
    ))}
  </section>
)

const Landing = () => {
  const { hash, key } = useLocation()
  const [params, setParams] = useSearchParams()
  // The Stages offer is a page of its own behind the toggle; keeping the mode
  // in the URL means it can be linked to and survives a reload.
  const mode: Mode = params.get('mode') === 'stages' ? 'stages' : 'podcasts'
  const setMode = (next: Mode) => setParams(next === 'stages' ? { mode: 'stages' } : {}, { replace: true })
  const stages = mode === 'stages'

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
        title={stages ? 'Done-for-you stage booking | Get On A Pod' : 'Get booked on podcasts your customers listen to | Get On A Pod'}
        description={HERO[mode].lead}
      />
      <a className="dfy-skip" href="#main">Skip to content</a>

      <nav className="dfy-nav" aria-label="Site">
        <Link className="dfy-brand" to="/"><Brand /></Link>
        <div className="dfy-mode" aria-label="What do you want to get on?">
          <button type="button" className="dfy-mode-btn" aria-pressed={!stages} onClick={() => setMode('podcasts')}>Podcasts</button>
          <button type="button" className="dfy-mode-btn" aria-pressed={stages} onClick={() => setMode('stages')}>Stages</button>
        </div>
        {/* One row on a desk; on a phone the brand and the toggle take the
            first row and these take the second, so nothing is hidden. */}
        <div className="dfy-nav-links">
          <a className="dfy-nav-link" href="#how">How it works</a>
          <a className="dfy-nav-link" href="#pricing">Pricing</a>
          <a className="dfy-nav-link" href="#faq">FAQ</a>
          <Link className="dfy-nav-link" to="/login">Sign in</Link>
        </div>
        <a className="dfy-btn dfy-btn-primary dfy-nav-cta" href={CALL_URLS[mode]} target="_blank" rel="noopener noreferrer">Book a call<NewTab /></a>
      </nav>

      <main id="main" className="dfy-wrap">
        <Hero mode={mode} />
        <hr className="dfy-rule" />
        {stages ? <StagesCase /> : (
          <>
            <Wordmarks />
            <PodcastsHow />
          </>
        )}
        <hr className="dfy-rule" />
        {stages ? null : (
          <>
            <Shows />
            <hr className="dfy-rule" />
            <Quotes />
          </>
        )}
        <Pricing mode={mode} />
        <hr className="dfy-rule" />
        <Faq mode={mode} />
      </main>

      <section id="book" className="dfy-book">
        <div className="dfy-book-in">
          <h2>
            {stages
              ? <><span>Next year’s stages are</span><span>choosing their speakers now.</span></>
              : <><span>Your next customer</span><span>is listening right now.</span></>}
          </h2>
          <p className="dfy-book-copy">
            {stages
              ? 'In 30 minutes we show you the events we would pitch you to and what a realistic first quarter looks like.'
              : 'In 30 minutes we show you the kinds of shows we would pitch you to, and tell you honestly how many bookings to expect in your niche — including if the number is lower than you hoped.'}
          </p>
          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-ghost" href={CALL_URLS[mode]} target="_blank" rel="noopener noreferrer">{CALL_LABEL[mode]}<NewTab /></a>
          </div>
        </div>
      </section>

      <footer className="dfy-footer">
        <div className="dfy-footer-grid">
          <div>
            <span className="dfy-brand"><Brand /></span>
            <p className="dfy-footer-tagline">Done-for-you podcast and stage booking. You bring the story — we get you the room.</p>
          </div>
          <div className="dfy-footer-col">
            <span className="dfy-footer-head">Explore</span>
            <a href="#how">How it works</a>
            {stages ? null : <a href="#shows">The shows</a>}
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </div>
          <div className="dfy-footer-col">
            <span className="dfy-footer-head">Talk to us</span>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <a href={CALL_URLS[mode]} target="_blank" rel="noopener noreferrer">{CALL_LABEL[mode]}<NewTab /></a>
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
