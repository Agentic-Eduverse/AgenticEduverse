'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Brush,
  Coins,
  Crown,
  Eraser,
  Glasses,
  Heart,
  ImagePlus,
  Move,
  Palette,
  Smile,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

type Tool = 'brush' | 'eraser' | 'move'
type StickerType = 'hat' | 'glasses' | 'crown' | 'star' | 'heart' | 'smile' | 'custom'

type Point = { x: number; y: number }
type Stroke = { tool: Exclude<Tool, 'move'>; color: string; size: number; points: Point[] }
type Sticker = { id: string; type: StickerType; x: number; y: number; size: number; imageUrl?: string }

const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 700
const palette = [
  '#FFFFFF', '#CBD5E1', '#64748B', '#111827',
  '#EF4444', '#F97316', '#F59E0B', '#FACC15',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#D946EF', '#F472B6',
]
const brushSizes = [4, 8, 14, 22]
const stickerOptions = [
  { type: 'hat', label: '魔法帽', icon: Wand2 },
  { type: 'glasses', label: '酷酷眼镜', icon: Glasses },
  { type: 'crown', label: '闪亮皇冠', icon: Crown },
  { type: 'star', label: '幸运星星', icon: Star },
  { type: 'heart', label: '爱心', icon: Heart },
  { type: 'smile', label: '笑脸', icon: Smile },
] as const

function drawStickerShape(context: CanvasRenderingContext2D, sticker: Sticker, scaleX: number, scaleY: number) {
  const x = sticker.x * scaleX
  const y = sticker.y * scaleY
  const size = sticker.size * Math.min(scaleX, scaleY)
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (sticker.type === 'hat') {
    context.fillStyle = '#4C1D95'
    context.beginPath()
    context.moveTo(x - size * 0.42, y + size * 0.12)
    context.lineTo(x - size * 0.14, y - size * 0.42)
    context.lineTo(x + size * 0.14, y - size * 0.42)
    context.lineTo(x + size * 0.42, y + size * 0.12)
    context.closePath()
    context.fill()
    context.fillStyle = '#7C3AED'
    context.fillRect(x - size * 0.55, y + size * 0.12, size * 1.1, size * 0.11)
    context.fillStyle = '#FACC15'
    context.beginPath()
    context.arc(x + size * 0.12, y - size * 0.3, size * 0.06, 0, Math.PI * 2)
    context.fill()
  } else if (sticker.type === 'glasses') {
    context.strokeStyle = '#E2E8F0'
    context.lineWidth = Math.max(4, size * 0.055)
    context.beginPath()
    context.arc(x - size * 0.28, y, size * 0.2, 0, Math.PI * 2)
    context.arc(x + size * 0.28, y, size * 0.2, 0, Math.PI * 2)
    context.moveTo(x - size * 0.08, y)
    context.lineTo(x + size * 0.08, y)
    context.stroke()
  } else if (sticker.type === 'crown') {
    context.fillStyle = '#FACC15'
    context.strokeStyle = '#F59E0B'
    context.lineWidth = Math.max(3, size * 0.035)
    context.beginPath()
    context.moveTo(x - size * 0.48, y + size * 0.28)
    context.lineTo(x - size * 0.42, y - size * 0.28)
    context.lineTo(x - size * 0.12, y)
    context.lineTo(x, y - size * 0.42)
    context.lineTo(x + size * 0.12, y)
    context.lineTo(x + size * 0.42, y - size * 0.28)
    context.lineTo(x + size * 0.48, y + size * 0.28)
    context.closePath()
    context.fill()
    context.stroke()
  } else if (sticker.type === 'star') {
    context.fillStyle = '#FDE047'
    context.strokeStyle = '#F59E0B'
    context.lineWidth = Math.max(3, size * 0.03)
    context.beginPath()
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? size * 0.48 : size * 0.21
      const angle = -Math.PI / 2 + (index * Math.PI) / 5
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      if (index === 0) context.moveTo(px, py)
      else context.lineTo(px, py)
    }
    context.closePath()
    context.fill()
    context.stroke()
  } else if (sticker.type === 'heart') {
    context.fillStyle = '#F43F5E'
    context.beginPath()
    context.moveTo(x, y + size * 0.42)
    context.bezierCurveTo(x - size * 0.58, y + size * 0.08, x - size * 0.48, y - size * 0.35, x - size * 0.2, y - size * 0.35)
    context.bezierCurveTo(x, y - size * 0.35, x, y - size * 0.12, x, y - size * 0.08)
    context.bezierCurveTo(x, y - size * 0.12, x, y - size * 0.35, x + size * 0.2, y - size * 0.35)
    context.bezierCurveTo(x + size * 0.48, y - size * 0.35, x + size * 0.58, y + size * 0.08, x, y + size * 0.42)
    context.fill()
  } else if (sticker.type === 'smile') {
    context.fillStyle = '#FACC15'
    context.beginPath()
    context.arc(x, y, size * 0.46, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#1E293B'
    context.beginPath()
    context.arc(x - size * 0.16, y - size * 0.1, size * 0.045, 0, Math.PI * 2)
    context.arc(x + size * 0.16, y - size * 0.1, size * 0.045, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#1E293B'
    context.lineWidth = Math.max(3, size * 0.035)
    context.beginPath()
    context.arc(x, y + size * 0.02, size * 0.22, 0.1 * Math.PI, 0.9 * Math.PI)
    context.stroke()
  }
  context.restore()
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, scaleX: number, scaleY: number) {
  if (stroke.points.length === 0) return
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = stroke.tool === 'eraser' ? '#020617' : stroke.color
  context.lineWidth = stroke.size * ((scaleX + scaleY) / 2)
  context.beginPath()
  context.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY)
  for (let index = 1; index < stroke.points.length; index += 1) context.lineTo(stroke.points[index].x * scaleX, stroke.points[index].y * scaleY)
  context.stroke()
  context.restore()
}

