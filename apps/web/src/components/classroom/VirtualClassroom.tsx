'use client'

import { useEffect, useRef } from 'react'
import {
  Application,
  Container,
  Graphics,
  Text,
  Ticker,
  TextStyle,
  Sprite,
  Assets,
} from 'pixi.js'
import type { Participant, EmotionType } from '@eduverse/shared'
import { EMOTION_META } from '@/lib/emotion-meta'

interface VirtualClassroomProps {
  title: string
  participants: Participant[]
  emotions: Record<string, EmotionType>
  currentUserId: string
  isTeacher: boolean
  highlightedUserId?: string | null
}

interface AvatarConfig {
  skin: string
  hairStyle: string
  hairColor: string
  customImageUrl?: string
}

const DEFAULT_SKIN_COLORS = ['#FFDFC4', '#F0D5BE', '#D4A574', '#C68642', '#8D5524']
const DEFAULT_HAIR_COLORS = ['#2C1810', '#4A3728', '#8B4513', '#D4A574', '#FFD700', '#FF69B4', '#87CEEB']

function getAvatarConfig(participant: Participant): AvatarConfig {
  const config = (participant as { avatarConfig?: AvatarConfig }).avatarConfig
  const hash = participant.userId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  return {
    skin: config?.skin || DEFAULT_SKIN_COLORS[hash % DEFAULT_SKIN_COLORS.length],
    hairStyle: config?.hairStyle || ['short', 'long', 'curly'][hash % 3],
    hairColor: config?.hairColor || DEFAULT_HAIR_COLORS[hash % DEFAULT_HAIR_COLORS.length],
    customImageUrl: typeof config?.customImageUrl === 'string' ? config.customImageUrl : undefined,
  }
}

function drawHair(
  graphics: Graphics,
  style: string,
  color: string,
  cx: number,
  cy: number,
  r: number
) {
  graphics.beginFill(color)
  switch (style) {
    case 'short':
      graphics.drawRoundedRect(cx - r, cy - r - r * 0.2, r * 2, r * 0.6, 8)
      break
    case 'long':
      graphics.drawRoundedRect(cx - r * 0.9, cy - r - r * 0.2, r * 1.8, r * 1.2, 8)
      break
    case 'curly':
      for (let i = 0; i < 5; i++) {
        const angle = (-Math.PI * 0.8) + (i * (Math.PI * 1.6)) / 4
        const hx = cx + Math.cos(angle) * r * 0.9
        const hy = cy - r * 0.3 + Math.sin(angle) * r * 0.4
        graphics.drawCircle(hx, hy, r * 0.35)
      }
      break
  }
  graphics.endFill()
}

