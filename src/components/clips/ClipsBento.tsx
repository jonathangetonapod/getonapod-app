import { ScissorsIcon, Silhouette } from '@/components/clips/clipsShared'
import { CLIPS_BENTO, CLIPS_TRANSCRIPT } from '@/lib/clipsContent'

/** 48 bars; five lit segments at 4–7, 14–17, 24–27, 33–36, 42–45. Heights from a fixed wave, so every render agrees. */
const LIT = [[4, 8], [14, 18], [24, 28], [33, 37], [42, 46]]
const BARS = Array.from({ length: 48 }, (_, index) => {
  const wave = Math.abs(Math.sin(index * 0.9) + 0.6 * Math.sin(index * 2.3))
  return {
    height: 40 + Math.round(wave * 80),
    lit: LIT.some(([from, to]) => index >= from && index < to),
    delay: `${(index * 0.07).toFixed(2)}s`,
  }
})

const TranscriptCard = () => (
  <div className="clips-tile">
    <div className="clips-tile-eyebrow">{CLIPS_BENTO.transcript.eyebrow}</div>
    <div className="clips-tile-window" aria-hidden="true">
      {/* The lines twice over, translated by half, so the loop has no seam. */}
      <div className="clips-scroll">
        {[...CLIPS_TRANSCRIPT, ...CLIPS_TRANSCRIPT].map((line, index) => (
          <div key={index} className={`clips-scroll-line${line.tag ? ' clips-scroll-hit' : ''}`}>
            <time>{line.time}</time>&nbsp; {line.text}{line.tag ? <> <b>← {line.tag}</b></> : null}
          </div>
        ))}
      </div>
    </div>
    <p className="clips-tile-body">{CLIPS_BENTO.transcript.body}</p>
  </div>
)

const WaveformCard = () => (
  <div className="clips-tile">
    <div className="clips-tile-eyebrow">{CLIPS_BENTO.waveform.eyebrow}</div>
    <div className="clips-wave" aria-hidden="true">
      {BARS.map((bar, index) => (
        <span key={index} className={bar.lit ? 'clips-wave-lit' : undefined} style={{ height: bar.height, animationDelay: bar.delay }} />
      ))}
    </div>
    <p className="clips-tile-body">{CLIPS_BENTO.waveform.body}</p>
  </div>
)

const CropCard = () => (
  <div className="clips-tile">
    <div className="clips-tile-eyebrow">{CLIPS_BENTO.crop.eyebrow}</div>
    <div className="clips-crop-wrap" aria-hidden="true">
      <div className="clips-crop-frame">
        <Silhouette fill="#2a2a2e" className="clips-crop-a" />
        <Silhouette fill="#2a2a2e" className="clips-crop-b" />
        <div className="clips-crop-mask" />
        <div className="clips-crop-label">{CLIPS_BENTO.crop.label}</div>
      </div>
    </div>
    <p className="clips-tile-body">{CLIPS_BENTO.crop.body}</p>
  </div>
)

const CaptionCard = () => (
  <div className="clips-tile">
    <div className="clips-tile-eyebrow">{CLIPS_BENTO.caption.eyebrow}</div>
    <div className="clips-caption-check" aria-hidden="true">
      <div>draft &nbsp;<i>·</i> <span className="clips-strike-red">sucess is a lagging indicator</span></div>
      <div className="clips-caption-editor">editor <i>·</i> <b>success</b> is a lagging indicator<span className="clips-cursor" /></div>
      <div>names &nbsp;<i>·</i> host <b>✓</b> &nbsp;guest <b>✓</b> &nbsp;show <b>✓</b></div>
    </div>
    <p className="clips-tile-body">{CLIPS_BENTO.caption.body}</p>
  </div>
)

const EditorCard = () => (
  <div className="clips-tile clips-editor">
    <div className="clips-editor-left">
      <div className="clips-editor-kicker">
        <ScissorsIcon size={26} />
        <div className="clips-tile-eyebrow">{CLIPS_BENTO.editor.eyebrow}</div>
      </div>
      <h3 className="clips-editor-title">{CLIPS_BENTO.editor.title}</h3>
    </div>
    <ol className="clips-editor-list">
      {CLIPS_BENTO.editor.items.map((item, index) => (
        <li key={item}><i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i><span>{item}</span></li>
      ))}
    </ol>
  </div>
)

export const ClipsBento = () => (
  <section className="clips-rule" aria-labelledby="clips-bento-title">
    <div className="clips-wrap clips-section clips-bento">
      <div className="clips-bento-head">
        <div className="clips-head">
          <div className="clips-eyebrow">{CLIPS_BENTO.eyebrow}</div>
          <h2 id="clips-bento-title" className="clips-h2">{CLIPS_BENTO.title}</h2>
        </div>
        <p className="clips-bento-intro">{CLIPS_BENTO.intro}</p>
      </div>
      <div className="clips-bento-grid">
        <TranscriptCard />
        <WaveformCard />
        <CropCard />
        <CaptionCard />
        <EditorCard />
      </div>
    </div>
  </section>
)
