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

export const FRETS = 5
export const STRINGS = 6

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function gridShape(n: BoxCount): { cols: number; rows: number } {
  if (n === 6) return { cols: 3, rows: 2 }
  if (n === 9) return { cols: 3, rows: 3 }
  return { cols: 4, rows: 3 }
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

export interface Diagram {
  /** renglon para el nombre del acorde */
  nameLine: { x1: number; x2: number; y: number }
  /** centro vertical de la fila de X / O sobre la cejuela */
  xoY: number
  gridX: number
  gridY: number
  /** separacion entre cuerdas */
  s: number
  /** separacion entre trastes */
  f: number
  /** casillero para el numero de traste inicial */
  fretBox: Rect
}

export function diagramGeometry(cell: Rect): Diagram {
  const pad = 10
  const nameH = cell.h * 0.2
  const s = Math.min(((cell.w - pad * 2) * 0.68) / (STRINGS - 1), (cell.h - nameH - pad * 2) / (1.1 + FRETS * 1.25))
  const f = s * 1.25
  const gridW = s * (STRINGS - 1)
  const gridH = f * FRETS
  const blockH = nameH + s * 1.1 + gridH
  const top = cell.y + (cell.h - blockH) / 2
  const gridX = cell.x + (cell.w - gridW) / 2 + s * 0.35
  const gridY = top + nameH + s * 1.1
  return {
    nameLine: { x1: cell.x + cell.w * 0.18, x2: cell.x + cell.w * 0.82, y: top + nameH * 0.75 },
    xoY: gridY - s * 0.6,
    gridX,
    gridY,
    s,
    f,
    fretBox: { x: gridX - s * 1.55, y: gridY + f * 0.1, w: s * 1.1, h: f * 0.8 },
  }
}

export function cellIndexAt(n: BoxCount, x: number, y: number): number {
  return cellRects(n).findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}
