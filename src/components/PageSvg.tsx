import { forwardRef, memo, type ReactNode } from 'react'
import { PAGE_H, PAGE_W } from '../layout'
import { strokePath } from '../ink/geometry'
import type { BoxCount, Mark, Stroke } from '../types'
import ChordTemplate from './ChordTemplate'
import Marks from './Marks'

const Ink = memo(function Ink({ strokes }: { strokes: Stroke[] }) {
  return (
    <g>
      {strokes.map((s) => (
        <path key={s.id} d={strokePath(s)} fill={s.color} />
      ))}
    </g>
  )
})

interface Props {
  boxes: BoxCount
  strokes: Stroke[]
  marks?: Mark[]
  className?: string
  children?: ReactNode
}

/** Hoja completa: plantilla + tinta. Se usa en el editor, en las miniaturas y para exportar PNG. */
const PageSvg = forwardRef<SVGSVGElement, Props>(function PageSvg({ boxes, strokes, marks, className, children }, ref) {
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} className={className} style={{ display: 'block', width: '100%', height: 'auto' }}>
      <ChordTemplate boxes={boxes} />
      <Marks boxes={boxes} marks={marks ?? []} />
      <Ink strokes={strokes} />
      {children}
    </svg>
  )
})

export default PageSvg
