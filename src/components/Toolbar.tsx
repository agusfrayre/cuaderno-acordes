import { useState, type ReactNode } from 'react'
import type { BoxCount } from '../types'
import { ArrowLeft, Download, Eraser, Hand, Type, MoreVertical, Pencil, Redo2, SquareX, Undo2, ZoomIn, ZoomOut } from 'lucide-react'

export type Tool = 'pen' | 'eraser' | 'clear'

export const COLORS = [
  { name: 'Negro', value: '#1c1917' },
  { name: 'Azul', value: '#1d4ed8' },
  { name: 'Rojo', value: '#dc2626' },
]
export const SIZES = [
  { name: 'Fino', value: 4 },
  { name: 'Grueso', value: 7 },
]

function Btn(props: { active?: boolean; disabled?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors disabled:opacity-30 ${
        props.active ? 'bg-amber-400 text-slate-900' : 'text-stone-100 hover:bg-slate-700 active:bg-slate-600'
      }`}
    >
      {props.children}
    </button>
  )
}

const Sep = () => <div className="mx-1 h-7 w-px bg-slate-600" />

interface Props {
  title: string
  onTitle: (t: string) => void
  onBack: () => void
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  size: number
  setSize: (s: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  zoom: number
  /** factor multiplicador; 0 = volver a 100% */
  onZoom: (factor: number) => void
  fingerDraws: boolean
  setFingerDraws: (v: boolean) => void
  toPrint: boolean
  setToPrint: (v: boolean) => void
  boxes: BoxCount
  setBoxes: (n: BoxCount) => void
  onExportPng: () => void
}

export default function Toolbar(p: Props) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-1 bg-slate-800 px-2 py-1.5 text-stone-100 shadow">
      <Btn label="Volver a canciones" onClick={p.onBack}>
        <ArrowLeft size={22} />
      </Btn>
      <input
        value={p.title}
        onChange={(e) => p.onTitle(e.target.value)}
        placeholder="Titulo"
        className="h-10 w-40 min-w-0 rounded-lg bg-slate-700 px-3 text-base text-white placeholder:text-slate-400 focus:outline-2 focus:outline-amber-400 lg:w-56"
      />
      <Sep />
      <Btn label="Lapiz" active={p.tool === 'pen'} onClick={() => p.setTool('pen')}>
        <Pencil size={22} />
      </Btn>
      <Btn label="Goma" active={p.tool === 'eraser'} onClick={() => p.setTool('eraser')}>
        <Eraser size={22} />
      </Btn>
      <Btn label="Limpiar un acorde (toca el acorde)" active={p.tool === 'clear'} onClick={() => p.setTool(p.tool === 'clear' ? 'pen' : 'clear')}>
        <SquareX size={22} />
      </Btn>
      <Sep />
      {p.tool !== 'eraser' &&
        COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={p.color === c.value}
            onClick={() => p.setColor(c.value)}
            className="flex h-11 w-11 items-center justify-center"
          >
            <span
              className={`block h-7 w-7 rounded-full border-2 ${p.color === c.value ? 'border-amber-400 ring-2 ring-amber-400' : 'border-stone-200'}`}
              style={{ background: c.value }}
            />
          </button>
        ))}
      {p.tool !== 'eraser' &&
        SIZES.map((s) => (
          <Btn key={s.value} label={s.name} active={p.size === s.value} onClick={() => p.setSize(s.value)}>
            <span className="block rounded-full bg-current" style={{ width: s.value * 2.4, height: s.value * 2.4 }} />
          </Btn>
        ))}
      <Sep />
      <Btn label="Deshacer" disabled={!p.canUndo} onClick={p.onUndo}>
        <Undo2 size={22} />
      </Btn>
      <Btn label="Rehacer" disabled={!p.canRedo} onClick={p.onRedo}>
        <Redo2 size={22} />
      </Btn>
      <Sep />
      <Btn label="Alejar" onClick={() => p.onZoom(1 / 1.25)}>
        <ZoomOut size={22} />
      </Btn>
      <Btn label="Ajustar al ancho" onClick={() => p.onZoom(0)}>
        <span className="w-11 text-center tabular-nums">{Math.round(p.zoom * 100)}%</span>
      </Btn>
      <Btn label="Acercar" onClick={() => p.onZoom(1.25)}>
        <ZoomIn size={22} />
      </Btn>
      <div className="ml-auto" />
      <Btn label="Mas opciones" active={menu} onClick={() => setMenu(!menu)}>
        <MoreVertical size={22} />
      </Btn>
      {menu && (
        <div className="absolute top-full right-2 mt-1 w-64 rounded-xl bg-slate-800 p-2 shadow-xl">
          <p className="px-3 pt-2 pb-1 text-sm">Acordes por hoja</p>
          <div className="mb-2 flex gap-1 px-2">
            {([6, 9, 12, 16] as BoxCount[]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => p.setBoxes(n)}
                className={`h-10 flex-1 rounded-lg text-sm ${p.boxes === n ? 'bg-amber-400 font-semibold text-slate-900' : 'bg-slate-700 text-stone-100'}`}
              >
                {n === 16 ? '16 (4x4)' : n}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-slate-700"
            onClick={() => {
              setMenu(false)
              p.onExportPng()
            }}
          >
            <Download size={20} /> Guardar hoja como imagen
          </button>
          <label className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-slate-700">
            <Type size={20} />
            <span className="flex-1">Pasar a letra de imprenta</span>
            <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={p.toPrint} onChange={(e) => p.setToPrint(e.target.checked)} />
          </label>
          <p className="px-3 pb-2 text-xs text-slate-400">
            Lo que escribas en el titulo, capo, nombre del acorde, traste y notas se convierte en texto (necesita internet). Toca un texto para corregirlo.
          </p>
          <label className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-slate-700">
            <Hand size={20} />
            <span className="flex-1">Dibujar con el dedo</span>
            <input type="checkbox" className="h-5 w-5 accent-amber-400" checked={p.fingerDraws} onChange={(e) => p.setFingerDraws(e.target.checked)} />
          </label>
          <p className="px-3 pb-1 text-xs text-slate-400">
            Normalmente solo el lapiz escribe y los dedos mueven la hoja (pellizcar para zoom). Activalo si el lapiz no responde.
          </p>
        </div>
      )}
    </div>
  )
}