function exportAvatar(canvas: HTMLCanvasElement): string {
  const maxWidth = 720
  const scale = Math.min(1, maxWidth / canvas.width)
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(canvas.width * scale))
  output.height = Math.max(1, Math.round(canvas.height * scale))
  const context = output.getContext('2d')
  if (!context) throw new Error('无法导出头像')
  context.drawImage(canvas, 0, 0, output.width, output.height)
  let value = output.toDataURL('image/webp', 0.86)
  if (value.length > 950_000) value = output.toDataURL('image/jpeg', 0.8)
  if (value.length > 1_000_000) throw new Error('头像图片仍然过大，请减少自定义贴纸后重试')
  return value
}

export default function StudentAvatarPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>())
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const [activeTool, setActiveTool] = useState<Tool>('brush')
  const [activeColor, setActiveColor] = useState('#FFFFFF')
  const [brushSize, setBrushSize] = useState(8)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [coins, setCoins] = useState(0)
  const [saving, setSaving] = useState(false)
  const [renderVersion, setRenderVersion] = useState(0)

  const toolbarLabel = useMemo(() => {
    if (activeTool === 'move') return '移动贴纸'
    return activeTool === 'brush' ? `画笔 ${brushSize}px` : '橡皮擦'
  }, [activeTool, brushSize])

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrapper = canvasWrapRef.current
    if (!canvas || !wrapper) return
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
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, rect.height); context.stroke()
    }
    for (let y = 0; y < rect.height; y += 36) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(rect.width, y); context.stroke()
    }
    const scaleX = rect.width / CANVAS_WIDTH
    const scaleY = rect.height / CANVAS_HEIGHT
    for (const sticker of stickers) {
      if (sticker.type !== 'custom' || !sticker.imageUrl) {
        drawStickerShape(context, sticker, scaleX, scaleY)
        continue
      }
      let image = imageCacheRef.current.get(sticker.imageUrl)
      if (!image) {
        image = new Image()
        image.onload = () => setRenderVersion((value) => value + 1)
        image.src = sticker.imageUrl
        imageCacheRef.current.set(sticker.imageUrl, image)
      }
      if (image.complete && image.naturalWidth > 0) {
        const size = sticker.size * Math.min(scaleX, scaleY)
        context.save()
        context.beginPath()
        const left = sticker.x * scaleX - size / 2
        const top = sticker.y * scaleY - size / 2
        const radius = size * 0.12
        context.moveTo(left + radius, top)
        context.lineTo(left + size - radius, top)
        context.quadraticCurveTo(left + size, top, left + size, top + radius)
        context.lineTo(left + size, top + size - radius)
        context.quadraticCurveTo(left + size, top + size, left + size - radius, top + size)
        context.lineTo(left + radius, top + size)
        context.quadraticCurveTo(left, top + size, left, top + size - radius)
        context.lineTo(left, top + radius)
        context.quadraticCurveTo(left, top, left + radius, top)
        context.closePath()
        context.clip()
        context.drawImage(image, sticker.x * scaleX - size / 2, sticker.y * scaleY - size / 2, size, size)
        context.restore()
      }
    }
    strokes.forEach((stroke) => drawStroke(context, stroke, scaleX, scaleY))
  }, [stickers, strokes])

  useEffect(() => {
    renderCanvas()
    window.addEventListener('resize', renderCanvas)
    return () => window.removeEventListener('resize', renderCanvas)
  }, [renderCanvas, renderVersion])

  useEffect(() => {
    api.user.me().then((user) => setCoins(user.coins)).catch(() => undefined)
  }, [])

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>): Point | null {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH, y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT }
  }

  function stickerAt(point: Point): Sticker | undefined {
    return [...stickers].reverse().find((sticker) => Math.hypot(point.x - sticker.x, point.y - sticker.y) <= sticker.size * 0.6)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event)
    if (!point) return
    const hit = stickerAt(point)
    if (activeTool === 'move' || hit) {
      if (!hit) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { id: hit.id, dx: point.x - hit.x, dy: point.y - hit.y }
      setActiveTool('move')
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDrawing(true)
    setStrokes((prev) => [...prev, { tool: activeTool, color: activeColor, size: brushSize, points: [point] }])
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event)
    if (!point) return
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current
      setStickers((prev) => prev.map((sticker) => sticker.id === id ? {
        ...sticker,
        x: Math.max(sticker.size / 2, Math.min(CANVAS_WIDTH - sticker.size / 2, point.x - dx)),
        y: Math.max(sticker.size / 2, Math.min(CANVAS_HEIGHT - sticker.size / 2, point.y - dy)),
      } : sticker))
      return
    }
    if (!isDrawing) return
    setStrokes((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const latest = next[next.length - 1]
      next[next.length - 1] = { ...latest, points: [...latest.points, point] }
      return next
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setIsDrawing(false)
  }

  function addSticker(type: Exclude<StickerType, 'custom'>) {
    const offset = stickers.length * 28
    setStickers((prev) => [...prev, { id: `${type}-${Date.now()}-${prev.length}`, type, x: 500 + (offset % 180) - 90, y: 270 + (offset % 100), size: type === 'glasses' ? 150 : 130 }])
    setActiveTool('move')
    toast.success('贴纸已添加，可以直接拖动它')
  }

  function handleCustomSticker(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择 PNG、JPG 或 WebP 图片')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('图片不能超过 4 MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setStickers((prev) => [...prev, { id: `custom-${Date.now()}`, type: 'custom', imageUrl: reader.result as string, x: 500, y: 350, size: 180 }])
      setActiveTool('move')
      toast.success('自定义贴纸已添加，可以在画布上拖动')
    }
    reader.onerror = () => toast.error('读取图片失败，请换一张图片重试')
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    console.info('[avatar] save requested')
    const canvas = canvasRef.current
    if (saving) return
    if (!canvas) {
      toast.error('头像画布尚未准备好，请稍后再试')
      return
    }
    setSaving(true)
    try {
      renderCanvas()
      // renderCanvas is synchronous once the uploaded image has decoded. Do not wait on
      // requestAnimationFrame here: browsers pause animation frames for hidden/background tabs,
      // which could leave the Save button waiting forever.
      const customImageUrl = exportAvatar(canvas)
      toast.info('正在保存并穿戴头像…')
      const result = await api.user.updateAvatar({ type: 'custom', customImageUrl })
      setCoins(result.totalCoins)
      window.dispatchEvent(new CustomEvent('avatar-updated', { detail: result.avatarConfig }))
      toast.success('保存成功', { description: '新头像已经穿戴，返回学生首页即可看到。' })
      router.push('/student/dashboard?avatarUpdated=1')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存头像失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-4 text-white md:px-6">
      <div className="absolute inset-0 hero-grid opacity-35" />
      <div className="animate-aurora absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="animate-aurora absolute bottom-[-8rem] right-[-4rem] h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      <input id="avatar-sticker-upload" ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleCustomSticker} />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1500px] flex-col gap-4">
        <header className="glass-panel shadow-neon flex flex-col gap-4 rounded-[28px] border border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div><p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Avatar Forge</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">学生端虚拟人物工坊</h1></div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">当前工具 <span className="ml-2 font-semibold text-cyan-200">{toolbarLabel}</span></div>
            <div className="rounded-full border border-amber-300/15 bg-amber-400/10 px-4 py-2 text-sm text-amber-100"><Coins className="mr-2 inline h-4 w-4" />当前金币：{coins}</div>
          </div>
        </header>

        <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="glass-panel shadow-neon flex min-h-[700px] flex-col rounded-[32px] border border-white/10 p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Canvas Studio</p><h2 className="mt-2 text-xl font-semibold">自由涂鸦你的专属人物</h2></div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="rounded-full border border-white/10 bg-white/5 px-4 text-slate-200 hover:bg-white/10" onClick={() => setActiveTool('move')}><Move className="mr-2 h-4 w-4" />移动贴纸</Button>
                <Button type="button" variant="ghost" className="rounded-full border border-white/10 bg-white/5 px-4 text-slate-200 hover:bg-white/10" onClick={() => { setStrokes([]); setStickers([]); toast.success('画布已清空') }}><Wand2 className="mr-2 h-4 w-4" />清空画布</Button>
              </div>
            </div>
            <div ref={canvasWrapRef} className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#020617]">
              <div className="pointer-events-none absolute left-5 top-4 z-10 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-cyan-200/75">{activeTool === 'move' ? '拖动贴纸到喜欢的位置' : 'Draw Your Character'}</div>
              <canvas ref={canvasRef} className={`relative z-0 h-full min-h-[560px] w-full touch-none ${activeTool === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} />
            </div>
          </div>

          <aside className="glass-panel shadow-neon rounded-[32px] border border-white/10 p-5">
            <div><p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">Tool Bar</p><h2 className="mt-2 text-2xl font-semibold">创作控制台</h2></div>
            <div className="mt-6 space-y-6">
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200"><Palette className="h-4 w-4 text-cyan-300" />调色板</div>
                <div className="grid grid-cols-4 gap-2">
                  {palette.map((color) => <motion.button key={color} type="button" title={color} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => { setActiveTool('brush'); setActiveColor(color) }} className={`h-11 rounded-xl border transition ${activeColor === color && activeTool === 'brush' ? 'border-white ring-2 ring-cyan-300/70' : 'border-white/10'}`} style={{ backgroundColor: color }} />)}
                  <label className="relative flex h-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/30 bg-white/5" title="自定义颜色"><Palette className="h-5 w-5" /><input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={activeColor} onChange={(event) => { setActiveColor(event.target.value.toUpperCase()); setActiveTool('brush') }} /></label>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200"><Brush className="h-4 w-4 text-cyan-300" />画笔与编辑</div>
                <div className="grid grid-cols-2 gap-2">
                  {brushSizes.map((size) => <button key={size} type="button" onClick={() => { setActiveTool('brush'); setBrushSize(size) }} className={`rounded-xl border px-3 py-2 text-sm ${brushSize === size && activeTool === 'brush' ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.04]'}`}>{size}px</button>)}
                  <button type="button" onClick={() => setActiveTool('eraser')} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${activeTool === 'eraser' ? 'border-violet-300/40 bg-violet-400/10' : 'border-white/10 bg-white/[0.04]'}`}><Eraser className="h-4 w-4" />橡皮</button>
                  <button type="button" onClick={() => setActiveTool('move')} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${activeTool === 'move' ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.04]'}`}><Move className="h-4 w-4" />移动</button>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-200"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300" />好玩贴纸</span>{stickers.length > 0 && <button type="button" onClick={() => setStickers((prev) => prev.slice(0, -1))} className="flex items-center gap-1 text-xs text-rose-300"><Trash2 className="h-3.5 w-3.5" />撤销贴纸</button>}</div>
                <div className="grid grid-cols-2 gap-2">
                  {stickerOptions.map((sticker) => { const Icon = sticker.icon; return <motion.button data-testid={`sticker-${sticker.type}`} key={sticker.type} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => addSticker(sticker.type)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-white/[0.08]"><Icon className="h-5 w-5 text-cyan-200" /><p className="mt-2 text-sm font-medium text-white">{sticker.label}</p><p className="mt-1 text-[11px] text-slate-400">添加后可拖动</p></motion.button> })}
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-400/10 px-4 py-4 text-left hover:bg-cyan-400/15"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300/15"><ImagePlus className="h-5 w-5 text-cyan-200" /></div><div><p className="text-sm font-medium">添加自己的贴纸</p><p className="mt-1 text-xs text-slate-400">从电脑选择 PNG、JPG 或 WebP</p></div><Upload className="ml-auto h-4 w-4 text-cyan-200" /></button>
              </section>
            </div>
          </aside>
        </section>

        <footer className="glass-panel shadow-neon sticky bottom-3 z-30 flex flex-col gap-4 rounded-[28px] border border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="rounded-full border border-amber-300/15 bg-amber-400/10 px-4 py-2 text-sm text-amber-100"><Coins className="mr-2 inline h-4 w-4" />当前金币：{coins}</div>
          <button
            data-testid="avatar-save"
            type="button"
            disabled={saving}
            onPointerUp={(event) => {
              event.preventDefault()
              void handleSave()
            }}
            onClick={() => void handleSave()}
            className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 px-6 text-sm font-medium text-white shadow-[0_12px_30px_rgba(124,58,237,0.35)] transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
          >
            <Sparkles className="mr-2 h-4 w-4" />{saving ? '正在保存…' : '保存并穿戴'}
          </button>
        </footer>
      </div>
    </main>
  )
}
