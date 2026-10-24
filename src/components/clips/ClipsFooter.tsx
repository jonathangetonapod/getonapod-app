import { Link } from 'react-router-dom'

import { ClipsWordmark } from '@/components/clips/ClipsNav'
import { trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_FOOTER } from '@/lib/clipsContent'

interface FooterLink { href: string; label: string }

/** Same-site paths route in the app; anchors scroll; everything else leaves. */
const FooterAnchor = ({ link }: { link: FooterLink }) => {
  if (link.href.startsWith('#') || link.href.startsWith('mailto:')) return <a href={link.href}>{link.label}</a>
  if (link.href.startsWith('/')) return <Link to={link.href}>{link.label}</Link>
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { if (link.href.includes('cal.com')) trackClips('clips_book_call_click', { location: 'final' }) }}
    >
      {link.label}<span className="clips-sr"> (opens in a new tab)</span>
    </a>
  )
}

const Column = ({ kicker, links }: { kicker: string; links: FooterLink[] }) => (
  <div className="clips-footer-col">
    <div className="clips-footer-kicker">{kicker}</div>
    {links.map((link) => <FooterAnchor key={link.href} link={link} />)}
  </div>
)

export const ClipsFooter = () => (
  <footer className="clips-wrap clips-footer">
    <div className="clips-footer-grid">
      <div className="clips-footer-brand">
        <ClipsWordmark />
        <p className="clips-footer-tagline">{CLIPS_FOOTER.tagline}</p>
        <div className="clips-mono" style={{ letterSpacing: '1.2px' }}>{CLIPS_FOOTER.places}</div>
      </div>
      <Column kicker={CLIPS_FOOTER.explore.kicker} links={CLIPS_FOOTER.explore.links} />
      <Column kicker={CLIPS_FOOTER.talk.kicker} links={CLIPS_FOOTER.talk.links} />
      <Column kicker={CLIPS_FOOTER.also.kicker} links={CLIPS_FOOTER.also.links} />
    </div>
    <div className="clips-footer-bottom">
      <span>{CLIPS_FOOTER.copyright}</span>
      <span>{CLIPS_FOOTER.motto}</span>
    </div>
  </footer>
)
