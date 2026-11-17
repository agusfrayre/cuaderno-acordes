/** x, y en coordenadas de pagina, presion 0..1 */
export type Point = [number, number, number]

export interface Stroke {
  id: string
  color: string
  size: number
  /** true cuando no hubo presion real (mouse / dedo) */
  simulate: boolean
  points: Point[]
  /** zona de texto donde se escribio (se convierte a letra de imprenta) */
  zone?: string
}

export interface TextEntry {
  text: string
  color: string
}

export type BoxCount = 6 | 9 | 12

/** 1-4 = dedo de la mano izquierda, O = cuerda al aire, X = no suena */
export type Finger = 1 | 2 | 3 | 4 | 'O' | 'X'

export interface Mark {
  cell: number
  /** 0 = primera (e aguda, arriba) ... 5 = sexta (E grave, abajo) */
  string: number
  /** 1..4 = traste dentro del diagrama, 0 = zona al aire / X */
  fret: number
  finger: Finger
}

export interface Song {
  id: string
  title: string
  boxes: BoxCount
  strokes: Stroke[]
  marks: Mark[]
  /** texto reconocido por zona (title, capo, name-3, fret-3, note-0...) */
  texts: Record<string, TextEntry>
  createdAt: number
  updatedAt: number
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
