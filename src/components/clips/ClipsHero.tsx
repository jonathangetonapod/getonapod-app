import type { CSSProperties } from 'react'

import { trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_CTA, CLIPS_HERO, CLIPS_JOBS } from '@/lib/clipsContent'

/** The film grain over the hero: a turbulence filter, drawn once, blended on. */
const Grain = () => (
  <svg className="clips-grain" aria-hidden="true" focusable="false">
    <filter id="clips-grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#clips-grain)" />
  </svg>
)

const RotatingBadge = () => (
  <div className="clips-ring">
    <svg viewBox="0 0 200 200" width="150" height="150" role="img" aria-label="Free cut, 72 hours, 5 clips, 2 thumbnails">
      <defs>
        <path id="clips-circ" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" />
      </defs>
      <text fontFamily="JetBrains Mono, Menlo, monospace" fontSize="12.5" letterSpacing="3.2" fill="#c8f542">
        <textPath href="#clips-circ">{CLIPS_HERO.badgeRing}</textPath>
      </text>
      <circle cx="100" cy="100" r="5" fill="#c8f542" />
    </svg>
  </div>
)

/**
 * The 3D blade cut: one 640×360 episode frame as five slabs over a lime
 * dot-grid floor. A blade sweeps across on a 9-second loop and each slab flies
 * to its own place, shows its job, and comes back. All of it is CSS; this
 * component only lays the slabs out and hands each its flight path.
 */
const BladeStage = () => (
  <div className="clips-stage" role="img" aria-label={CLIPS_HERO.stageLabel}>
    <div className="clips-floor" aria-hidden="true" />
    <div className="clips-frame" aria-hidden="true">
      {CLIPS_JOBS.map((job, index) => (
        <div
          key={job.label}
          className="clips-slab"
          style={{
            '--i': index,
            '--dx': `${job.fly.dx}px`,
            '--dy': `${job.fly.dy}px`,
            '--dz': `${job.fly.dz}px`,
            '--ry': `${job.fly.ry}deg`,
            '--rx': `${job.fly.rx}deg`,
          } as CSSProperties}
        >
          <div className="clips-face">
            <div className="clips-timecode">{job.time}</div>
            <div className="clips-wv">
              {job.bars.map((height, bar) => (
                <span key={bar} className={bar >= 2 && bar <= 5 ? 'clips-wv-lit' : undefined} style={{ height }} />
              ))}
            </div>
            <div className="clips-lbl">{job.label}</div>
          </div>
          <div className="clips-side" />
          <div className="clips-side-l" />
        </div>
      ))}
      <div className="clips-blade" />
    </div>
  </div>
)

export const ClipsHero = () => (
  <section className="clips-hero" aria-labelledby="clips-h1">
    <Grain />
    <RotatingBadge />
    <div className="clips-wrap clips-hero-inner">
      <div className="clips-badge clips-rise clips-d1">
        <span className="clips-dot" aria-hidden="true" />
        {CLIPS_HERO.badge}
      </div>
      <h1 id="clips-h1" className="clips-h1 clips-rise clips-d2">
        {CLIPS_HERO.title[0]}<br />
        <span className="clips-mark">{CLIPS_HERO.title[1]}</span>
      </h1>
      <p className="clips-hero-lead clips-rise clips-d3">{CLIPS_HERO.lead}</p>
      <div className="clips-cta-row clips-rise clips-d4">
        <a href="#cut" className="clips-btn" onClick={() => trackClips('clips_cta_click', { location: 'hero' })}>{CLIPS_CTA}</a>
        <a href="#compare" className="clips-btn clips-btn-ghost">{CLIPS_HERO.secondary}</a>
      </div>
      <p className="clips-cred clips-rise clips-d5">{CLIPS_HERO.credibility}</p>
      <BladeStage />
      <p className="clips-stage-caption">{CLIPS_HERO.stageCaption}</p>
    </div>
  </section>
)
