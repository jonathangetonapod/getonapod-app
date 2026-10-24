import { useState } from 'react'
import { Link } from 'react-router-dom'

import { trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_CTA, CLIPS_NAV } from '@/lib/clipsContent'

export const ClipsWordmark = () => (
  <Link to="/" className="clips-wordmark">getonapod.com<span className="clips-wordmark-accent">/clips</span></Link>
)

/**
 * The sticky bar. Below 720px the four links fold behind a Menu button; the
 * lime call to action stays out where a thumb can reach it.
 */
export const ClipsNav = () => {
  const [open, setOpen] = useState(false)
  return (
    <header className={`clips-nav${open ? ' clips-nav-open' : ''}`}>
      <nav className="clips-wrap clips-nav-inner" aria-label="Page">
        <ClipsWordmark />
        <div className="clips-nav-right">
          <button
            type="button"
            className="clips-menu-btn"
            aria-expanded={open}
            aria-controls="clips-nav-links"
            onClick={() => setOpen((value) => !value)}
          >
            Menu
          </button>
          <div className="clips-nav-links" id="clips-nav-links">
            {CLIPS_NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>
            ))}
          </div>
          <a
            href="#cut"
            className="clips-btn clips-nav-cta"
            onClick={() => { setOpen(false); trackClips('clips_cta_click', { location: 'nav' }) }}
          >
            {CLIPS_CTA}
          </a>
        </div>
      </nav>
    </header>
  )
}
