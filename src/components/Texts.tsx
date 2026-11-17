import { memo } from 'react'
import { textWidth, textZones } from '../layout'
import type { BoxCount, TextEntry } from '../types'

function Texts({ boxes, texts }: { boxes: BoxCount; texts: Record<string, TextEntry> }) {
  return (
    <g>
      {textZones(boxes).map((z) => {
        const t = texts[z.key]
        if (!t?.text) return null
        const natural = t.text.length * z.size * 0.56
        return (
          <text
            key={z.key}
            x={z.x}
            y={z.y}
            fontSize={z.size}
            fill={t.color}
            textAnchor={z.anchor}
            fontFamily="system-ui, 'Segoe UI', Roboto, sans-serif"
            fontWeight={z.key.startsWith('name') || z.key === 'title' ? 600 : 400}
            {...(natural > z.maxW ? { textLength: textWidth(z, t.text), lengthAdjust: 'spacingAndGlyphs' } : {})}
          >
            {t.text}
          </text>
        )
      })}
    </g>
  )
}

export default memo(Texts)
