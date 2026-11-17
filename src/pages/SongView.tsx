import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import PageSvg from '../components/PageSvg'
import { barreGeometry } from '../components/Marks'
import Toolbar, { COLORS, SIZES, type Tool } from '../components/Toolbar'
import { pathFor, strokeCenter, strokeHit } from '../ink/geometry'
import { PAGE_H, PAGE_W, cellIndexAt, cellRects, diagramGeometry, hitTarget, markCenter, onText, textZones, zoneAt } from '../layout'
import { recognize } from '../ink/recognize'
import { downloadBlob, getSong, saveSong } from '../store/db'
import { uid, type Barre, type BoxCount, type Finger, type Mark, type Point, type Song, type Stroke, type TextEntry } from '../types'

/** Lo que guarda el historial de deshacer */
type Snapshot = { strokes: Stroke[]; marks: Mark[]; barres: Barre[]; texts: Record<string, TextEntry>; boxes: BoxCount }
/** ms sin escribir en una zona antes de pasarla a letra de imprenta */
const RECOGNIZE_DELAY = 1000
/** Un trazo mas chico que esto (en unidades de pagina) cuenta como toque */
const TAP_SIZE = 9

interface TextEditor {
  key: string
  text: string
  color: string
  clientX: number
  clientY: number
}

interface FingerPicker {
  cell: number
  string: number
  fret: number
  clientX: number
  clientY: number
  current?: Finger
  /** ya hay una cejilla en este traste que pasa por esta cuerda */
  barre: boolean
}

const ERASER_R = 12
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3
const IS_PHONE = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 600
/** un toque de dedo que se mueve menos que esto (px) y dura menos que TAP_MS es un toque, no un arrastre */
const TAP_PX = 10
const TAP_MS = 500
/** ms despues del ultimo evento del lapiz en los que se ignoran toques (palma apoyada) */
const PALM_WINDOW = 700

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('pref:' + key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem('pref:' + key, JSON.stringify(v))
  } catch {
    /* sin storage */
  }
}

type Active =
  | { id: number; mode: 'draw'; points: Point[]; simulate: boolean; color: string; size: number; client: { x: number; y: number }; touch: boolean }
  | { id: number; mode: 'erase'; base: Snapshot; strokes: Stroke[]; marks: Mark[]; barres: Barre[]; texts: Record<string, TextEntry> }

function markAt(marks: Mark[], cell: number, string: number) {
  return marks.find((m) => m.cell === cell && m.string === string)
}
/** Pone (o saca, con finger null) la marca de una cuerda. Cada cuerda tiene una sola marca por acorde. */
function withMark(marks: Mark[], cell: number, string: number, fret: number, finger: Finger | null): Mark[] {
  const rest = marks.filter((m) => !(m.cell === cell && m.string === string))
  return finger === null ? rest : [...rest, { cell, string, fret, finger }]
}

