import { CheckCircleIcon, LinkIcon, ScissorsIcon, SendIcon } from '@/components/clips/clipsShared'
import { CLIPS_CROSSED, CLIPS_PROCESS, CLIPS_TABLE } from '@/lib/clipsContent'

const STEP_ICONS = {
  link: LinkIcon,
  scissors: ScissorsIcon,
  check: CheckCircleIcon,
  send: SendIcon,
} as const

export const ClipsProcess = () => (
  <section id="process" className="clips-rule" aria-labelledby="clips-process-title">
    <div className="clips-wrap clips-section clips-process">
      <div className="clips-head">
        <div className="clips-eyebrow">{CLIPS_PROCESS.eyebrow}</div>
        <h2 id="clips-process-title" className="clips-h2">{CLIPS_PROCESS.title}</h2>
      </div>
      <ol className="clips-process-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {CLIPS_PROCESS.steps.map((step) => {
          const Icon = STEP_ICONS[step.icon]
          return (
            <li key={step.kicker} className="clips-card clips-step">
              <Icon />
              <div className="clips-step-kicker">{step.kicker}</div>
              <h3 className="clips-step-title">{step.title}</h3>
              <p className="clips-step-body">{step.body}</p>
            </li>
          )
        })}
      </ol>
    </div>
  </section>
)

/** Four columns, seven rows; ours carries the lime-dim column. Scrolls inside its own box below 760px. */
export const ClipsTable = () => (
  <section className="clips-wrap clips-section clips-table-section" aria-labelledby="clips-table-title">
    <div className="clips-head">
      <div className="clips-eyebrow">{CLIPS_TABLE.eyebrow}</div>
      <h2 id="clips-table-title" className="clips-h2">{CLIPS_TABLE.title}</h2>
    </div>
    <div className="clips-table-scroll" tabIndex={0} role="region" aria-label="How the three options compare">
      <table className="clips-table">
        <thead>
          <tr>
            <th scope="col"><span className="clips-sr">What you get</span></th>
            {CLIPS_TABLE.columns.map((column, index) => (
              <th key={column} scope="col" className={index === 0 ? 'clips-us' : undefined}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CLIPS_TABLE.rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              {row.cells.map((cell, index) => (
                <td key={index} className={index === 0 ? 'clips-us' : row.dim[index] ? 'clips-dim' : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)

export const ClipsCrossed = () => (
  <section className="clips-rule clips-panel" aria-labelledby="clips-crossed-title">
    <div className="clips-wrap clips-section clips-crossed">
      <div className="clips-crossed-text">
        <div className="clips-eyebrow">{CLIPS_CROSSED.eyebrow}</div>
        <h2 id="clips-crossed-title" className="clips-h2">{CLIPS_CROSSED.title}</h2>
        <p className="clips-lead">{CLIPS_CROSSED.body}</p>
      </div>
      <ul className="clips-crossed-list">
        {CLIPS_CROSSED.pairs.map(([said, rule]) => (
          <li key={said} className="clips-card clips-pair">
            <div className="clips-pair-said"><span className="clips-sr">They said: </span>{said}</div>
            <div className="clips-pair-rule">{rule}</div>
          </li>
        ))}
      </ul>
    </div>
  </section>
)
