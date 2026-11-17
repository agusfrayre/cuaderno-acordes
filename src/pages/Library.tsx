import { useEffect, useRef, useState } from 'react'
import { Copy, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import PageSvg from '../components/PageSvg'
import { deleteSong, exportBackup, importBackup, listSongs, saveSong } from '../store/db'
import { uid, type BoxCount, type Song } from '../types'

const BOX_OPTIONS: { value: BoxCount; label: string }[] = [
  { value: 6, label: '6 acordes (grandes)' },
  { value: 9, label: '9 acordes' },
  { value: 12, label: '12 acordes' },
  { value: 16, label: '16 acordes (4x4)' },
]

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

export default function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBoxes, setNewBoxes] = useState<BoxCount>(16)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => listSongs().then(setSongs)
  useEffect(() => {
    refresh()
  }, [])

  const create = async () => {
    const now = Date.now()
    const s: Song = { id: uid(), title: newTitle.trim() || 'Sin titulo', boxes: newBoxes, strokes: [], marks: [], barres: [], texts: {}, createdAt: now, updatedAt: now }
    await saveSong(s)
    onOpen(s.id)
  }

  const duplicate = async (s: Song) => {
    const now = Date.now()
    await saveSong({ ...s, id: uid(), title: s.title + ' (copia)', createdAt: now, updatedAt: now })
    refresh()
  }

  const rename = async (s: Song, title: string) => {
    setRenaming(null)
    if (title.trim() && title !== s.title) {
      await saveSong({ ...s, title: title.trim(), updatedAt: Date.now() })
      refresh()
    }
  }

  const remove = async (s: Song) => {
    if (confirmDelete !== s.id) return setConfirmDelete(s.id)
    setConfirmDelete(null)
    await deleteSong(s.id)
    refresh()
  }

  const onImport = async (file?: File) => {
    if (!file) return
    try {
      const n = await importBackup(file)
      setMsg(`Se importaron ${n} canciones.`)
      refresh()
    } catch (e) {
      setMsg('No se pudo importar: ' + (e instanceof Error ? e.message : 'archivo invalido'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="min-h-dvh bg-stone-200">
      <header className="flex flex-wrap items-center gap-3 bg-slate-800 px-5 py-4 text-stone-100">
        <h1 className="text-xl font-semibold tracking-tight">Cuaderno de acordes</h1>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportBackup} className="flex h-11 items-center gap-2 rounded-lg px-3 hover:bg-slate-700">
            <Download size={18} /> Backup
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-lg px-3 hover:bg-slate-700">
            <Upload size={18} /> Importar
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-5">
        {msg && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-amber-100 px-4 py-3 text-amber-900">
            {msg}
            <button type="button" className="ml-4 text-sm underline" onClick={() => setMsg('')}>
              cerrar
            </button>
          </div>
        )}

        {creating ? (
          <form
            className="mb-6 rounded-xl bg-white p-5 shadow"
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
          >
            <label className="mb-1 block text-sm font-medium text-stone-600">Nombre de la cancion</label>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ej: De musica ligera"
              className="mb-4 h-12 w-full rounded-lg border border-stone-300 px-3 text-lg focus:outline-2 focus:outline-amber-400"
            />
            <div className="mb-5 flex flex-wrap gap-2">
              {BOX_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setNewBoxes(o.value)}
                  className={`h-11 rounded-lg border px-4 ${newBoxes === o.value ? 'border-slate-800 bg-slate-800 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" className="h-11 rounded-lg bg-amber-400 px-5 font-medium text-slate-900">
                Crear hoja
              </button>
              <button type="button" onClick={() => setCreating(false)} className="h-11 rounded-lg px-4 text-stone-600">
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setNewTitle('')
                setCreating(true)
              }}
              className="flex aspect-[1000/1414] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-400 text-stone-600 hover:bg-stone-100"
            >
              <Plus size={36} />
              Nueva cancion
            </button>
          )}
          {songs?.map((s) => (
            <div key={s.id} className="flex flex-col">
              <button type="button" onClick={() => onOpen(s.id)} className="overflow-hidden rounded-xl shadow transition-shadow hover:shadow-lg">
                <PageSvg boxes={s.boxes} strokes={s.strokes} marks={s.marks} barres={s.barres} texts={s.texts} />
              </button>
              <div className="mt-2 flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  {renaming === s.id ? (
                    <input
                      autoFocus
                      defaultValue={s.title}
                      onBlur={(e) => rename(s, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="h-9 w-full rounded border border-stone-300 px-2"
                    />
                  ) : (
                    <p className="truncate font-medium text-stone-800">{s.title}</p>
                  )}
                  <p className="text-xs text-stone-500">{fmtDate(s.updatedAt)}</p>
                </div>
                <IconBtn label="Renombrar" onClick={() => setRenaming(s.id)}>
                  <Pencil size={17} />
                </IconBtn>
                <IconBtn label="Duplicar" onClick={() => duplicate(s)}>
                  <Copy size={17} />
                </IconBtn>
                <IconBtn label={confirmDelete === s.id ? 'Tocar de nuevo para borrar' : 'Borrar'} danger={confirmDelete === s.id} onClick={() => remove(s)}>
                  <Trash2 size={17} />
                </IconBtn>
              </div>
              {confirmDelete === s.id && <p className="text-xs text-red-700">Toca el tacho de nuevo para borrar</p>}
            </div>
          ))}
        </div>
        {songs?.length === 0 && !creating && (
          <p className="mt-6 text-stone-600">Todavia no hay canciones. Crea la primera hoja y llenala con el lapiz.</p>
        )}
      </main>
    </div>
  )
}

function IconBtn(p: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={p.label}
      aria-label={p.label}
      onClick={p.onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${p.danger ? 'bg-red-600 text-white' : 'text-stone-500 hover:bg-stone-300'}`}
    >
      {p.children}
    </button>
  )
}
