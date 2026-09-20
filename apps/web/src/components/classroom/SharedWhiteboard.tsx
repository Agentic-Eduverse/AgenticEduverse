'use client'

import { useEffect, useRef, useState } from 'react'
import type { WhiteboardEventData } from '@eduverse/shared'
import { Button } from '@/components/ui/button'

type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; width: number }

export default function SharedWhiteboard({ events, isTeacher, onAction }: { events: WhiteboardEventData[]; isTeacher: boolean; onAction: (action: 'stroke' | 'clear' | 'undo', payload: unknown) => Promise<boolean> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState<Point[]>([])
  const [color, setColor] = useState('#1e293b')
  const drawRef = useRef<() => void>(() => undefined)

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr) }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, rect.width, rect.height)
    context.strokeStyle = '#e2e8f0'; context.lineWidth = 1
    for (let x = 0; x < rect.width; x += 32) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, rect.height); context.stroke() }
    for (let y = 0; y < rect.height; y += 32) { context.beginPath(); context.moveTo(0, y); context.lineTo(rect.width, y); context.stroke() }
    const strokes = events.reduce<Stroke[]>((current, event) => {
      if (event.action === 'clear') return []
      if (event.action === 'undo') return current.slice(0, -1)
      return [...current, event.payload as Stroke]
    }, [])
    for (const stroke of [...strokes, ...(draft.length > 1 ? [{ points: draft, color, width: 3 }] : [])]) {
      if (!stroke.points?.length) continue
      context.strokeStyle = stroke.color || '#1e293b'; context.lineWidth = stroke.width || 3; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath()
      stroke.points.forEach((point, index) => { const x = point.x * rect.width; const y = point.y * rect.height; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y) }); context.stroke()
    }
  }
  drawRef.current = draw
  useEffect(draw, [events, draft, color])
  useEffect(() => { const resize = () => drawRef.current(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    // React releases `currentTarget` once the handler returns, so this must never be
    // called from inside a deferred state updater.
    const canvas = event.currentTarget as HTMLCanvasElement | null
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return { x: 0, y: 0 }
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }
  const down = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!isTeacher) return; event.currentTarget.setPointerCapture(event.pointerId); setDrawing(true); setDraft([point(event)]) }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    // Read the geometry eagerly - by the time React runs the updater the event object is
    // no longer usable and `currentTarget` is null.
    const next = point(event)
    setDraft((current) => [...current, next].slice(-2000))
  }
  const up = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    setDrawing(false)
    const canvas = event.currentTarget
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    const points = [...draft, point(event)]
    if (points.length > 1) await onAction('stroke', { points, color, width: 3 })
    setDraft([])
  }

  return <section className="rounded-lg border border-slate-200 bg-white p-3 text-slate-900"><div className="mb-2 flex items-center gap-2"><strong className="mr-auto text-sm">共享白板</strong>{isTeacher && <><input aria-label="画笔颜色" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><Button size="sm" variant="outline" onClick={() => onAction('undo', {})}>撤销</Button><Button size="sm" variant="outline" className="text-red-700" onClick={() => onAction('clear', {})}>清空</Button></>}</div><canvas ref={canvasRef} className={`h-72 w-full rounded border border-slate-200 bg-white touch-none ${isTeacher ? 'cursor-crosshair' : 'cursor-default'}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /></section>
}
