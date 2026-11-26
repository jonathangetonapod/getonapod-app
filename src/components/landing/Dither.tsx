import { useEffect, useRef } from 'react'

/**
 * Ordered-dither art for the homepage, ported from the pastel-dither style kit
 * (its dither.js). Each canvas draws at one pixel per dither cell (3 CSS px on
 * a desk, 2 on a phone) and CSS scales it up with hard pixels. For every cell
 * a scene returns two palette colours and a mix amount; the cell takes the
 * second colour when the mix, plus a little noise, beats the Bayer threshold.
 *
 * The palette is read from the page's custom properties on the canvas itself
 * (--paper, --ink, --band and the five --art-* tones), so the art always
 * matches the stylesheet and a section can retone its art in CSS alone. The
 * scenes keep the kit's colour names (orange, gold, …) for the roles; the
 * homepage maps them to warm greys. Drawing
 * happens only in the resize observer's callback: nothing runs during the
 * prerender, and the page's markup is the same with or without the art.
 */

type Rgb = [number, number, number]
interface Palette {
  ground: Rgb
  ink: Rgb
  band: Rgb
  orange: Rgb
  gold: Rgb
  pink: Rgb
  violet: Rgb
  lavender: Rgb
}
type Scene = (u: number, v: number, P: Palette) => [Rgb, Rgb, number]

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
  .map((v) => (v + 0.5) / 64)

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const hash = (x: number, y: number) => (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) + 1) % 1

const toRgb = (value: string): Rgb => {
  let h = value.trim()
  const m = h.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/u)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  const n = parseInt(h.slice(1), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const scenes: Record<string, Scene> = {
  // Soft ridgelines dissolving into paper at the top and bottom, with a small sun.
  hero(u, v, P) {
    const fade = sstep(0.05, 0.62, v) * (1 - 0.75 * sstep(0.8, 1, v))
    const r1 = 0.42 + 0.1 * Math.sin(u * 5.2 + 0.6) + 0.05 * Math.sin(u * 13.1)
    const r2 = 0.6 + 0.08 * Math.sin(u * 3.4 + 2.1) + 0.04 * Math.sin(u * 9.7 + 1)
    const r3 = 0.76 + 0.06 * Math.sin(u * 6.3 + 4.2)
    const sun = Math.hypot((u - 0.8) * 2.6, (v - 0.3) * 1.3)
    if (sun < 0.2 && v < r1) return [P.ground, P.gold, sstep(0.2, 0.02, sun) * 0.7]
    if (v > r3) return [P.ground, P.violet, fade * 0.55]
    const n2 = hash(u * 700, v * 600)
    if (v > r2) return [P.ground, (u + (n2 - 0.5) * 0.5) < 0.5 ? P.orange : P.gold, fade * 0.62]
    if (v > r1) return [P.ground, P.pink, fade * 0.62]
    return [P.ground, P.lavender, fade * 0.55]
  },
  // A sunburst from the top-right corner of the dark band; band cells go transparent.
  band(u, v, P) {
    const dx = u - 1.0
    const dy = v + 0.05
    const d = Math.hypot(dx * 1.3, dy)
    const ray = 0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * 14)
    if (d < 0.45) return [P.orange, P.gold, sstep(0.45, 0.1, d)]
    if (d < 0.8) return [P.band, P.pink, sstep(0.8, 0.45, d) * (0.45 + 0.4 * ray)]
    return [P.band, P.violet, sstep(1.25, 0.8, d) * 0.35 * ray]
  },
  // A wavy violet-to-pink strip along the bottom of the ink price card.
  plan(u, v, P) {
    const w = 0.5 + 0.25 * Math.sin(u * 6 + 0.5)
    if (v < w) return [P.ground, P.violet, sstep(w - 0.45, w, v) * 0.55]
    return [P.violet, P.pink, sstep(w, 1, v) + 0.1 * Math.sin(u * 30)]
  },
  // A rising sun in the gradient, cut by horizon stripes, in a lavender haze.
  closer(u, v, P) {
    const d = Math.hypot((u - 0.5) * 1.9, (v - 0.95) * 1.15)
    const stripe = v > 0.55 && Math.floor(v * 22) % 3 === 0
    if (d < 0.62) {
      const c: [Rgb, Rgb, number] = u < 0.5 ? [P.orange, P.gold, u * 2] : [P.gold, P.pink, (u - 0.5) * 2]
      const edge = sstep(0.62, 0.45, d)
      if (stripe) return [P.ground, c[0], 0.25 * edge]
      return edge < 1 ? [P.ground, c[1], 0.35 + 0.6 * edge] : c
    }
    return [P.ground, P.lavender, sstep(1.0, 0.62, d) * 0.5]
  },
}

export type DitherScene = 'hero' | 'band' | 'plan' | 'closer'

interface DitherProps {
  scene: DitherScene
  className?: string
  /** The custom property the art dissolves into: the page, or the card it sits on. */
  ground?: string
  /** Cells that resolve to the band colour are left transparent, so the band's dots show through. */
  clearBand?: boolean
}

const NOISE = 0.22

const Dither = ({ scene, className, ground = '--paper', clearBand = false }: DitherProps) => {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const css = getComputedStyle(canvas)
      const read = (name: string) => toRgb(css.getPropertyValue(name))
      const P: Palette = {
        ground: read(ground), ink: read('--ink'), band: read('--band'),
        orange: read('--art-strong'), gold: read('--art-mid'), pink: read('--art-soft'),
        violet: read('--art-deep'), lavender: read('--art-haze'),
      }
      const cell = window.innerWidth < 600 ? 2 : 3
      const w = Math.max(8, Math.round(width / cell))
      const h = Math.max(8, Math.round(height / cell))
      canvas.width = w
      canvas.height = h
      const img = ctx.createImageData(w, h)
      const d = img.data
      const art = scenes[scene]
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const [a, b, t] = art(x / w, y / h, P)
          const tt = Math.max(0, Math.min(1, t + (hash(x, y) - 0.5) * NOISE))
          const col = tt > BAYER[(y & 7) * 8 + (x & 7)] ? b : a
          const i = (y * w + x) * 4
          d[i] = col[0]
          d[i + 1] = col[1]
          d[i + 2] = col[2]
          d[i + 3] = clearBand && col === P.band ? 0 : 255
        }
      }
      ctx.putImageData(img, 0, 0)
    }
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [scene, ground, clearBand])

  return <canvas ref={ref} className={className ? `hp-dither ${className}` : 'hp-dither'} aria-hidden="true" />
}

export default Dither
