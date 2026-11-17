import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import PageSvg from '../components/PageSvg'
import Toolbar, { COLORS, SIZES, type Tool } from '../components/Toolbar'
import { pathFor, strokeCenter, strokeHit } from '../ink/geometry'
import { PAGE_H, PAGE_W, cellIndexAt, cellRects } from '../layout'
import { downloadBlob, getSong, saveSong } from '../store/db'
import { uid, type Point, type Song, type Stroke } from '../types'

const ERASER_R = 12
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3
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
  | { id: number; mode: 'draw'; points: Point[]; simulate: boolean; color: string; size: number }
  | { id: number; mode: 'erase'; base: Stroke[]; current: Stroke[] }

export default function SongView({ id, onBack }: { id: string; onBack: () => void }) {
  const [song, setSong] = useState<Song | null | undefined>(undefined)
  const songRef = useRef(song)
  songRef.current = song

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColorState] = useState(() => loadPref('color', COLORS[0].value))
  const [size, setSizeState] = useState(() => loadPref('size', SIZES[0].value))
  const [fingerDraws, setFingerDrawsState] = useState(() => loadPref('fingerDraws', false))
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
    getSong(id).then((s) => setSong(s ?? null))
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
  const undoStack = useRef<Stroke[][]>([])
  const redoStack = useRef<Stroke[][]>([])
  const [, bump] = useReducer((x: number) => x + 1, 0)

  const pushUndo = (prev: Stroke[]) => {
    undoStack.current.push(prev)
    if (undoStack.current.length > 200) undoStack.current.shift()
    redoStack.current = []
    bump()
  }
  const setStrokes = (next: Stroke[], prev?: Stroke[]) => {
    const s = songRef.current
    if (!s) return
    if (prev) pushUndo(prev)
    update({ ...s, strokes: next, updatedAt: Date.now() })
  }
  const undo = () => {
    const s = songRef.current
    const prev = undoStack.current.pop()
    if (!s || !prev) return
    redoStack.current.push(s.strokes)
    update({ ...s, strokes: prev, updatedAt: Date.now() })
  }
  const redo = () => {
    const s = songRef.current
    const next = redoStack.current.pop()
    if (!s || !next) return
    undoStack.current.push(s.strokes)
    update({ ...s, strokes: next, updatedAt: Date.now() })
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
    const next = a.current.filter((s) => !strokeHit(s, x, y, ERASER_R))
    if (next.length !== a.current.length) {
      a.current = next
      setStrokes(next)
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
    if (next.length !== s.strokes.length) setStrokes(next, s.strokes)
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
    if (t === 'pen') {
      lastPen.current = now
      touches.current.clear()
      pinch.current = null
    }
    if (t === 'touch' && !fingerDraws) {
      if (now - lastPen.current < PALM_WINDOW || active.current) return
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      capture(e)
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
      const a: Active = { id: e.pointerId, mode: 'erase', base: s.strokes, current: s.strokes }
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
      if (a.mode === 'draw') scheduleLive()
      else showCursor(last[0], last[1], true)
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
      return
    }
    const a = active.current
    if (!a || a.id !== e.pointerId) return
    active.current = null
    const s = songRef.current
    if (a.mode === 'draw' && s) {
      const stroke: Stroke = { id: uid(), color: a.color, size: a.size, simulate: a.simulate, points: a.points }
      setStrokes([...s.strokes, stroke], s.strokes)
    } else if (a.mode === 'erase') {
      if (a.current !== a.base) pushUndo(a.base)
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
          <PageSvg ref={svgRef} boxes={song.boxes} strokes={song.strokes}>
            <path ref={liveRef} data-overlay="" d="" />
            <circle ref={cursorRef} data-overlay="" r={ERASER_R} fill="rgba(220,38,38,0.08)" stroke="#dc2626" strokeWidth={1.5} visibility="hidden" />
          </PageSvg>
        </div>
      </div>
    </div>
  )
}
