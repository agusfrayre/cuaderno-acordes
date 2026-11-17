import { createStore, del, entries, get, set, setMany } from 'idb-keyval'
import type { Song } from '../types'

const store = createStore('cuaderno-acordes', 'songs')

export async function listSongs(): Promise<Song[]> {
  const all = await entries<string, Song>(store)
  return all.map(([, s]) => s).sort((a, b) => b.updatedAt - a.updatedAt)
}

export const getSong = (id: string) => get<Song>(id, store)
export const saveSong = (song: Song) => set(song.id, song, store)
export const deleteSong = (id: string) => del(id, store)

export async function requestPersist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* sin soporte: seguimos igual */
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function exportBackup() {
  const songs = await listSongs()
  const data = { app: 'cuaderno-acordes', version: 1, exportedAt: new Date().toISOString(), songs }
  const date = new Date().toISOString().slice(0, 10)
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `acordes-backup-${date}.json`)
}

function isSong(x: unknown): x is Song {
  const s = x as Song
  return !!s && typeof s.id === 'string' && typeof s.title === 'string' && [6, 9, 12, 16].includes(s.boxes) && Array.isArray(s.strokes)
}

/** Importa un backup. Las canciones con el mismo id se reemplazan. Devuelve cuantas se importaron. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text())
  const songs: unknown[] = Array.isArray(data?.songs) ? data.songs : []
  const valid = songs.filter(isSong)
  if (!valid.length) throw new Error('El archivo no tiene canciones validas')
  await setMany(valid.map((s) => [s.id, s] as [string, Song]), store)
  return valid.length
}
