import { HOW_STEPS } from '@/lib/landingContent'

/**
 * The four "how it works" cards. Each top half is a tiny, specific UI showing
 * the outcome of that step (the pastel-dither style's vignette cards); the
 * only words below it are a title and one line. Every mini UI is decorative,
 * so it is hidden from screen readers and the card's title and line carry it.
 */

const Bars = ({ count = 3 }: { count?: number }) => (
  <>
    {Array.from({ length: count }, (_, i) => <i key={i} className={i === count - 1 ? 'hp-bar hp-bar-short' : 'hp-bar'} />)}
  </>
)

const Story = () => (
  <div className="hp-viz" aria-hidden="true">
    <div className="hp-sheet-doc">
      <b>Speaker one-sheet</b>
      <Bars />
    </div>
    <div className="hp-angles">
      <span className="hp-badge">Built it</span>
      <span className="hp-badge">The problem</span>
      <span className="hp-badge">What's next</span>
    </div>
  </div>
)

const Pitches = () => (
  <div className="hp-viz" aria-hidden="true">
    <div className="hp-pitches">
      <div><span>Show</span><span>Pitch</span></div>
      <div><i className="hp-bar" /><span className="hp-badge">Sent</span></div>
      <div><i className="hp-bar hp-bar-short" /><span className="hp-badge">Replied</span></div>
      <div><i className="hp-bar" /><span className="hp-badge hp-badge-ink">Booked</span></div>
    </div>
  </div>
)

const Calendar = () => (
  <div className="hp-viz" aria-hidden="true">
    <div className="hp-event">
      <span className="hp-event-day"><small>Tue</small><b>14</b></span>
      <div>
        <b>Recording</b>
        <small>10:00 · 45 min</small>
      </div>
    </div>
    <div className="hp-brief">
      <span className="hp-badge">Prep brief</span>
      <span className="hp-brief-items">Host · Audience · Angle · Plug</span>
    </div>
  </div>
)

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const Clips = () => (
  <div className="hp-viz" aria-hidden="true">
    <div className="hp-clips">
      {DAYS.map((day) => (
        <span key={day} className="hp-clip">
          <span className="hp-clip-frame"><i className="hp-clip-play" /><i className="hp-clip-cap" /></span>
          <small>{day}</small>
        </span>
      ))}
    </div>
  </div>
)

/** One mini UI per step, in the order of HOW_STEPS. */
const VIZ = [Story, Pitches, Calendar, Clips]

const HomeVignettes = () => (
  <div className="hp-cases">
    {HOW_STEPS.map(({ title, line }, i) => {
      const Viz = VIZ[i]
      return (
      <article className="hp-case" key={title}>
        {Viz ? <Viz /> : null}
        <h3>{title}</h3>
        <p>{line}</p>
      </article>
      )
    })}
  </div>
)

export default HomeVignettes