export default function SongView({ id, onBack }: { id: string; onBack: () => void }) {
  const [song, setSong] = useState<Song | null | undefined>(undefined)
  const songRef = useRef(song)
  songRef.current = song

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColorState] = useState(() => loadPref('color', COLORS[0].value))
  const [size, setSizeState] = useState(() => loadPref('size', SIZES[0].value))
  // en celulares (sin lapiz) el dedo dibuja por defecto; en la tablet lo hace solo el lapiz
  const [fingerDraws, setFingerDrawsState] = useState(() => loadPref('fingerDraws', IS_PHONE))
  const [zoom, setZoom] = useState(1)
  const [baseW, setBaseW] = useState(0)

  const setColor = (c: string) => (setColorState(c), savePref('color', c), setTool('pen'))
  const setSize = (s: number) => (setSizeState(s), savePref('size', s), setTool('pen'))
  const setFingerDraws = (v: boolean) => (setFingerDrawsState(v), savePref('fingerDraws', v))

  const scrollerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const liveRef = useRef<SVGPathElement>(null)
  const cursorRef = useRef<SVGCircleElement>(null)

  // ---------- carga y autoguardado ----------
  useEffect(() => {
    getSong(id).then((s) => setSong(s ? { ...s, marks: s.marks ?? [], barres: s.barres ?? [], texts: s.texts ?? {} } : null))
  }, [id])

  const dirty = useRef(false)
  const update = useCallback((next: Song) => {
    dirty.current = true
    songRef.current = next
    setSong(next)
  }, [])

  useEffect(() => {
    if (!song || !dirty.current) return
    const t = setTimeout(() => {
      dirty.current = false
      saveSong(song)
    }, 500)
    return () => clearTimeout(t)
  }, [song])

  useEffect(() => {
    const flush = () => {
      if (dirty.current && songRef.current) {
        dirty.current = false
        saveSong(songRef.current)
      }
    }
    const onVis = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // ---------- historial ----------
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const [, bump] = useReducer((x: number) => x + 1, 0)

  const snap = (s: Song): Snapshot => ({ strokes: s.strokes, marks: s.marks, barres: s.barres, texts: s.texts, boxes: s.boxes })
  const pushUndo = (prev: Snapshot) => {
    undoStack.current.push(prev)
    if (undoStack.current.length > 200) undoStack.current.shift()
    redoStack.current = []
    bump()
  }
  /** Aplica cambios a trazos / marcas. Con record=true se puede deshacer. */
  const commit = (patch: Partial<Snapshot>, record = true) => {
    const s = songRef.current
    if (!s) return
    if (record) pushUndo(snap(s))
    update({ ...s, ...patch, updatedAt: Date.now() })
  }
  const undo = () => {
    const s = songRef.current
    const prev = undoStack.current.pop()
    if (!s || !prev) return
    redoStack.current.push(snap(s))
    update({ ...s, ...prev, updatedAt: Date.now() })
  }
  const redo = () => {
    const s = songRef.current
    const next = redoStack.current.pop()
    if (!s || !next) return
    undoStack.current.push(snap(s))
    update({ ...s, ...next, updatedAt: Date.now() })
  }

  // ---------- pasar a letra de imprenta ----------
  const [toPrint, setToPrintState] = useState(() => loadPref('toPrint', true))
  const setToPrint = (v: boolean) => (setToPrintState(v), savePref('toPrint', v))
  const [converting, setConverting] = useState(0)
  const [editor, setEditor] = useState<TextEditor | null>(null)
  const zoneTimers = useRef(new Map<string, number>())

  const scheduleZone = (key: string) => {
    const timers = zoneTimers.current
    clearTimeout(timers.get(key))
    timers.set(key, window.setTimeout(() => convertZone(key), RECOGNIZE_DELAY))
  }

  const convertZone = async (key: string) => {
    zoneTimers.current.delete(key)
    // si esta escribiendo, esperar a que termine
    if (active.current?.mode === 'draw') return scheduleZone(key)
    const s = songRef.current
    if (!s) return
    const zone = textZones(s.boxes).find((z) => z.key === key)
    const strokes = s.strokes.filter((st) => st.zone === key)
    if (!zone || !strokes.length) return
    setConverting((c) => c + 1)
    const text = await recognize(strokes, zone.rect.w, zone.rect.h, zone.digits)
    setConverting((c) => c - 1)
    const cur = songRef.current
    if (!text || !cur) return
    const ids = new Set(strokes.map((st) => st.id))
    // si mientras tanto se borro o deshizo, no tocar nada
    if (!cur.strokes.some((st) => ids.has(st.id))) return
    const prev = cur.texts[key]?.text
    const joined = prev ? (zone.digits ? prev + text : prev + ' ' + text) : text
    commit({
      strokes: cur.strokes.filter((st) => !ids.has(st.id)),
      texts: { ...cur.texts, [key]: { text: joined, color: strokes[0].color } },
    })
  }

  // al abrir: convertir lo que haya quedado escrito sin convertir
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!song || loadedRef.current) return
    loadedRef.current = true
    if (toPrint) new Set(song.strokes.map((st) => st.zone).filter(Boolean) as string[]).forEach(scheduleZone)
  })
  useEffect(() => () => zoneTimers.current.forEach((t) => clearTimeout(t)), [])

  /** Toque sobre un texto ya convertido: abrir el editor para corregirlo. */
  const tapText = (x: number, y: number, clientX: number, clientY: number): boolean => {
    const s = songRef.current
    if (!s) return false
    const z = zoneAt(s.boxes, x, y)
    const t = z && s.texts[z.key]
    if (!z || !t || !onText(z, t.text, x, y) || s.strokes.some((st) => st.zone === z.key)) return false
    setEditor({ key: z.key, text: t.text, color: t.color, clientX, clientY })
    return true
  }

  const saveText = (text: string | null) => {
    const s = songRef.current
    if (!s || !editor) return
    const texts = { ...s.texts }
    if (text && text.trim()) texts[editor.key] = { text: text.trim(), color: editor.color }
    else delete texts[editor.key]
    commit({ texts })
    setEditor(null)
  }

  /** Cambia la cantidad de acordes de la hoja. Los dedos y nombres se mantienen por orden (acorde 1, 2, 3...). */
  const changeBoxes = (n: BoxCount) => {
    const s = songRef.current
    if (!s || s.boxes === n) return
    const marks = s.marks.filter((m) => m.cell < n)
    const barres = s.barres.filter((b) => b.cell < n)
    const texts: Record<string, TextEntry> = {}
    for (const [k, v] of Object.entries(s.texts)) {
      const m = k.match(/^(name|fret)-(\d+)$/)
      if (!m || Number(m[2]) < n) texts[k] = v
    }
    commit({ boxes: n, marks, barres, texts })
  }

  // ---------- dedos ----------
  const [picker, setPicker] = useState<FingerPicker | null>(null)

  /** Toque sobre una cuerda: en la zona O/X alterna O -> X -> nada; sobre un traste abre el selector de dedo. */
  const tapString = (x: number, y: number, clientX: number, clientY: number): boolean => {
    const s = songRef.current
    if (!s) return false
    const t = hitTarget(s.boxes, x, y)
    if (!t) return false
    const existing = markAt(s.marks, t.cell, t.string)
    if (t.fret === 0) {
      const cur = existing?.fret === 0 ? existing.finger : null
      const next: Finger | null = cur === 'O' ? 'X' : cur === 'X' ? null : 'O'
      commit({ marks: withMark(s.marks, t.cell, t.string, 0, next) })
      return true
    }
    const barre = s.barres.some((b) => b.cell === t.cell && b.fret === t.fret && b.to >= t.string)
    setPicker({ ...t, clientX, clientY, current: existing?.fret === t.fret ? existing.finger : undefined, barre })
    return true
  }

  /** Pone una cejilla en el traste elegido, desde la e aguda hasta la cuerda tocada (o la quita). */
  const pickBarre = (add: boolean) => {
    const s = songRef.current
    if (!s || !picker) return
    const rest = s.barres.filter((b) => !(b.cell === picker.cell && b.fret === picker.fret))
    commit({ barres: add ? [...rest, { cell: picker.cell, fret: picker.fret, to: picker.string }] : rest })
    setPicker(null)
  }

  const pickFinger = (finger: Finger | null) => {
    const s = songRef.current
    if (!s || !picker) return
    commit({ marks: withMark(s.marks, picker.cell, picker.string, picker.fret, finger) })
    setPicker(null)
  }

  // ---------- tamano y zoom ----------
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBaseW(el.clientWidth))
    ro.observe(el)
    setBaseW(el.clientWidth)
    return () => ro.disconnect()
  }, [song === undefined || song === null])

  const pageW = Math.max(240, baseW - 24) * zoom
  const anchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null)

  const applyAnchor = () => {
    const a = anchor.current
    const sc = scrollerRef.current
    const pg = pageRef.current
    if (!a || !sc || !pg) return
    const sr = sc.getBoundingClientRect()
    sc.scrollLeft = pg.offsetLeft + a.fx * pg.offsetWidth - (a.cx - sr.left)
    sc.scrollTop = pg.offsetTop + a.fy * pg.offsetHeight - (a.cy - sr.top)
  }
  useLayoutEffect(applyAnchor, [zoom])

  const pageFraction = (cx: number, cy: number) => {
    const r = pageRef.current!.getBoundingClientRect()
    return { fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height }
  }
  const zoomTo = (z: number, cx?: number, cy?: number) => {
    const sc = scrollerRef.current
    if (!sc || !pageRef.current) return
    const sr = sc.getBoundingClientRect()
    const x = cx ?? sr.left + sr.width / 2
    const y = cy ?? sr.top + sr.height / 2
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
    if (!anchor.current || cx === undefined) anchor.current = { ...pageFraction(x, y), cx: x, cy: y }
    if (nz === zoom) applyAnchor()
    else setZoom(nz)
  }

  // ---------- entrada del lapiz ----------
  const active = useRef<Active | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const lastPen = useRef(-Infinity)
  const raf = useRef(0)
  /** toque de un dedo en curso (para distinguir toque de arrastre) */
  const touchTap = useRef<{ id: number; x: number; y: number; t: number; moved: boolean } | null>(null)

  const renderLive = () => {
    raf.current = 0
    const a = active.current
    const el = liveRef.current
    if (!el) return
    if (a?.mode === 'draw') {
      el.setAttribute('d', pathFor(a.points, a.size, a.simulate, false))
      el.setAttribute('fill', a.color)
    } else el.setAttribute('d', '')
  }
  const scheduleLive = () => {
    if (!raf.current) raf.current = requestAnimationFrame(renderLive)
  }

  const showCursor = (x: number, y: number, visible: boolean) => {
    const c = cursorRef.current
    if (!c) return
    c.setAttribute('cx', String(x))
    c.setAttribute('cy', String(y))
    c.setAttribute('visibility', visible ? 'visible' : 'hidden')
  }

  const pageMapper = () => {
    const r = svgRef.current!.getBoundingClientRect()
    return (cx: number, cy: number): [number, number] => [((cx - r.left) / r.width) * PAGE_W, ((cy - r.top) / r.height) * PAGE_H]
  }

  const eraseAt = (a: Extract<Active, { mode: 'erase' }>, x: number, y: number) => {
    const s = songRef.current
    if (!s) return
    const strokes = a.strokes.filter((st) => !strokeHit(st, x, y, ERASER_R))
    const cells = cellRects(s.boxes)
    const marks = a.marks.filter((m) => {
      const d = diagramGeometry(cells[m.cell])
      const [mx, my] = markCenter(d, m.string, m.fret)
      return Math.hypot(mx - x, my - y) > ERASER_R + d.s * 0.4
    })
    const barres = a.barres.filter((b) => {
      const g = barreGeometry(diagramGeometry(cells[b.cell]), b)
      return !(Math.abs(x - g.x) <= g.w / 2 + ERASER_R && y >= g.y1 - ERASER_R && y <= g.y2 + ERASER_R)
    })
    let texts = a.texts
    for (const z of textZones(s.boxes)) {
      const t = texts[z.key]
      if (t && onText(z, t.text, x, y)) {
        texts = { ...texts }
        delete texts[z.key]
      }
    }
    if (strokes.length !== a.strokes.length || marks.length !== a.marks.length || barres.length !== a.barres.length || texts !== a.texts) {
      a.strokes = strokes
      a.marks = marks
      a.barres = barres
      a.texts = texts
      commit({ strokes, marks, barres, texts }, false)
    }
  }

  const clearCell = (x: number, y: number) => {
    const s = songRef.current
    if (!s) return
    const idx = cellIndexAt(s.boxes, x, y)
    if (idx < 0) return
    const r = cellRects(s.boxes)[idx]
    const next = s.strokes.filter((st) => {
      const [cx, cy] = strokeCenter(st)
      return !(cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h)
    })
    const marks = s.marks.filter((m) => m.cell !== idx)
    const barres = s.barres.filter((b) => b.cell !== idx)
    const texts = { ...s.texts }
    delete texts['name-' + idx]
    delete texts['fret-' + idx]
    if (
      next.length !== s.strokes.length ||
      marks.length !== s.marks.length ||
      barres.length !== s.barres.length ||
      Object.keys(texts).length !== Object.keys(s.texts).length
    )
      commit({ strokes: next, marks, barres, texts })
    setTool('pen')
  }

  const startPinch = () => {
    const [p1, p2] = [...touches.current.values()]
    const mx = (p1.x + p2.x) / 2
    const my = (p1.y + p2.y) / 2
    pinch.current = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, zoom }
    anchor.current = { ...pageFraction(mx, my), cx: mx, cy: my }
  }

  const capture = (e: RPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* puntero no activo (eventos sinteticos) */
    }
  }

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const t = e.pointerType
    const now = performance.now()
    if (picker) setPicker(null)
    if (editor) setEditor(null)
    if (t === 'pen') {
      lastPen.current = now
      touches.current.clear()
      pinch.current = null
    }
    // con "dibujar con el dedo": un segundo dedo cancela el trazo y pasa a mover / hacer zoom
    if (t === 'touch' && fingerDraws && active.current?.mode === 'draw' && active.current.touch && active.current.id !== e.pointerId) {
      const a = active.current
      active.current = null
      renderLive()
      touches.current.set(a.id, a.client)
    }
    if (t === 'touch' && (!fingerDraws || touches.current.size > 0)) {
      if (now - lastPen.current < PALM_WINDOW || active.current) return
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      capture(e)
      touchTap.current = touches.current.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, moved: false } : null
      if (touches.current.size === 2) startPinch()
      return
    }
    if (active.current) return
    const s = songRef.current
    if (!s) return
    capture(e)
    const [x, y] = pageMapper()(e.clientX, e.clientY)
    // goma del lapiz (buttons 32) o boton lateral / click derecho (buttons 2)
    const eraserButton = (e.buttons & 32) !== 0 || (e.buttons & 2) !== 0
    if (tool === 'clear' && !eraserButton) return clearCell(x, y)
    if (tool === 'eraser' || eraserButton) {
      const a: Active = { id: e.pointerId, mode: 'erase', base: snap(s), strokes: s.strokes, marks: s.marks, barres: s.barres, texts: s.texts }
      active.current = a
      eraseAt(a, x, y)
      showCursor(x, y, true)
      return
    }
    active.current = {
      id: e.pointerId,
      mode: 'draw',
      points: [[x, y, t === 'pen' ? e.pressure || 0.5 : 0.5]],
      simulate: t !== 'pen',
      color,
      size,
      client: { x: e.clientX, y: e.clientY },
      touch: t === 'touch',
    }
    scheduleLive()
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const t = e.pointerType
    if (t === 'pen') lastPen.current = performance.now()
    const a = active.current
    if (a && a.id === e.pointerId) {
      const map = pageMapper()
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
      const list = coalesced.length ? coalesced : [e.nativeEvent]
      let last: [number, number] = [0, 0]
      for (const ev of list) {
        last = map(ev.clientX, ev.clientY)
        if (a.mode === 'draw') a.points.push([last[0], last[1], a.simulate ? 0.5 : ev.pressure || 0.5])
        else eraseAt(a, last[0], last[1])
      }
      if (a.mode === 'draw') {
        a.client = { x: e.clientX, y: e.clientY }
        scheduleLive()
      } else showCursor(last[0], last[1], true)
      return
    }
    if ((t === 'pen' || t === 'mouse') && !a) {
      const hovering = tool === 'eraser' || (e.buttons & 32) !== 0
      if (hovering) {
        const [x, y] = pageMapper()(e.clientX, e.clientY)
        showCursor(x, y, true)
      } else showCursor(0, 0, false)
    }
    const prev = touches.current.get(e.pointerId)
    if (!prev) return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const tt = touchTap.current
    if (tt && (tt.id !== e.pointerId || Math.hypot(e.clientX - tt.x, e.clientY - tt.y) > TAP_PX)) tt.moved = true
    const sc = scrollerRef.current!
    if (touches.current.size === 1) {
      sc.scrollLeft -= e.clientX - prev.x
      sc.scrollTop -= e.clientY - prev.y
    } else if (touches.current.size === 2 && pinch.current) {
      const [p1, p2] = [...touches.current.values()]
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      const mx = (p1.x + p2.x) / 2
      const my = (p1.y + p2.y) / 2
      if (anchor.current) {
        anchor.current.cx = mx
        anchor.current.cy = my
      }
      zoomTo((pinch.current.zoom * dist) / pinch.current.dist, mx, my)
    }
  }

  const onPointerEnd = (e: RPointerEvent<HTMLDivElement>) => {
    if (touches.current.delete(e.pointerId)) {
      if (touches.current.size < 2) {
        pinch.current = null
        anchor.current = null
      }
      // toque corto de un dedo: igual que un toque del lapiz (dedos, O/X, corregir texto)
      const tt = touchTap.current
      touchTap.current = null
      if (tt && tt.id === e.pointerId && !tt.moved && touches.current.size === 0 && performance.now() - tt.t < TAP_MS) {
        const [x, y] = pageMapper()(tt.x, tt.y)
        tapString(x, y, tt.x, tt.y) || tapText(x, y, tt.x, tt.y)
      }
      return
    }
    const a = active.current
    if (!a || a.id !== e.pointerId) return
    active.current = null
    const s = songRef.current
    if (a.mode === 'draw' && s) {
      // un toque (sin arrastrar) sobre una cuerda pone un dedo / O / X en vez de tinta
      const xs = a.points.map((p) => p[0])
      const ys = a.points.map((p) => p[1])
      // para el dedo el umbral se mide en px de pantalla (en el celular la hoja se ve chica)
      const tapSize = a.touch ? (TAP_PX * PAGE_W) / svgRef.current!.getBoundingClientRect().width : TAP_SIZE
      const isTap = Math.max(...xs) - Math.min(...xs) < tapSize && Math.max(...ys) - Math.min(...ys) < tapSize
      const [x0, y0] = a.points[0]
      const handled = isTap && (tapString(x0, y0, e.clientX, e.clientY) || tapText(x0, y0, e.clientX, e.clientY))
      // un toque de dedo fuera de las cuerdas no deja un punto de tinta
      const fingerTapMiss = isTap && a.touch && !handled
      if (!handled && !fingerTapMiss) {
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2
        const cy = (Math.max(...ys) + Math.min(...ys)) / 2
        const zone = toPrint ? zoneAt(s.boxes, cx, cy) : undefined
        const stroke: Stroke = { id: uid(), color: a.color, size: a.size, simulate: a.simulate, points: a.points, zone: zone?.key }
        commit({ strokes: [...s.strokes, stroke] })
        if (zone) scheduleZone(zone.key)
      }
    } else if (a.mode === 'erase') {
      if (a.strokes !== a.base.strokes || a.marks !== a.base.marks || a.barres !== a.base.barres || a.texts !== a.base.texts) pushUndo(a.base)
      showCursor(0, 0, tool === 'eraser' && e.pointerType !== 'touch')
    }
    renderLive()
  }

  const onPointerLeave = (e: RPointerEvent<HTMLDivElement>) => {
    if (!active.current && e.pointerType !== 'touch') showCursor(0, 0, false)
  }

  // ---------- exportar PNG ----------
  const exportPng = async () => {
    const svg = svgRef.current
    if (!svg || !song) return
    const W = 2000
    const H = Math.round((W * PAGE_H) / PAGE_W)
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.querySelectorAll('[data-overlay]').forEach((n) => n.remove())
    clone.removeAttribute('style')
    clone.setAttribute('width', String(W))
    clone.setAttribute('height', String(H))
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
    try {
      const img = new Image()
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      canvas.getContext('2d')!.drawImage(img, 0, 0, W, H)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      const name = (song.title || 'cancion').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()
      if (blob) downloadBlob(blob, `${name || 'cancion'}.png`)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (song === undefined) return <div className="p-8 text-stone-500">Cargando...</div>
  if (song === null)
    return (
      <div className="p-8">
        <p className="mb-4 text-stone-600">No se encontro la cancion.</p>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-white" onClick={onBack}>
          Volver
        </button>
      </div>
    )

  return (
    <div className="flex h-dvh flex-col">
      <Toolbar
        title={song.title}
        onTitle={(title) => update({ ...song, title, updatedAt: Date.now() })}
        onBack={onBack}
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        size={size}
        setSize={setSize}
        canUndo={undoStack.current.length > 0}
        canRedo={redoStack.current.length > 0}
        onUndo={undo}
        onRedo={redo}
        zoom={zoom}
        onZoom={(f) => {
          anchor.current = null
          zoomTo(f === 0 ? 1 : zoom * f)
        }}
        fingerDraws={fingerDraws}
        setFingerDraws={setFingerDraws}
        toPrint={toPrint}
        setToPrint={setToPrint}
        boxes={song.boxes}
        setBoxes={changeBoxes}
        onExportPng={exportPng}
      />
      <div
        ref={scrollerRef}
        className="relative flex-1 overflow-auto bg-stone-300 py-3"
        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={pageRef} className="mx-auto shadow-lg" style={{ width: pageW }}>
          <PageSvg ref={svgRef} boxes={song.boxes} strokes={song.strokes} marks={song.marks} barres={song.barres} texts={song.texts}>
            <path ref={liveRef} data-overlay="" d="" />
            <circle ref={cursorRef} data-overlay="" r={ERASER_R} fill="rgba(220,38,38,0.08)" stroke="#dc2626" strokeWidth={1.5} visibility="hidden" />
          </PageSvg>
        </div>
      </div>
      {converting > 0 && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-10 rounded-full bg-slate-800/90 px-4 py-2 text-sm text-stone-100 shadow">
          Pasando a letra de imprenta...
        </div>
      )}
      {editor && <TextEditorPopup editor={editor} onSave={saveText} onClose={() => setEditor(null)} />}
      {picker && <FingerPickerPopup picker={picker} onPick={pickFinger} onBarre={pickBarre} onClose={() => setPicker(null)} />}
    </div>
  )
}

