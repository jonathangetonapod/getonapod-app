import { CheckIcon, XIcon } from '@/components/clips/clipsShared'
import { CLIPS_FAQ, CLIPS_FIT, CLIPS_FOUNDER } from '@/lib/clipsContent'

export const ClipsFounder = () => (
  <section className="clips-rule clips-panel" aria-labelledby="clips-founder-title">
    <div className="clips-wrap clips-section clips-founder">
      <div className="clips-founder-side">
        <div className="clips-monogram" role="img" aria-label={CLIPS_FOUNDER.name}>{CLIPS_FOUNDER.monogram}</div>
        <div>
          <div className="clips-founder-name">{CLIPS_FOUNDER.name}</div>
          <div className="clips-founder-role">{CLIPS_FOUNDER.role}</div>
          <div className="clips-founder-places">{CLIPS_FOUNDER.places}</div>
        </div>
      </div>
      <div className="clips-founder-main">
        <div className="clips-eyebrow">{CLIPS_FOUNDER.eyebrow}</div>
        <h2 id="clips-founder-title" className="clips-h2 clips-founder-title">{CLIPS_FOUNDER.title}</h2>
        <div className="clips-founder-letter">
          {CLIPS_FOUNDER.paragraphs.map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
        </div>
        <div className="clips-sig" aria-label={`Signed, ${CLIPS_FOUNDER.signature}`}>{CLIPS_FOUNDER.signature}</div>
      </div>
    </div>
  </section>
)

export const ClipsFit = () => (
  <section className="clips-wrap clips-section clips-fit" aria-labelledby="clips-fit-title">
    <div className="clips-head">
      <div className="clips-eyebrow">{CLIPS_FIT.eyebrow}</div>
      <h2 id="clips-fit-title" className="clips-h2">{CLIPS_FIT.title}</h2>
    </div>
    <div className="clips-fit-grid">
      <div className="clips-card clips-fit-card clips-fit-yes">
        <div className="clips-fit-kicker">{CLIPS_FIT.yes.kicker}</div>
        <ul className="clips-fit-list">
          {CLIPS_FIT.yes.items.map((item) => <li key={item}><CheckIcon /><span>{item}</span></li>)}
        </ul>
      </div>
      <div className="clips-card clips-fit-card clips-fit-no">
        <div className="clips-fit-kicker">{CLIPS_FIT.no.kicker}</div>
        <ul className="clips-fit-list">
          {CLIPS_FIT.no.items.map((item) => <li key={item}><XIcon /><span>{item}</span></li>)}
        </ul>
      </div>
    </div>
  </section>
)

/** Ten questions, all open, as the prototype shows them. No JS to fail. */
export const ClipsFaq = () => (
  <section id="faq" className="clips-rule clips-panel" aria-labelledby="clips-faq-title">
    <div className="clips-wrap clips-section clips-faq">
      <div className="clips-head clips-faq-head">
        <div className="clips-eyebrow">{CLIPS_FAQ.eyebrow}</div>
        <h2 id="clips-faq-title" className="clips-h2">{CLIPS_FAQ.title}</h2>
      </div>
      <ul className="clips-faq-list">
        {CLIPS_FAQ.items.map((item) => (
          <li key={item.q} className="clips-card clips-faq-item">
            <h3 className="clips-faq-q">{item.q}</h3>
            <p className="clips-faq-a">{item.a}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
)
