import { memo } from 'react'
import { cellRects, diagramGeometry, markCenter } from '../layout'
import type { Barre, BoxCount, Mark } from '../types'

const FILL = '#1c1917'

export function barreGeometry(d: ReturnType<typeof diagramGeometry>, b: Barre) {
  const x = d.gridX + (b.fret - 0.5) * d.f
  const w = d.s * 0.62
  return { x, w, y1: d.gridY - d.s * 0.36, y2: d.gridY + b.to * d.s + d.s * 0.36 }
}

function Marks({ boxes, marks, barres }: { boxes: BoxCount; marks: Mark[]; barres: Barre[] }) {
  const cells = cellRects(boxes)
  return (
    <g>
      {barres.map((b) => {
        const cell = cells[b.cell]
        if (!cell) return null
        const g = barreGeometry(diagramGeometry(cell), b)
        return <rect key={`b-${b.cell}-${b.fret}`} x={g.x - g.w / 2} y={g.y1} width={g.w} height={g.y2 - g.y1} rx={g.w / 2} fill={FILL} />
      })}
      {marks.map((m) => {
        const cell = cells[m.cell]
        if (!cell) return null
        const d = diagramGeometry(cell)
        const [x, y] = markCenter(d, m.string, m.fret)
        const key = `${m.cell}-${m.string}-${m.fret}`
        if (m.finger === 'O') return <circle key={key} cx={x} cy={y} r={d.s * 0.3} fill="none" stroke={FILL} strokeWidth={2.2} />
        if (m.finger === 'X') {
          const r = d.s * 0.27
          return (
            <path key={key} d={`M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}`} stroke={FILL} strokeWidth={2.6} strokeLinecap="round" />
          )
        }
        return (
          <g key={key}>
            <circle cx={x} cy={y} r={d.s * 0.43} fill={FILL} />
            <text x={x} y={y} fontSize={d.s * 0.58} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui, sans-serif">
              {m.finger}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export default memo(Marks)
