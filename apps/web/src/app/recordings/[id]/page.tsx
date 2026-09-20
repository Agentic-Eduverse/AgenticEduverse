'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { WhiteboardEventData } from '@eduverse/shared'
import { Button } from '@/components/ui/button'

type Stroke = { points: Array<{ x: number; y: number }>; color: string; width: number }
type PlaybackData = {
  recording: { id: string; className: string; startedAt: string; endedAt: string | null; playbackUrl: string }
  whiteboardStart: WhiteboardEventData[]
  events: WhiteboardEventData[]
}

function reduceStrokes(events: WhiteboardEventData[]): Stroke[] {
  return events.reduce<Stroke[]>((current, event) => {
    if (event.action === 'clear') return []
    if (event.action === 'undo') return current.slice(0, -1)
    return [...current, event.payload as Stroke]
  }, [])
}

export default function RecordingPlaybackPage() {
  const id = String(useParams()?.id || '')
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<PlaybackData | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/media/recording/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json() as { success: boolean; data?: PlaybackData; message?: string }
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || '加载回放失败')
      setData(result.data)
    }).catch((reason) => { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '加载回放失败') })
    return () => controller.abort()
  }, [id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr))
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.fillStyle = '#fff'; context.fillRect(0, 0, rect.width, rect.height)
    const cutoff = new Date(data.recording.startedAt).getTime() + currentTime * 1000
    const timed = data.events.filter((event) => new Date(event.createdAt).getTime() <= cutoff)
    for (const stroke of reduceStrokes([...data.whiteboardStart, ...timed])) {
      if (!stroke.points?.length) continue
      context.strokeStyle = stroke.color || '#1e293b'; context.lineWidth = stroke.width || 3; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath()
      stroke.points.forEach((point, index) => { const x = point.x * rect.width; const y = point.y * rect.height; if (!index) context.moveTo(x, y); else context.lineTo(x, y) }); context.stroke()
    }
  }, [data, currentTime])

  return <main className="light-ui min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8"><div className="mx-auto max-w-6xl"><Button variant="outline" onClick={() => router.back()}>返回</Button><h1 className="mt-5 text-3xl font-bold">{data?.recording.className || '课堂'}回放</h1>{error && <p className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}{!data && !error && <p className="mt-6 text-slate-600">正在加载授权录像…</p>}{data && <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-semibold">主课堂音视频</h2><video className="aspect-video w-full rounded bg-black" src={data.recording.playbackUrl} controls onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} /></section><section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-semibold">同步白板</h2><canvas ref={canvasRef} className="aspect-video w-full rounded border border-slate-200 bg-white" /></section></div>}</div></main>
}
