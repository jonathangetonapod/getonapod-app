import { trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_CAL_URL, CLIPS_PRICING } from '@/lib/clipsContent'

export const ClipsPricing = () => (
  <section id="pricing" className="clips-wrap clips-section clips-pricing" aria-labelledby="clips-pricing-title">
    <div className="clips-head clips-pricing-head">
      <div className="clips-eyebrow">{CLIPS_PRICING.eyebrow}</div>
      <h2 id="clips-pricing-title" className="clips-h2">{CLIPS_PRICING.title}</h2>
    </div>

    <div className="clips-tiers">
      {CLIPS_PRICING.tiers.map((tier) => {
        const glow = Boolean(tier.badge)
        const external = tier.cta.href.startsWith('http')
        return (
          <div key={tier.kicker} className={`clips-card clips-tier${glow ? ' clips-tier-glow' : ''}`}>
            <div className="clips-tier-head">
              <div className="clips-tier-kicker">
                <span>{tier.kicker}</span>
                {tier.badge ? <span className="clips-pill">{tier.badge}</span> : null}
              </div>
              <div className="clips-price"><b>{tier.price}</b><span>{tier.term}</span></div>
              <p className="clips-tier-body">{tier.body}</p>
            </div>
            <ul className="clips-tier-list">
              {tier.items.map((item) => (
                <li key={item}><i aria-hidden="true">+</i><span>{item}</span></li>
              ))}
            </ul>
            <a
              href={tier.cta.href}
              className={`clips-btn clips-btn-small${tier.cta.primary ? '' : ' clips-btn-ghost'}`}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={() => trackClips(external ? 'clips_book_call_click' : 'clips_cta_click', { location: 'pricing' })}
            >
              {tier.cta.label}
              {external ? <span className="clips-sr"> (opens in a new tab)</span> : null}
            </a>
          </div>
        )
      })}
    </div>

    <div className="clips-more">
      <div className="clips-more-text">
        <div className="clips-more-eyebrow">{CLIPS_PRICING.more.eyebrow}</div>
        <h3 className="clips-more-title">{CLIPS_PRICING.more.title}</h3>
        <p className="clips-more-body">{CLIPS_PRICING.more.body}</p>
      </div>
      <div className="clips-more-table">
        {CLIPS_PRICING.more.rows.map(([label, value], index) => (
          <div key={label} className="clips-more-row">
            <span>{label}</span>
            <b className={index === 1 ? 'clips-more-plain' : undefined}>{value}</b>
          </div>
        ))}
        <div className="clips-more-row">
          <span>{CLIPS_PRICING.more.lastRow[0]}</span>
          <a
            href={CLIPS_CAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClips('clips_book_call_click', { location: 'pricing' })}
          >
            {CLIPS_PRICING.more.lastRow[1]}<span className="clips-sr"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </div>

    <div className="clips-guarantee">
      <span className="clips-guarantee-kicker">{CLIPS_PRICING.guarantee.kicker}</span>
      <span className="clips-guarantee-body">{CLIPS_PRICING.guarantee.body}</span>
    </div>
  </section>
)
