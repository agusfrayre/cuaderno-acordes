import type { BoxCount } from './types'

// Pagina virtual A4 vertical. Toda la tinta se guarda en estas coordenadas.
export const PAGE_W = 1000
export const PAGE_H = 1414
export const MARGIN = 50

export const TITLE_LABEL_Y = 62
export const TITLE_LINE_Y = 118
export const GRID_TOP = 145
export const GRID_BOTTOM = 1105
export const NOTES_TOP = 1135
export const NOTES_LINE_GAP = 54

export const FRETS = 4
export const STRINGS = 6
/** de arriba hacia abajo, como en una tablatura */
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function gridShape(n: BoxCount): { cols: number; rows: number } {
  if (n === 6) return { cols: 2, rows: 3 }
  if (n === 9) return { cols: 3, rows: 3 }
  return { cols: 3, rows: 4 }
}

export function cellRects(n: BoxCount): Rect[] {
  const { cols, rows } = gridShape(n)
  const w = (PAGE_W - MARGIN * 2) / cols
  const h = (GRID_BOTTOM - GRID_TOP) / rows
  const out: Rect[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push({ x: MARGIN + c * w, y: GRID_TOP + r * h, w, h })
  return out
}

/**
 * Diagrama horizontal: cuerdas acostadas (e arriba, E abajo), cejuela vertical
 * a la izquierda y FRETS trastes hacia la derecha.
 *   [nombre cuerda][zona O/X] || traste1 | traste2 | traste3 | traste4 |
 */
export interface Diagram {
  nameLine: { x1: number; x2: number; y: number }
  /** separacion entre cuerdas */
  s: number
  /** ancho de cada traste */
  f: number
  /** x de los nombres de las cuerdas */
  labelX: number
  /** centro x de la zona O / X */
  xoX: number
  /** borde izquierdo de la zona O / X */
  xoLeft: number
  /** x de la cejuela */
  gridX: number
  /** y de la primera cuerda */
  gridY: number
  /** casillero para el numero de traste inicial */
  fretBox: Rect
}

const LABEL_W = 0.75
const XO_W = 1.05
const F_RATIO = 1.45

export function diagramGeometry(cell: Rect): Diagram {
  const pad = 10
  const nameH = Math.min(cell.h * 0.2, 70)
  const unitsW = LABEL_W + XO_W + FRETS * F_RATIO
  const s = Math.min((cell.w - pad * 2) / unitsW, (cell.h - nameH - pad * 2) / (STRINGS - 1 + 1.25))
  const f = s * F_RATIO
  const blockW = s * unitsW
  const blockH = nameH + s * (STRINGS - 1 + 1.25)
  const left = cell.x + (cell.w - blockW) / 2
  const top = cell.y + (cell.h - blockH) / 2
  const gridX = left + s * (LABEL_W + XO_W)
  const gridY = top + nameH
  return {
    nameLine: { x1: cell.x + cell.w * 0.15, x2: cell.x + cell.w * 0.85, y: top + nameH * 0.6 },
    s,
    f,
    labelX: left + s * LABEL_W * 0.45,
    xoX: left + s * (LABEL_W + XO_W / 2),
    xoLeft: left + s * LABEL_W,
    gridX,
    gridY,
    fretBox: { x: gridX + f * 0.12, y: gridY + s * (STRINGS - 1) + s * 0.3, w: f * 0.76, h: s * 0.85 },
  }
}

export function markCenter(d: Diagram, string: number, fret: number): [number, number] {
  const y = d.gridY + string * d.s
  return fret === 0 ? [d.xoX, y] : [d.gridX + (fret - 0.5) * d.f, y]
}

export function cellIndexAt(n: BoxCount, x: number, y: number): number {
  return cellRects(n).findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}

/** Que posicion de dedo hay bajo (x, y), o null si no cae sobre una cuerda. */
export function hitTarget(n: BoxCount, x: number, y: number): { cell: number; string: number; fret: number } | null {
  const cell = cellIndexAt(n, x, y)
  if (cell < 0) return null
  const d = diagramGeometry(cellRects(n)[cell])
  const string = Math.round((y - d.gridY) / d.s)
  if (string < 0 || string >= STRINGS || Math.abs(y - (d.gridY + string * d.s)) > d.s * 0.5) return null
  if (x >= d.gridX && x <= d.gridX + FRETS * d.f) return { cell, string, fret: Math.min(FRETS, Math.floor((x - d.gridX) / d.f) + 1) }
  if (x >= d.xoLeft - d.s * 0.2 && x < d.gridX) return { cell, string, fret: 0 }
  return null
}

// ---------- zonas de texto (lo escrito ahi se pasa a letra de imprenta) ----------

export interface TextZone {
  key: string
  /** area donde se detecta la escritura */
  rect: Rect
  /** posicion del texto (x segun anchor, y = linea base) */
  x: number
  y: number
  size: number
  anchor: 'start' | 'middle'
  maxW: number
  /** solo numeros (casillero de traste) */
  digits?: boolean
}

export function notesLines(): number[] {
  const out: number[] = []
  for (let y = NOTES_TOP + 55; y < PAGE_H - MARGIN + 5; y += NOTES_LINE_GAP) out.push(y)
  return out
}

export const CAPO_X = 760

const zoneCache = new Map<BoxCount, TextZone[]>()
export function textZones(n: BoxCount): TextZone[] {
  const hit = zoneCache.get(n)
  if (hit) return hit
  const headH = TITLE_LINE_Y - 70 + 12
  const zones: TextZone[] = [
    { key: 'title', rect: { x: MARGIN, y: 70, w: CAPO_X - 40 - MARGIN, h: headH }, x: MARGIN + 4, y: TITLE_LINE_Y - 10, size: 44, anchor: 'start', maxW: CAPO_X - 50 - MARGIN },
    { key: 'capo', rect: { x: CAPO_X, y: 70, w: PAGE_W - MARGIN - CAPO_X, h: headH }, x: CAPO_X + 4, y: TITLE_LINE_Y - 10, size: 36, anchor: 'start', maxW: PAGE_W - MARGIN - CAPO_X - 8 },
  ]
  cellRects(n).forEach((cell, i) => {
    const d = diagramGeometry(cell)
    const nl = d.nameLine
    zones.push({
      key: `name-${i}`,
      rect: { x: cell.x, y: cell.y, w: cell.w, h: nl.y - cell.y + 10 },
      x: (nl.x1 + nl.x2) / 2,
      y: nl.y - 8,
      size: Math.min(42, d.s * 0.95),
      anchor: 'middle',
      maxW: nl.x2 - nl.x1,
    })
    const b = d.fretBox
    zones.push({
      key: `fret-${i}`,
      rect: { x: b.x - 6, y: b.y - 4, w: b.w + 12, h: b.h + 10 },
      x: b.x + b.w / 2,
      y: b.y + b.h * 0.8,
      size: b.h * 0.85,
      anchor: 'middle',
      maxW: b.w - 4,
      digits: true,
    })
  })
  notesLines().forEach((ly, i) => {
    zones.push({
      key: `note-${i}`,
      rect: { x: MARGIN, y: ly - NOTES_LINE_GAP + 6, w: PAGE_W - MARGIN * 2, h: NOTES_LINE_GAP },
      x: MARGIN + 4,
      y: ly - 10,
      size: 32,
      anchor: 'start',
      maxW: PAGE_W - MARGIN * 2 - 8,
    })
  })
  zoneCache.set(n, zones)
  return zones
}

export function zoneAt(n: BoxCount, x: number, y: number): TextZone | undefined {
  return textZones(n).find((z) => x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h)
}

/** ancho aproximado del texto ya escrito en la zona */
export function textWidth(z: TextZone, text: string): number {
  return Math.min(z.maxW, text.length * z.size * 0.56)
}

/** el punto cae sobre el texto ya convertido de la zona */
export function onText(z: TextZone, text: string, x: number, y: number): boolean {
  const w = textWidth(z, text)
  const x0 = z.anchor === 'middle' ? z.x - w / 2 : z.x
  return x >= x0 - 10 && x <= x0 + w + 10 && y >= z.y - z.size - 6 && y <= z.y + 12
}
