import { memo } from 'react'
import {
  FRETS, MARGIN, NOTES_LINE_GAP, NOTES_TOP, PAGE_H, PAGE_W, STRINGS, TITLE_LABEL_Y, TITLE_LINE_Y,
  cellRects, diagramGeometry, type Rect,
} from '../layout'
import type { BoxCount } from '../types'

const LINE = '#94a3b8'
const INK = '#475569'
const LABEL = '#a8a29e'
const FONT = 'system-ui, sans-serif'

function ChordBox({ cell }: { cell: Rect }) {
  const g = diagramGeometry(cell)
  const gridW = g.s * (STRINGS - 1)
  const gridH = g.f * FRETS
  return (
    <g>
      <line x1={g.nameLine.x1} x2={g.nameLine.x2} y1={g.nameLine.y} y2={g.nameLine.y} stroke={LINE} strokeWidth={1.2} strokeDasharray="4 5" />
      {Array.from({ length: STRINGS }, (_, i) => (
        <line key={'s' + i} x1={g.gridX + i * g.s} x2={g.gridX + i * g.s} y1={g.gridY} y2={g.gridY + gridH} stroke={INK} strokeWidth={1.4} />
      ))}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line key={'f' + i} x1={g.gridX} x2={g.gridX + gridW} y1={g.gridY + i * g.f} y2={g.gridY + i * g.f} stroke={INK} strokeWidth={i === 0 ? 6 : 1.4} strokeLinecap="square" />
      ))}
      <rect x={g.fretBox.x} y={g.fretBox.y} width={g.fretBox.w} height={g.fretBox.h} rx={4} fill="none" stroke={LINE} strokeWidth={1} strokeDasharray="3 4" />
      <text x={g.fretBox.x + g.fretBox.w / 2} y={g.fretBox.y + g.fretBox.h + 13} fontSize={10} fill={LABEL} textAnchor="middle" fontFamily={FONT}>traste</text>
    </g>
  )
}

function ChordTemplate({ boxes }: { boxes: BoxCount }) {
  const notesLines: number[] = []
  for (let y = NOTES_TOP + 55; y < PAGE_H - MARGIN + 5; y += NOTES_LINE_GAP) notesLines.push(y)
  const capoX = 760
  return (
    <g>
      <rect width={PAGE_W} height={PAGE_H} fill="#fffdf8" />
      <text x={MARGIN} y={TITLE_LABEL_Y} fontSize={18} fill={LABEL} fontFamily={FONT} letterSpacing={1}>CANCION</text>
      <line x1={MARGIN} x2={capoX - 40} y1={TITLE_LINE_Y} y2={TITLE_LINE_Y} stroke={LINE} strokeWidth={1.5} />
      <text x={capoX} y={TITLE_LABEL_Y} fontSize={18} fill={LABEL} fontFamily={FONT} letterSpacing={1}>CAPO / TONO</text>
      <line x1={capoX} x2={PAGE_W - MARGIN} y1={TITLE_LINE_Y} y2={TITLE_LINE_Y} stroke={LINE} strokeWidth={1.5} />
      {cellRects(boxes).map((c, i) => (
        <ChordBox key={i} cell={c} />
      ))}
      <text x={MARGIN} y={NOTES_TOP + 18} fontSize={18} fill={LABEL} fontFamily={FONT} letterSpacing={1}>NOTAS · RASGUEO · PROGRESION</text>
      {notesLines.map((y) => (
        <line key={y} x1={MARGIN} x2={PAGE_W - MARGIN} y1={y} y2={y} stroke="#d6d3d1" strokeWidth={1.2} />
      ))}
    </g>
  )
}

export default memo(ChordTemplate)
