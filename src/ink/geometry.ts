import { getStroke } from 'perfect-freehand'
import type { Point, Stroke } from '../types'

const avg = (a: number, b: number) => (a + b) / 2

function svgPathFromOutline(pts: number[][]): string {
  const len = pts.length
  if (len < 4) return ''
  let a = pts[0]
  let b = pts[1]
  const c = pts[2]
  let d = `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${b[0].toFixed(1)},${b[1].toFixed(1)} ${avg(b[0], c[0]).toFixed(1)},${avg(b[1], c[1]).toFixed(1)} T`
  for (let i = 2; i < len - 1; i++) {
    a = pts[i]
    b = pts[i + 1]
    d += `${avg(a[0], b[0]).toFixed(1)},${avg(a[1], b[1]).toFixed(1)} `
  }
  return d + 'Z'
}

export function pathFor(points: Point[], size: number, simulate: boolean, complete: boolean): string {
  const outline = getStroke(points, {
    size,
    thinning: simulate ? 0.5 : 0.6,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: simulate,
    last: complete,
  })
  const d = svgPathFromOutline(outline)
  if (d) return d
  // un toque suelto: punto redondo
  const [x, y] = points[0] ?? [0, 0]
  const r = size / 2
  return `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`
}

const cache = new WeakMap<Stroke, string>()
export function strokePath(s: Stroke): string {
  let d = cache.get(s)
  if (d === undefined) {
    d = pathFor(s.points, s.size, s.simulate, true)
    cache.set(s, d)
  }
  return d
}

function distToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
}

export function strokeHit(s: Stroke, x: number, y: number, radius: number): boolean {
  const r = radius + s.size / 2
  const p = s.points
  if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= r
  for (let i = 0; i < p.length - 1; i++) if (distToSegment(x, y, p[i], p[i + 1]) <= r) return true
  return false
}

export function strokeCenter(s: Stroke): [number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of s.points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}
