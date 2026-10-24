import { useRef, useState, type PointerEvent } from 'react'

import { Silhouette } from '@/components/clips/clipsShared'
import { trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_COMPARE } from '@/lib/clipsContent'

const clamp = (value: number) => Math.max(0, Math.min(100, value))

/**
 * The page's signature element: the human cut underneath, the AI tool's raw
 * output on top, clipped at a split the visitor moves. The split lives in
 * state and is painted straight into clip-path and left, with no transition,
 * so a drag follows the finger frame for frame.
 *
 * Two controls move it: the range input (keyboard, screen reader, and a
 * thumb) and a pointer drag anywhere on the picture (mouse, pen, touch).
 */
export const ClipsCompare = () => {
  const [split, setSplit] = useState(50)
  const dragged = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const firstDrag = () => {
    if (dragged.current) return
    dragged.current = true
    trackClips('clips_compare_drag')
  }

  const splitFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setSplit(clamp(((event.clientX - rect.left) / rect.width) * 100))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    box.current?.setPointerCapture?.(event.pointerId)
    splitFromPointer(event)
    firstDrag()
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    splitFromPointer(event)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    box.current?.releasePointerCapture?.(event.pointerId)
  }

  return (
    <section id="compare" className="clips-rule clips-panel" aria-labelledby="clips-compare-title">
      <div className="clips-wrap clips-section clips-compare">
        <div className="clips-compare-text">
          <div className="clips-eyebrow">{CLIPS_COMPARE.eyebrow}</div>
          <h2 id="clips-compare-title" className="clips-h2">{CLIPS_COMPARE.title}</h2>
          <p className="clips-lead">{CLIPS_COMPARE.body}</p>
          <div className="clips-compare-control">
            <label htmlFor="clips-split" className="clips-mono">{CLIPS_COMPARE.rangeLabel}</label>
            <input
              id="clips-split"
              className="clips-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(split)}
              onChange={(event) => { setSplit(Number(event.target.value)); firstDrag() }}
              aria-valuetext={`${Math.round(split)} percent human editor`}
            />
          </div>
        </div>
        <div className="clips-compare-visual">
          <div
            ref={box}
            className="clips-compare-box"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Human cut, underneath. */}
            <div className="clips-layer">
              <div className="clips-layer-top"><span>{CLIPS_COMPARE.human.tag}</span><span>{CLIPS_COMPARE.human.time}</span></div>
              <div className="clips-layer-figure" aria-hidden="true"><Silhouette fill="#2a2a2e" /></div>
              <div className="clips-layer-bottom">
                <div className="clips-layer-caption">{CLIPS_COMPARE.human.caption[0]}<b>{CLIPS_COMPARE.human.caption[1]}</b></div>
                <div className="clips-layer-byline">{CLIPS_COMPARE.human.byline}</div>
              </div>
            </div>
            {/* AI tool, raw, on top and clipped to the left of the split. */}
            <div className="clips-layer clips-layer-ai" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <div className="clips-layer-top"><span>{CLIPS_COMPARE.ai.tag}</span><span>{CLIPS_COMPARE.ai.time}</span></div>
              <div className="clips-layer-figure" aria-hidden="true"><Silhouette fill="#2a2a2e" /></div>
              <div className="clips-layer-bottom">
                <div className="clips-layer-caption">{CLIPS_COMPARE.ai.caption}<b>…</b></div>
                <div className="clips-layer-byline">
                  {CLIPS_COMPARE.ai.bylineName}
                  <span className="clips-strike-red">{CLIPS_COMPARE.ai.bylineShow}</span>
                </div>
              </div>
            </div>
            <div className="clips-divider" style={{ left: `${split}%` }} aria-hidden="true" />
            <div className="clips-handle" style={{ left: `${split}%` }} role="img" aria-label="Split handle: AI tool on the left, human editor on the right">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <polyline points="9 6 3 12 9 18" /><polyline points="15 6 21 12 15 18" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
