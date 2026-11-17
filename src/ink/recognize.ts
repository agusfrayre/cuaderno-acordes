import type { Stroke } from '../types'

const ENDPOINT = 'https://inputtools.google.com/request?ime=handwriting&app=cuaderno&cs=1&oe=UTF-8'

/**
 * Reconoce escritura a mano con el servicio de Google Input Tools.
 * Devuelve el texto mas probable, o null si no hay conexion / no se entendio.
 */
export async function recognize(strokes: Stroke[], width: number, height: number, digits = false): Promise<string | null> {
  const ink = strokes.map((s) => [s.points.map((p) => Math.round(p[0] * 10) / 10), s.points.map((p) => Math.round(p[1] * 10) / 10)])
  const body = {
    options: 'enable_pre_space',
    requests: [{ writing_guide: { writing_area_width: Math.round(width), writing_area_height: Math.round(height) }, ink, language: 'es' }],
  }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    clearTimeout(t)
    const j = await r.json()
    if (j?.[0] !== 'SUCCESS') return null
    const candidates: string[] = j[1]?.[0]?.[1] ?? []
    if (!candidates.length) return null
    if (digits) {
      const fix = (c: string) =>
        c.replace(/[lI|i!]/g, '1').replace(/[oO]/g, '0').replace(/[sS]/g, '5').replace(/[zZ]/g, '2').replace(/[^0-9]/g, '')
      return candidates.map(fix).find((c) => c.length > 0) ?? null
    }
    return candidates[0].trim() || null
  } catch {
    return null
  }
}