const FINGERS: Finger[] = [1, 2, 3, 4]

function FingerPickerPopup(props: {
  picker: FingerPicker
  onPick: (f: Finger | null) => void
  onBarre: (add: boolean) => void
  onClose: () => void
}) {
  const { picker, onPick, onBarre, onClose } = props
  const W = 300
  const H = 140
  const left = Math.min(Math.max(8, picker.clientX - W / 2), window.innerWidth - W - 8)
  // arriba del punto para que la mano no lo tape; si no entra, abajo
  const top = picker.clientY - H - 20 > 8 ? picker.clientY - H - 20 : picker.clientY + 36
  return (
    <>
      <div className="fixed inset-0 z-20" onPointerDown={onClose} />
      <div className="fixed z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-800 p-2 shadow-2xl" style={{ left, top, width: W }}>
        {FINGERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onPick(f)}
            aria-label={`Dedo ${f}`}
            className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold ${
              picker.current === f ? 'bg-amber-400 text-slate-900' : 'bg-stone-100 text-slate-900 active:bg-amber-300'
            }`}
          >
            {f}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label="Quitar"
          disabled={picker.current === undefined}
          className="ml-auto flex h-14 w-14 items-center justify-center rounded-full text-sm text-stone-200 disabled:opacity-30"
        >
          Quitar
        </button>
        <button
          type="button"
          onClick={() => onBarre(!picker.barre)}
          className={`flex h-12 w-full items-center justify-center gap-3 rounded-xl text-base ${
            picker.barre ? 'bg-slate-700 text-stone-100' : 'bg-stone-100 text-slate-900 active:bg-amber-300'
          }`}
        >
          <span className="inline-block h-6 w-2 rounded-full bg-current" />
          {picker.barre ? 'Quitar cejilla' : 'Cejilla hasta esta cuerda'}
        </button>
      </div>
    </>
  )
}

function TextEditorPopup({ editor, onSave, onClose }: { editor: TextEditor; onSave: (t: string | null) => void; onClose: () => void }) {
  const [value, setValue] = useState(editor.text)
  const W = 360
  const left = Math.min(Math.max(8, editor.clientX - W / 2), window.innerWidth - W - 8)
  const top = editor.clientY + 30 + 70 < window.innerHeight ? editor.clientY + 30 : Math.max(8, editor.clientY - 100)
  return (
    <>
      <div className="fixed inset-0 z-20" onPointerDown={onClose} />
      <form
        className="fixed z-30 flex items-center gap-2 rounded-2xl bg-slate-800 p-2 shadow-2xl"
        style={{ left, top, width: W }}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(value)
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-lg bg-white px-3 text-lg text-slate-900 focus:outline-2 focus:outline-amber-400"
        />
        <button type="submit" className="h-12 rounded-lg bg-amber-400 px-4 font-medium text-slate-900">
          Listo
        </button>
        <button type="button" onClick={() => onSave(null)} className="h-12 rounded-lg px-2 text-sm text-stone-200">
          Borrar
        </button>
      </form>
    </>
  )
}
