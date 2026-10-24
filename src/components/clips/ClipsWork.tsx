import type { CSSProperties } from 'react'

import { Silhouette } from '@/components/clips/clipsShared'
import { CLIPS_JOBS, CLIPS_MARQUEE, CLIPS_WORK } from '@/lib/clipsContent'

const FAN = [
  { rz: -26, tz: 0 },
  { rz: -13, tz: 40 },
  { rz: 0, tz: 80 },
  { rz: 13, tz: 40 },
  { rz: 26, tz: 0 },
]

/** The middle phone is lime with ink text; the others are card-dark with white text. */
const LIME_INDEX = 1

/**
 * One phone screen. The silhouette is the placeholder.
 *
 * TODO: real client clip. Replace the <Silhouette> with
 * <video muted playsInline loop src="…" poster="…" /> — the slot is sized so the
 * swap changes nothing around it.
 */
const PhoneScreen = ({ lime }: { lime: boolean }) => (
  <div className="clips-ph-screen" aria-hidden="true">
    <Silhouette fill={lime ? '#a9d62e' : '#242427'} />
  </div>
)

/** Five phones fanned around a shared pivot, orbiting slowly as one. */
const PhoneFan = () => (
  <div className="clips-fan" role="img" aria-label={CLIPS_WORK.fanLabel}>
    <div className="clips-fan-in" aria-hidden="true">
      {CLIPS_JOBS.map((job, index) => {
        const lime = index === LIME_INDEX
        return (
          <div key={job.label} className="clips-ph" style={{ '--rz': `${FAN[index].rz}deg`, '--tz': `${FAN[index].tz}px` } as CSSProperties}>
            <div className={`clips-phin${lime ? ' clips-phin-lime' : ''}`}>
              <div className="clips-notch" />
              <div className="clips-ph-top">
                <span className="clips-ph-job">{job.label}</span>
                <span className={`clips-dot ${lime ? 'clips-dot-ink' : 'clips-dot-red'}`} />
              </div>
              <PhoneScreen lime={lime} />
              <div className="clips-ph-bottom">
                <div className="clips-ph-caption">
                  {job.caption[0]}
                  {job.caption[1] ? <b>{job.caption[1]}</b> : null}
                </div>
                <div className="clips-bar"><span style={{ animationDelay: job.delay }} /></div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

export const ClipsWork = () => (
  <section id="work" className="clips-work" aria-label="Work">
    <div className="clips-ghost clips-ghost-cut" aria-hidden="true">{CLIPS_WORK.ghost}</div>
    <div className="clips-wrap clips-work-inner">
      <PhoneFan />
      <p className="clips-work-caption">{CLIPS_WORK.caption}</p>
    </div>
  </section>
)

const MarqueeRun = () => (
  <span>
    {CLIPS_MARQUEE.lead}&nbsp;&nbsp;
    {CLIPS_MARQUEE.niches.map((niche) => (
      <span key={niche}>{niche}<i>·</i></span>
    ))}
  </span>
)

/** The niche ticker: the run twice over on a max-content track, translated by half. */
export const ClipsMarquee = () => (
  <div className="clips-marquee" aria-hidden="true">
    <div className="clips-track">
      <MarqueeRun />
      <MarqueeRun />
    </div>
  </div>
)
