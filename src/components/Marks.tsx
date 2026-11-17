import { memo } from 'react'
import { cellRects, diagramGeometry, markCenter } from '../layout'
import type { BoxCount, Mark } from '../types'

const FILL = '#1c1917'

function Marks({ boxes, marks }: { boxes: BoxCount; marks: Mark[] }) {
  const cells = cellRects(boxes)
  return (
    <g>
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
