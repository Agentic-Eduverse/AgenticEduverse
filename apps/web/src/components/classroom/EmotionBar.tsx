'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { HelpCircle, Smile, RefreshCw, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import type { EmotionType } from '@eduverse/shared'
import { EMOTION_META } from '@/lib/emotion-meta'

interface EmotionBarProps {
  onEmotion: (emotion: EmotionType) => void
  disabled?: boolean
}

const EMOTIONS: { type: EmotionType; icon: React.ElementType }[] = [
  { type: 'confused', icon: HelpCircle },
  { type: 'happy', icon: Smile },
  { type: 'repeat', icon: RefreshCw },
  { type: 'idea', icon: Lightbulb },
]

export default function EmotionBar({ onEmotion, disabled = false }: EmotionBarProps) {
  const [lastSent, setLastSent] = useState<Record<string, number>>({})

  const handleEmotion = useCallback(
    (emotion: EmotionType) => {
      const now = Date.now()
      if (lastSent[emotion] && now - lastSent[emotion] < 3000) {
        toast.warning('请稍候再发送同样的情感反馈')
        return
      }

      setLastSent((prev) => ({ ...prev, [emotion]: now }))
      onEmotion(emotion)

      const meta = (EMOTION_META as Record<string, { emoji: string; label: string }>)[emotion]
      toast.success(`已发送：${meta?.emoji} ${meta?.label || emotion}`)
    },
    [lastSent, onEmotion]
  )

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-600">课堂情感反馈</div>
        <div className="text-xs text-slate-400">点击按钮即时反馈给老师</div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {EMOTIONS.map(({ type, icon: Icon }) => {
          const meta = (EMOTION_META as Record<string, { emoji: string; label: string; color: string }>)[type]
          const isCooling = Boolean(lastSent[type] && Date.now() - lastSent[type] < 3000)
          return (
            <Button
              key={type}
              variant="outline"
              disabled={disabled || isCooling}
              onClick={() => handleEmotion(type)}
              className="h-auto py-3 flex-col gap-1 transition-all hover:scale-105"
              style={{
                borderColor: meta?.color,
                backgroundColor: isCooling ? undefined : `${meta?.color}10`,
              }}
            >
              <Icon
                className="h-6 w-6"
                style={{ color: meta?.color }}
              />
              <span className="text-xs font-medium">{meta?.emoji} {meta?.label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
