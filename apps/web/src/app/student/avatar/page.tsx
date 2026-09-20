'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Brush,
  Coins,
  Eraser,
  Glasses,
  Crown,
  Palette,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

type Tool = 'brush' | 'eraser'
type StickerType = 'hat' | 'glasses'

type Point = {
  x: number
  y: number
}

type Stroke = {
  tool: Tool
  color: string
  size: number
  points: Point[]
}

type Sticker = {
  id: string
  type: StickerType
  x: number
  y: number
}

const palette = ['#ffffff', '#7C3AED', '#06B6D4', '#F472B6', '#F59E0B', '#22C55E']
const brushSizes = [4, 8, 14, 22]

const stickerOptions = [
  { type: 'hat', label: '帽子', icon: Crown },
  { type: 'glasses', label: '眼镜', icon: Glasses },
] as const

function drawSticker(
  context: CanvasRenderingContext2D,
  sticker: Sticker,
  scaleX: number,
  scaleY: number
) {
  const x = sticker.x * scaleX
  const y = sticker.y * scaleY

  context.save()

  if (sticker.type === 'hat') {
    context.fillStyle = '#0f172a'
    context.beginPath()
    context.moveTo(x - 54 * scaleX, y + 10 * scaleY)
    context.lineTo(x - 18 * scaleX, y - 28 * scaleY)
    context.lineTo(x + 18 * scaleX, y - 28 * scaleY)
    context.lineTo(x + 54 * scaleX, y + 10 * scaleY)
    context.closePath()
    context.fill()

    context.fillStyle = '#111827'
    context.fillRect(x - 72 * scaleX, y + 12 * scaleY, 144 * scaleX, 10 * scaleY)

    context.strokeStyle = '#f59e0b'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(x + 22 * scaleX, y - 26 * scaleY)
    context.lineTo(x + 50 * scaleX, y + 6 * scaleY)
    context.stroke()

    context.fillStyle = '#f59e0b'
    context.beginPath()
    context.arc(x + 20 * scaleX, y - 26 * scaleY, 4 * scaleX, 0, Math.PI * 2)
    context.fill()
  } else {
    context.strokeStyle = '#e2e8f0'
    context.lineWidth = 5
    context.beginPath()
    context.arc(x - 34 * scaleX, y, 22 * scaleX, 0, Math.PI * 2)
    context.arc(x + 34 * scaleX, y, 22 * scaleX, 0, Math.PI * 2)
    context.stroke()

    context.beginPath()
    context.moveTo(x - 12 * scaleX, y)
    context.lineTo(x + 12 * scaleX, y)
    context.stroke()
  }

  context.restore()
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  scaleX: number,
  scaleY: number
) {
  if (stroke.points.length === 0) return

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = stroke.tool === 'eraser' ? '#020617' : stroke.color
  context.lineWidth = stroke.size * ((scaleX + scaleY) / 2)

  context.beginPath()
  context.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY)

  for (let index = 1; index < stroke.points.length; index += 1) {
    context.lineTo(stroke.points[index].x * scaleX, stroke.points[index].y * scaleY)
  }

  context.stroke()
  context.restore()
}

