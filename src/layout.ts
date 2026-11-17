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