export default function VirtualClassroom({
  title,
  participants,
  emotions,
  currentUserId,
  isTeacher,
  highlightedUserId,
}: VirtualClassroomProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const isReadyRef = useRef(false)
  const stageContainerRef = useRef<Container | null>(null)
  const bubblesRef = useRef<Map<string, { container: Container; startTime: number }>>(new Map())
  const prevEmotionsRef = useRef<Partial<Record<string, EmotionType>>>({})
  const tickerCallbacksRef = useRef<Set<() => void>>(new Set())
  const renderStageRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!containerRef.current) return
    const host = containerRef.current

    const app = new Application()
    appRef.current = app
    const tickerCallbacks = tickerCallbacksRef.current
    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    ;(async () => {
      try {
        await app.init({ background: 0xfafafa, antialias: true })
      } catch (error) {
        if (!disposed) console.error('[virtual-classroom] Pixi initialization failed', error)
        return
      }

      if (disposed) {
        app.destroy(true, { children: true, texture: true })
        return
      }
      isReadyRef.current = true

      host.appendChild(app.canvas as unknown as Node)

      const resize = () => {
        const w = host.clientWidth
        const h = host.clientHeight
        app.renderer.resize(w, h)
        renderStageRef.current()
      }

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
      resize()
    })()

    return () => {
      disposed = true
      isReadyRef.current = false
      resizeObserver?.disconnect()
      for (const callback of tickerCallbacks) app.ticker.remove(callback)
      tickerCallbacks.clear()
      if (app.renderer) app.destroy(true, { children: true, texture: true })
      appRef.current = null
    }
  }, [])

  const renderStage = () => {
    const app = appRef.current
    if (!app || !isReadyRef.current || !containerRef.current) return

    const stage = app.stage
    for (const callback of tickerCallbacksRef.current) app.ticker.remove(callback)
    tickerCallbacksRef.current.clear()
    if (stageContainerRef.current) {
      stage.removeChild(stageContainerRef.current)
    }
    const stageContainer = new Container()
    stageContainerRef.current = stageContainer
    stage.addChild(stageContainer)

    const w = app.canvas.width
    const h = app.canvas.height

    const bg = new Graphics()
    bg.beginFill(0xf5f3ff)
    bg.drawRoundedRect(0, 0, w, h, 12)
    bg.endFill()
    bg.beginFill(0xede9fe)
    bg.drawRoundedRect(8, 8, w - 16, h - 16, 8)
    bg.endFill()
    stageContainer.addChild(bg)

    const blackboard = new Graphics()
    blackboard.beginFill(0x1e3a5f)
    blackboard.drawRoundedRect(w * 0.2, 40, w * 0.6, 80, 8)
    blackboard.endFill()
    blackboard.beginFill(0x2d5a87)
    blackboard.drawRoundedRect(w * 0.2 + 6, 46, w * 0.6 - 12, 68, 4)
    blackboard.endFill()
    stageContainer.addChild(blackboard)

    const bbText = new Text({
      text: title,
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'system-ui, sans-serif',
      }),
    })
    bbText.x = w / 2 - bbText.width / 2
    bbText.y = 72
    stageContainer.addChild(bbText)

    const teacher = participants.find((p) => p.role === 'teacher')
    if (teacher) {
      drawParticipant(
        stageContainer,
        teacher,
        w / 2,
        170,
        50,
        true,
        currentUserId,
        emotions[teacher.userId],
        highlightedUserId === teacher.userId
      )
    }

    const students = participants.filter((p) => p.role !== 'teacher')
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(students.length * 1.5))))
    const rows = Math.ceil(students.length / cols)

    const seatW = Math.min(160, (w - 80) / cols)
    const seatH = 130
    const totalW = cols * seatW
    const startX = (w - totalW) / 2 + seatW / 2
    const startY = 280

    students.forEach((student, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = startX + col * seatW
      const y = startY + row * seatH
      drawParticipant(
        stageContainer,
        student,
        x,
        y,
        35,
        false,
        currentUserId,
        emotions[student.userId],
        highlightedUserId === student.userId
      )
    })
  }
  renderStageRef.current = renderStage

  const drawParticipant = (
    parent: Container,
    participant: Participant,
    x: number,
    y: number,
    radius: number,
    isTeacherSeat: boolean,
    currentUserId: string,
    emotion: EmotionType | undefined,
    isHighlighted: boolean
  ) => {
    const avatarCfg = getAvatarConfig(participant)
    const isSelf = participant.userId === currentUserId

    const borderColor = isHighlighted
      ? 0x22c55e
      : isSelf
      ? 0x3b82f6
      : isTeacherSeat
      ? 0xfbbf24
      : 0xd1d5db
    const borderWidth = isSelf || isTeacherSeat || isHighlighted ? 4 : 2

    const border = new Graphics()
    border.lineStyle(borderWidth, borderColor, 1)
    border.beginFill(avatarCfg.skin)
    border.drawCircle(x, y, radius)
    border.endFill()
    parent.addChild(border)

    if (avatarCfg.customImageUrl) {
      // Custom forge avatars are stored as data URLs. Loading is asynchronous in Pixi, so add
      // the sprite when ready and redraw the stage only if the participant is still present.
      void Assets.load(avatarCfg.customImageUrl).then((texture) => {
        if (!parent || parent.destroyed) return
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5)
        sprite.x = x
        sprite.y = y
        const diameter = radius * 1.82
        const sourceWidth = Math.max(1, texture.width)
        const sourceHeight = Math.max(1, texture.height)
        const scale = Math.max(diameter / sourceWidth, diameter / sourceHeight)
        sprite.scale.set(scale)
        const mask = new Graphics()
        mask.beginFill(0xffffff)
        mask.drawCircle(x, y, radius * 0.9)
        mask.endFill()
        parent.addChild(mask)
        parent.addChild(sprite)
        sprite.mask = mask
      }).catch(() => undefined)
    } else {
      drawHair(border, avatarCfg.hairStyle, avatarCfg.hairColor, x, y - radius * 0.3, radius * 0.9)

      const eyes = new Graphics()
      eyes.beginFill(0x1f2937)
      eyes.drawCircle(x - radius * 0.25, y - radius * 0.05, radius * 0.08)
      eyes.drawCircle(x + radius * 0.25, y - radius * 0.05, radius * 0.08)
      eyes.endFill()
      parent.addChild(eyes)

      const mouth = new Graphics()
      mouth.lineStyle(2, 0x1f2937, 1)
      mouth.arc(x, y + radius * 0.2, radius * 0.15, 0, Math.PI)
      parent.addChild(mouth)
    }

    const nameText = new Text({
      text: participant.name,
      style: new TextStyle({
        fill: 0x374151,
        fontSize: 12,
        fontWeight: '600',
        fontFamily: 'system-ui, sans-serif',
      }),
    })
    nameText.x = x - nameText.width / 2
    nameText.y = y + radius + 8
    parent.addChild(nameText)

    if (emotion && emotion !== prevEmotionsRef.current[participant.userId]) {
      showEmotionBubble(parent, x, y - radius, emotion, participant.userId)
    }

    prevEmotionsRef.current[participant.userId] = emotion
  }

  const showEmotionBubble = (
    parent: Container,
    x: number,
    y: number,
    emotion: EmotionType,
    userId: string
  ) => {
    const meta = (EMOTION_META as Record<string, { emoji: string; color: string }>)[emotion]
    if (!meta) return

    const existing = bubblesRef.current.get(userId)
    if (existing && parent.children.includes(existing.container)) {
      parent.removeChild(existing.container)
    }

    const bubble = new Container()
    const bg = new Graphics()
    bg.beginFill(0xffffff)
    bg.lineStyle(2, parseInt(meta.color.replace('#', ''), 16), 1)
    bg.drawRoundedRect(-22, -22, 44, 44, 12)
    bg.endFill()
    bubble.addChild(bg)

    const emojiText = new Text({
      text: meta.emoji,
      style: new TextStyle({ fontSize: 24 }),
    })
    emojiText.x = -emojiText.width / 2
    emojiText.y = -emojiText.height / 2
    bubble.addChild(emojiText)

    bubble.x = x + 20
    bubble.y = y - 10
    bubble.scale.set(0.3)
    bubble.alpha = 0
    parent.addChild(bubble)

    const startTime = performance.now()
    bubblesRef.current.set(userId, { container: bubble, startTime })

    const ticker = appRef.current?.ticker
    if (!ticker) return

    const bounceDuration = 300
    const fadeDuration = 2000

    const onTick = () => {
      const elapsed = performance.now() - startTime
      const bounceT = Math.min(1, elapsed / bounceDuration)
      const bounceScale = 1 + Math.sin(bounceT * Math.PI) * 0.3
      bubble.scale.set(0.3 + bounceT * 0.7 * bounceScale)
      bubble.alpha = bounceT

      if (elapsed > bounceDuration && elapsed < bounceDuration + fadeDuration) {
        const fadeT = (elapsed - bounceDuration) / fadeDuration
        bubble.alpha = 1 - fadeT
      }

      if (elapsed > bounceDuration + fadeDuration) {
        ticker.remove(onTick)
        tickerCallbacksRef.current.delete(onTick)
        if (parent.children.includes(bubble)) {
          parent.removeChild(bubble)
        }
        bubblesRef.current.delete(userId)
      }
    }
    ticker.add(onTick)
    tickerCallbacksRef.current.add(onTick)
  }

  useEffect(() => {
    if (!appRef.current || !isReadyRef.current) {
      const timeout = setTimeout(() => renderStageRef.current(), 100)
      return () => clearTimeout(timeout)
    }
    renderStageRef.current()
  }, [participants, emotions, currentUserId, highlightedUserId, isTeacher, title])

  return (
    <div
      ref={containerRef}
      className="w-full aspect-[16/10] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"
      style={{ minHeight: 400 }}
    />
  )
}