export default function StudentAvatarPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)

  const [activeTool, setActiveTool] = useState<Tool>('brush')
  const [activeColor, setActiveColor] = useState('#ffffff')
  const [brushSize, setBrushSize] = useState(8)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [coins, setCoins] = useState(0)

  const toolbarLabel = useMemo(() => {
    return activeTool === 'brush' ? `画笔 ${brushSize}px` : '橡皮擦'
  }, [activeTool, brushSize])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = canvasWrapRef.current
    if (!canvas || !wrapper) return

    const render = () => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const context = canvas.getContext('2d')
      if (!context) return

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.scale(dpr, dpr)
      context.fillStyle = '#020617'
      context.fillRect(0, 0, rect.width, rect.height)

      context.strokeStyle = 'rgba(255,255,255,0.06)'
      context.lineWidth = 1
      for (let x = 0; x < rect.width; x += 36) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, rect.height)
        context.stroke()
      }
      for (let y = 0; y < rect.height; y += 36) {
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(rect.width, y)
        context.stroke()
      }

      const scaleX = rect.width / 1000
      const scaleY = rect.height / 700

      stickers.forEach((sticker) => drawSticker(context, sticker, scaleX, scaleY))
      strokes.forEach((stroke) => drawStroke(context, stroke, scaleX, scaleY))
    }

    render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [stickers, strokes])

  useEffect(() => {
    api.user.me().then((user) => setCoins(user.coins)).catch(() => undefined)
  }, [])

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1000,
      y: ((event.clientY - rect.top) / rect.height) * 700,
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event)
    if (!point) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDrawing(true)

    setStrokes((prev) => [
      ...prev,
      {
        tool: activeTool,
        color: activeColor,
        size: brushSize,
        points: [point],
      },
    ])
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const point = getPoint(event)
    if (!point) return

    setStrokes((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const latest = next[next.length - 1]
      next[next.length - 1] = { ...latest, points: [...latest.points, point] }
      return next
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsDrawing(false)
  }

  function addSticker(type: StickerType) {
    const offset = stickers.length * 24
    setStickers((prev) => [
      ...prev,
      {
        id: `${type}-${Date.now()}-${prev.length}`,
        type,
        x: 500 + (offset % 120) - 60,
        y: type === 'hat' ? 140 : 280 + (offset % 40),
      },
    ])
    toast.success(`已添加${type === 'hat' ? '帽子' : '眼镜'}贴纸`)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) {
      toast.error('头像画布尚未准备好')
      return
    }
    try {
      const result = await api.user.updateAvatar({
        type: 'custom',
        customImageUrl: canvas.toDataURL('image/png'),
      })
      setCoins(result.totalCoins)
      toast.success('保存成功', { description: '你的虚拟人物已经保存并穿戴完成。' })
      router.push('/student/live')
    } catch {
      // The shared API client displays the actionable error message.
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-white md:px-6">
      <div className="absolute inset-0 hero-grid opacity-35" />
      <div className="animate-aurora absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="animate-aurora absolute bottom-[-8rem] right-[-4rem] h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1500px] flex-col gap-4">
        <header className="glass-panel shadow-neon flex flex-col gap-4 rounded-[28px] border border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Avatar Forge</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">学生端虚拟人物工坊</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
              当前工具 <span className="ml-2 font-semibold text-cyan-200">{toolbarLabel}</span>
            </div>
            <div className="rounded-full border border-amber-300/15 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
              <Coins className="mr-2 inline h-4 w-4" />
              当前金币：{coins}
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="glass-panel shadow-neon flex min-h-[700px] flex-col rounded-[32px] border border-white/10 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Canvas Studio</p>
                <h2 className="mt-2 text-xl font-semibold">自由涂鸦你的专属人物</h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full border border-white/10 bg-white/5 px-4 text-slate-200 hover:bg-white/10"
                onClick={() => {
                  setStrokes([])
                  setStickers([])
                  toast.success('画布已清空')
                }}
              >
                <Wand2 className="mr-2 h-4 w-4" />
                清空画布
              </Button>
            </div>

            <div
              ref={canvasWrapRef}
              className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#020617]"
            >
              <div className="pointer-events-none absolute left-5 top-4 z-10 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-200/75">
                Draw Your Character
              </div>
              <canvas
                ref={canvasRef}
                className="relative z-0 h-full min-h-[560px] w-full touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            </div>
          </div>

          <aside className="glass-panel shadow-neon rounded-[32px] border border-white/10 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Tool Bar</p>
              <h2 className="mt-2 text-2xl font-semibold">创作控制台</h2>
            </div>

            <div className="mt-6 space-y-6">
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Palette className="h-4 w-4 text-cyan-300" />
                  调色板
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {palette.map((color) => (
                    <motion.button
                      key={color}
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setActiveTool('brush')
                        setActiveColor(color)
                      }}
                      className={`h-14 rounded-2xl border transition ${
                        activeColor === color && activeTool === 'brush'
                          ? 'border-white/70 ring-2 ring-cyan-300/70'
                          : 'border-white/10'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Brush className="h-4 w-4 text-cyan-300" />
                  画笔粗细
                </div>
                <div className="space-y-3">
                  {brushSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setActiveTool('brush')
                        setBrushSize(size)
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 transition ${
                        brushSize === size && activeTool === 'brush'
                          ? 'border-cyan-300/25 bg-cyan-400/10'
                          : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className="text-sm text-slate-200">{size}px</span>
                      <span
                        className="rounded-full bg-white"
                        style={{ width: size + 4, height: size + 4 }}
                      />
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Eraser className="h-4 w-4 text-cyan-300" />
                  橡皮擦
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool('eraser')}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 transition ${
                    activeTool === 'eraser'
                      ? 'border-violet-300/25 bg-violet-400/10 text-white'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                    <Eraser className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">启用橡皮擦</p>
                    <p className="mt-1 text-xs text-slate-400">用深色擦除当前涂鸦内容</p>
                  </div>
                </button>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  好玩贴纸
                </div>
                <div className="grid gap-3">
                  {stickerOptions.map((sticker) => {
                    const Icon = sticker.icon
                    return (
                      <motion.button
                        key={sticker.type}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => addSticker(sticker.type)}
                        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-cyan-500/10 opacity-0 transition group-hover:opacity-100" />
                        <div className="relative flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{sticker.label}</p>
                            <p className="mt-1 text-xs text-slate-400">一键添加到画布中央</p>
                          </div>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              </section>
            </div>
          </aside>
        </section>

        <footer className="glass-panel shadow-neon flex flex-col gap-4 rounded-[28px] border border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="rounded-full border border-amber-300/15 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
            <Coins className="mr-2 inline h-4 w-4" />
            当前金币：{coins}
          </div>

          <Button
            type="button"
            onClick={handleSave}
            className="h-12 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 px-6 text-white shadow-[0_12px_30px_rgba(124,58,237,0.35)] hover:opacity-95"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            保存并穿戴
          </Button>
        </footer>
      </div>
    </main>
  )
}
