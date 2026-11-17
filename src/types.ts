/** x, y en coordenadas de pagina, presion 0..1 */
export type Point = [number, number, number]

export interface Stroke {
  id: string
  color: string
  size: number
  /** true cuando no hubo presion real (mouse / dedo) */
  simulate: boolean
  points: Point[]
}

export type BoxCount = 6 | 9 | 12

export interface Song {
  id: string
  title: string
  boxes: BoxCount
  strokes: Stroke[]
  createdAt: number
  updatedAt: number
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
